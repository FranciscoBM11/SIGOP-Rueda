'use strict';

// CitasRepository: único lugar con SQL sobre dbo.citas.
const { sql } = require('../../config/base-datos');

// Cita con su servicio, turno y paciente. Fechas y horas como texto ('AAAA-MM-DD', 'HH:MM').
const SELECT_CITA = `SELECT c.id, c.codigo, c.estado, c.turno_id, c.servicio_id,
       s.nombre AS servicio, s.indicaciones_previas AS indicaciones,
       p.nombres, p.correo, p.cedula,
       CONVERT(char(10), t.fecha, 23)       AS fecha,
       CONVERT(char(5), t.hora_inicio, 108) AS hora_inicio,
       CONVERT(char(5), t.hora_fin, 108)    AS hora_fin,
       CASE WHEN EXISTS (SELECT 1 FROM dbo.fichas_triaje f WHERE f.cita_id = c.id) THEN 1 ELSE 0 END AS tiene_triaje`;

const FROM_CITA = `FROM dbo.citas c
             JOIN dbo.pacientes p ON p.id = c.paciente_id
             JOIN dbo.servicios s ON s.id = c.servicio_id
             JOIN dbo.turnos t    ON t.id = c.turno_id`;

const aFechaSql = (iso) => new Date(`${iso}T00:00:00Z`);

function mapearCita(f) {
  if (!f) return null;
  return {
    id: f.id,
    codigo: f.codigo,
    estado: f.estado,
    turnoId: f.turno_id,
    servicioId: f.servicio_id,
    servicio: f.servicio,
    indicaciones: f.indicaciones,
    nombres: f.nombres,
    correo: f.correo,
    cedula: f.cedula,
    fecha: f.fecha,
    horaInicio: f.hora_inicio,
    horaFin: f.hora_fin,
    tieneTriaje: Boolean(f.tiene_triaje),
  };
}

function crearCitasRepository({ obtenerPool } = {}) {
  return {
    /** RN-04: la cita cuyo código y cédula coinciden, o null. */
    async buscarPorCedulaYCodigo(cedula, codigo) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .input('codigo', sql.Char(8), codigo)
        .query(
          `${SELECT_CITA}
             FROM dbo.citas c
             JOIN dbo.pacientes p ON p.id = c.paciente_id
             JOIN dbo.servicios s ON s.id = c.servicio_id
             JOIN dbo.turnos t    ON t.id = c.turno_id
            WHERE c.codigo = @codigo AND p.cedula = @cedula`,
        );
      return mapearCita(r.recordset[0]);
    },

    /**
     * Lee la cita dentro de la transacción y bloquea su fila hasta el commit.
     * Se busca por id (token de cita) o por código (panel del personal).
     * @param {{ id?: number, codigo?: string }} clave
     */
    async bloquear(tx, clave) {
      const { id, codigo } = clave;
      const peticion = tx.request();
      let filtro;
      if (id != null) {
        peticion.input('id', sql.Int, id);
        filtro = 'c.id = @id';
      } else {
        peticion.input('codigo', sql.Char(8), codigo);
        filtro = 'c.codigo = @codigo';
      }
      const r = await peticion.query(
        `${SELECT_CITA}
           FROM dbo.citas c WITH (UPDLOCK, HOLDLOCK)
           JOIN dbo.pacientes p ON p.id = c.paciente_id
           JOIN dbo.servicios s ON s.id = c.servicio_id
           JOIN dbo.turnos t    ON t.id = c.turno_id
          WHERE ${filtro}`,
      );
      return mapearCita(r.recordset[0]);
    },

    /** La cita por su código, sin bloquear (panel del personal), o null. */
    async buscarPorCodigo(codigo) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('codigo', sql.Char(8), codigo)
        .query(`${SELECT_CITA} ${FROM_CITA} WHERE c.codigo = @codigo`);
      return mapearCita(r.recordset[0]);
    },

    /**
     * CU-11: citas de una fecha (incluidas las canceladas), ordenadas por hora.
     * Nunca incluye respuestas del triaje (RN-16).
     */
    async listarAgenda(fecha) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('fecha', sql.Date, aFechaSql(fecha))
        .query(
          `${SELECT_CITA} ${FROM_CITA}
            WHERE t.fecha = @fecha
            ORDER BY t.hora_inicio, CASE WHEN c.estado = 'CANCELADA' THEN 1 ELSE 0 END, c.codigo`,
        );
      return r.recordset.map(mapearCita);
    },

    async actualizarEstado(tx, id, estado) {
      await tx
        .request()
        .input('id', sql.Int, id)
        .input('estado', sql.VarChar(12), estado)
        .query('UPDATE dbo.citas SET estado = @estado WHERE id = @id');
    },

    /** Reprogramación (CU-07): nuevo turno, mismo código; cuenta la reprogramación. */
    async cambiarTurno(tx, id, turnoId) {
      await tx
        .request()
        .input('id', sql.Int, id)
        .input('turnoId', sql.Int, turnoId)
        .query(
          `UPDATE dbo.citas
              SET turno_id = @turnoId,
                  reprogramaciones = CASE WHEN reprogramaciones < 255 THEN reprogramaciones + 1 ELSE 255 END
            WHERE id = @id`,
        );
    },

    /** ¿Existe ya una cita con ese código? Bloquea el valor hasta el commit. */
    async codigoExiste(tx, codigo) {
      const r = await tx
        .request()
        .input('codigo', sql.Char(8), codigo)
        .query('SELECT 1 AS existe FROM dbo.citas WITH (UPDLOCK, HOLDLOCK) WHERE codigo = @codigo');
      return r.recordset.length > 0;
    },

    /** Inserta la cita en estado CONFIRMADA (valor por defecto de la tabla). */
    async insertar(tx, { codigo, pacienteId, turnoId, servicioId, consentimientoVersion }) {
      const r = await tx
        .request()
        .input('codigo', sql.Char(8), codigo)
        .input('pacienteId', sql.Int, pacienteId)
        .input('turnoId', sql.Int, turnoId)
        .input('servicioId', sql.Int, servicioId)
        .input('version', sql.VarChar(10), consentimientoVersion)
        .query(
          `INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id,
                                  consentimiento_aceptado, consentimiento_version)
           OUTPUT INSERTED.id
           VALUES (@codigo, @pacienteId, @turnoId, @servicioId, 1, @version)`,
        );
      return r.recordset[0].id;
    },
  };
}

module.exports = { crearCitasRepository };
