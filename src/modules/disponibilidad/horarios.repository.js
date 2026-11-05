'use strict';

// HorariosRepository: SQL de dbo.horarios_laborales y el reajuste de los
// turnos futuros cuando la médica cambia su disponibilidad (CU-16, RN-10).
// Todas las escrituras van dentro de la transacción del servicio.
const { sql } = require('../../config/base-datos');

const aFechaSql = (iso) => new Date(`${iso}T00:00:00Z`);

function mapearHorario(f) {
  return {
    id: f.id,
    diaSemana: f.dia_semana,
    apertura: f.hora_apertura,
    cierre: f.hora_cierre,
    duracion: f.duracion_turno,
    activo: Boolean(f.activo),
  };
}

const COLUMNAS_HORARIO = `id, dia_semana,
       CONVERT(char(5), hora_apertura, 108) AS hora_apertura,
       CONVERT(char(5), hora_cierre, 108)   AS hora_cierre,
       duracion_turno, activo`;

// Un turno encaja en el horario si el día está activo y el turno cae en la
// cuadrícula: dentro de apertura-cierre, con la duración vigente y empezando
// en apertura + k × duración.
const ENCAJA = `h.activo = 1
            AND t.hora_inicio >= h.hora_apertura
            AND t.hora_fin <= h.hora_cierre
            AND DATEDIFF(MINUTE, t.hora_inicio, t.hora_fin) = h.duracion_turno
            AND DATEDIFF(MINUTE, h.hora_apertura, t.hora_inicio) % h.duracion_turno = 0`;

function crearHorariosRepository({ obtenerPool } = {}) {
  /** @param {object} ejecutor pool o transacción */
  async function citasFueraDeHorario(ejecutor, medicoId, desde) {
    const r = await ejecutor
      .request()
      .input('medicoId', sql.Int, medicoId)
      .input('desde', sql.Date, aFechaSql(desde))
      .query(
        `SELECT c.codigo, c.estado, s.nombre AS servicio,
                CONVERT(char(10), t.fecha, 23)       AS fecha,
                CONVERT(char(5), t.hora_inicio, 108) AS hora_inicio,
                CONVERT(char(5), t.hora_fin, 108)    AS hora_fin
           FROM dbo.citas c
           JOIN dbo.turnos t             ON t.id = c.turno_id
           JOIN dbo.horarios_laborales h ON h.id = t.horario_id
           JOIN dbo.servicios s          ON s.id = c.servicio_id
          WHERE h.medico_id = @medicoId
            AND t.fecha >= @desde
            AND t.habilitado = 0
            AND c.estado <> 'CANCELADA'
          ORDER BY t.fecha, t.hora_inicio`,
      );
    return r.recordset.map((f) => ({
      codigo: f.codigo,
      estado: f.estado,
      servicio: f.servicio,
      fecha: f.fecha,
      horaInicio: f.hora_inicio,
      horaFin: f.hora_fin,
    }));
  }

  return {
    /** Horarios de la médica (uno por día configurado, activo o no). */
    async listar(medicoId) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('medicoId', sql.Int, medicoId)
        .query(`SELECT ${COLUMNAS_HORARIO} FROM dbo.horarios_laborales WHERE medico_id = @medicoId ORDER BY dia_semana`);
      return r.recordset.map(mapearHorario);
    },

    /** Igual que listar, pero bloquea las filas hasta el commit (dos guardados a la vez). */
    async bloquear(tx, medicoId) {
      const r = await tx
        .request()
        .input('medicoId', sql.Int, medicoId)
        .query(
          `SELECT ${COLUMNAS_HORARIO} FROM dbo.horarios_laborales WITH (UPDLOCK, HOLDLOCK)
            WHERE medico_id = @medicoId ORDER BY dia_semana`,
        );
      return r.recordset.map(mapearHorario);
    },

    async actualizar(tx, id, { apertura, cierre, duracion, activo }) {
      await tx
        .request()
        .input('id', sql.Int, id)
        .input('apertura', sql.VarChar(5), apertura)
        .input('cierre', sql.VarChar(5), cierre)
        .input('duracion', sql.TinyInt, duracion)
        .input('activo', sql.Bit, activo)
        .query(
          `UPDATE dbo.horarios_laborales
              SET hora_apertura = CAST(@apertura AS time(0)),
                  hora_cierre = CAST(@cierre AS time(0)),
                  duracion_turno = @duracion,
                  activo = @activo
            WHERE id = @id`,
        );
    },

    async desactivar(tx, id) {
      await tx.request().input('id', sql.Int, id).query('UPDATE dbo.horarios_laborales SET activo = 0 WHERE id = @id');
    },

    async insertar(tx, medicoId, { diaSemana, apertura, cierre, duracion }) {
      await tx
        .request()
        .input('medicoId', sql.Int, medicoId)
        .input('dia', sql.TinyInt, diaSemana)
        .input('apertura', sql.VarChar(5), apertura)
        .input('cierre', sql.VarChar(5), cierre)
        .input('duracion', sql.TinyInt, duracion)
        .query(
          `INSERT INTO dbo.horarios_laborales (medico_id, dia_semana, hora_apertura, hora_cierre, duracion_turno)
           VALUES (@medicoId, @dia, CAST(@apertura AS time(0)), CAST(@cierre AS time(0)), @duracion)`,
        );
    },

    /**
     * CU-16 paso 6, desde `desde` (mañana) en adelante:
     * 1) habilita los turnos que encajan en el nuevo horario y deshabilita los demás;
     * 2) borra los deshabilitados que nunca tuvieron cita (los que tienen
     *    historial se conservan deshabilitados por la llave foránea de citas).
     * Las citas no se tocan (E2).
     */
    async reajustarTurnos(tx, medicoId, desde) {
      await tx
        .request()
        .input('medicoId', sql.Int, medicoId)
        .input('desde', sql.Date, aFechaSql(desde))
        .query(
          `UPDATE t
              SET habilitado = CASE WHEN ${ENCAJA} THEN 1 ELSE 0 END
             FROM dbo.turnos t
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE h.medico_id = @medicoId AND t.fecha >= @desde;

           DELETE t
             FROM dbo.turnos t
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE h.medico_id = @medicoId AND t.fecha >= @desde
              AND t.habilitado = 0
              AND NOT EXISTS (SELECT 1 FROM dbo.citas c WHERE c.turno_id = t.id);`,
        );
    },

    /** Último día que ya tiene turnos generados para la médica, o null. */
    async ultimaFechaConTurnos(tx, medicoId) {
      const r = await tx
        .request()
        .input('medicoId', sql.Int, medicoId)
        .query(
          `SELECT CONVERT(char(10), MAX(t.fecha), 23) AS fecha
             FROM dbo.turnos t
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE h.medico_id = @medicoId`,
        );
      return r.recordset[0]?.fecha ?? null;
    },

    /** Crea con sp_generar_turnos los turnos del nuevo horario que falten en el rango. */
    async generarTurnos(tx, desde, hasta) {
      await tx
        .request()
        .input('desde', sql.Date, aFechaSql(desde))
        .input('hasta', sql.Date, aFechaSql(hasta))
        .execute('dbo.sp_generar_turnos');
    },

    /** CU-16 E2: citas activas en turnos que quedaron fuera del horario. */
    async citasFueraDeHorario(medicoId, desde, tx) {
      return citasFueraDeHorario(tx ?? (await obtenerPool()), medicoId, desde);
    },
  };
}

module.exports = { crearHorariosRepository };
