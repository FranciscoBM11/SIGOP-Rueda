'use strict';

// TurnosRepository: generación (sp_generar_turnos), consulta y bloqueo de turnos.
// Fechas y horas se devuelven como texto ('AAAA-MM-DD', 'HH:MM') desde SQL
// para no depender de la zona horaria del servidor.
const { sql } = require('../../config/base-datos');

const aFechaSql = (iso) => new Date(`${iso}T00:00:00Z`);

const COLUMNAS = `t.id,
       CONVERT(char(10), t.fecha, 23)      AS fecha,
       CONVERT(char(5), t.hora_inicio, 108) AS hora_inicio,
       CONVERT(char(5), t.hora_fin, 108)    AS hora_fin`;

/**
 * RN-01: el turno está ocupado si él, u otro turno de la misma médica que se
 * le cruza en horario, tiene una cita activa. El cruce aparece cuando la
 * médica cambia la duración de los turnos (CU-16) y se conservan citas con
 * la duración anterior. `bloqueo` agrega UPDLOCK, HOLDLOCK dentro de una transacción.
 */
function ocupado(bloqueo = '') {
  return `CASE WHEN EXISTS (
             SELECT 1
               FROM dbo.turnos t2 ${bloqueo}
               JOIN dbo.horarios_laborales h2 ON h2.id = t2.horario_id
               JOIN dbo.citas c ${bloqueo} ON c.turno_id = t2.id AND c.estado <> 'CANCELADA'
              WHERE t2.fecha = t.fecha
                AND h2.medico_id = h.medico_id
                AND t2.hora_inicio < t.hora_fin
                AND t2.hora_fin > t.hora_inicio)
          THEN 1 ELSE 0 END AS ocupado`;
}

function crearTurnosRepository({ obtenerPool }) {
  return {
    /** Crea los turnos que falten en el rango según horarios_laborales (RN-10). */
    async generar(desde, hasta) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('desde', sql.Date, aFechaSql(desde))
        .input('hasta', sql.Date, aFechaSql(hasta))
        .execute('dbo.sp_generar_turnos');
    },

    /** Fechas del rango que ya tienen turnos (habilitados o no). @returns {Promise<Set<string>>} */
    async fechasConTurnos(desde, hasta) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('desde', sql.Date, aFechaSql(desde))
        .input('hasta', sql.Date, aFechaSql(hasta))
        .query(
          `SELECT DISTINCT CONVERT(char(10), t.fecha, 23) AS fecha
             FROM dbo.turnos t
            WHERE t.fecha BETWEEN @desde AND @hasta`,
        );
      return new Set(r.recordset.map((f) => f.fecha));
    },

    /**
     * Turnos habilitados del rango, con indicador de ocupado (RN-01).
     * CU-16: al cambiar el horario se deshabilitan los turnos que ya no encajan.
     */
    async listar(desde, hasta) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('desde', sql.Date, aFechaSql(desde))
        .input('hasta', sql.Date, aFechaSql(hasta))
        .query(
          `SELECT ${COLUMNAS}, ${ocupado()}
             FROM dbo.turnos t
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE t.fecha BETWEEN @desde AND @hasta
              AND t.habilitado = 1
            ORDER BY t.fecha, t.hora_inicio`,
        );
      return r.recordset;
    },

    /**
     * Lee el turno dentro de la transacción y lo bloquea (UPDLOCK) hasta el
     * commit, para que dos pacientes no puedan reservarlo a la vez (RN-01).
     */
    async bloquearParaReserva(tx, turnoId) {
      const r = await tx
        .request()
        .input('id', sql.Int, turnoId)
        .query(
          `SELECT ${COLUMNAS}, t.habilitado, ${ocupado('WITH (UPDLOCK, HOLDLOCK)')}
             FROM dbo.turnos t WITH (UPDLOCK, HOLDLOCK)
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE t.id = @id`,
        );
      return r.recordset[0] ?? null;
    },
  };
}

module.exports = { crearTurnosRepository };
