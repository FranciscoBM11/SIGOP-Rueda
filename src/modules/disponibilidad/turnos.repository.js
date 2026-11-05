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

    /** Turnos habilitados del rango, con indicador de cita activa (RN-01). */
    async listar(desde, hasta) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('desde', sql.Date, aFechaSql(desde))
        .input('hasta', sql.Date, aFechaSql(hasta))
        .query(
          `SELECT ${COLUMNAS},
                  CASE WHEN EXISTS (SELECT 1 FROM dbo.citas c
                                     WHERE c.turno_id = t.id AND c.estado <> 'CANCELADA')
                       THEN 1 ELSE 0 END AS ocupado
             FROM dbo.turnos t
             JOIN dbo.horarios_laborales h ON h.id = t.horario_id
            WHERE t.fecha BETWEEN @desde AND @hasta
              AND t.habilitado = 1 AND h.activo = 1
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
          `SELECT ${COLUMNAS}, t.habilitado,
                  CASE WHEN EXISTS (SELECT 1 FROM dbo.citas c WITH (UPDLOCK, HOLDLOCK)
                                     WHERE c.turno_id = t.id AND c.estado <> 'CANCELADA')
                       THEN 1 ELSE 0 END AS ocupado
             FROM dbo.turnos t WITH (UPDLOCK, HOLDLOCK)
            WHERE t.id = @id`,
        );
      return r.recordset[0] ?? null;
    },
  };
}

module.exports = { crearTurnosRepository };
