'use strict';

// InformesRepository: único lugar con SQL sobre dbo.informes_resultado.
// El archivo se guarda y se lee siempre cifrado; descifrar es tarea del servicio.
const { sql } = require('../../config/base-datos');

// fecha_carga está en UTC (DATETIME2): se entrega como ISO 8601 con «Z».
const FECHA_CARGA = `CONVERT(char(19), i.fecha_carga, 126) + 'Z' AS fecha_carga`;

function mapearInforme(f) {
  return { id: f.id, nombre: f.nombre_archivo, tamanoBytes: f.tamano_bytes, fechaCarga: f.fecha_carga };
}

function crearInformesRepository({ obtenerPool } = {}) {
  return {
    /** CU-15 paso 5. @returns {Promise<object>} el informe guardado (sin el archivo) */
    async insertar({ citaId, cargadoPor, nombre, tamanoBytes, archivoCifrado, hashSha256 }) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('citaId', sql.Int, citaId)
        .input('cargadoPor', sql.Int, cargadoPor)
        .input('nombre', sql.NVarChar(100), nombre)
        .input('tamano', sql.Int, tamanoBytes)
        .input('archivo', sql.VarBinary(sql.MAX), archivoCifrado)
        .input('hash', sql.Char(64), hashSha256)
        .query(
          `INSERT INTO dbo.informes_resultado (cita_id, cargado_por, nombre_archivo, tamano_bytes, archivo_cifrado, hash_sha256)
           OUTPUT INSERTED.id, INSERTED.nombre_archivo, INSERTED.tamano_bytes,
                  CONVERT(char(19), INSERTED.fecha_carga, 126) + 'Z' AS fecha_carga
           VALUES (@citaId, @cargadoPor, @nombre, @tamano, @archivo, @hash)`,
        );
      return mapearInforme(r.recordset[0]);
    },

    /** CU-09 paso 3: informes de la cita, del más reciente al más antiguo (sin el archivo). */
    async listarPorCita(citaId) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('citaId', sql.Int, citaId)
        .query(
          `SELECT i.id, i.nombre_archivo, i.tamano_bytes, ${FECHA_CARGA}
             FROM dbo.informes_resultado i
            WHERE i.cita_id = @citaId
            ORDER BY i.fecha_carga DESC, i.id DESC`,
        );
      return r.recordset.map(mapearInforme);
    },

    /** CU-09 paso 5: el archivo cifrado con su cita y su hash, o null. */
    async obtenerArchivo(id) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          `SELECT i.id, i.cita_id, i.nombre_archivo, i.archivo_cifrado, i.hash_sha256
             FROM dbo.informes_resultado i
            WHERE i.id = @id`,
        );
      const f = r.recordset[0];
      if (!f) return null;
      return {
        id: f.id,
        citaId: f.cita_id,
        nombre: f.nombre_archivo,
        archivoCifrado: f.archivo_cifrado,
        hashSha256: f.hash_sha256,
      };
    },

    /**
     * CU-15 pasos 1-2: la paciente con sus citas (más recientes primero) y
     * cuántos informes tiene cada una. null si la cédula no existe.
     */
    async pacienteConCitas(cedula) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .query(
          `SELECT p.id AS paciente_id, p.nombres, p.cedula,
                  c.codigo, c.estado, s.nombre AS servicio,
                  CONVERT(char(10), t.fecha, 23)       AS fecha,
                  CONVERT(char(5), t.hora_inicio, 108) AS hora_inicio,
                  (SELECT COUNT(*) FROM dbo.informes_resultado i WHERE i.cita_id = c.id) AS informes
             FROM dbo.pacientes p
             LEFT JOIN dbo.citas c    ON c.paciente_id = p.id
             LEFT JOIN dbo.servicios s ON s.id = c.servicio_id
             LEFT JOIN dbo.turnos t    ON t.id = c.turno_id
            WHERE p.cedula = @cedula
            ORDER BY t.fecha DESC, t.hora_inicio DESC`,
        );
      if (r.recordset.length === 0) return null;
      const [primera] = r.recordset;
      return {
        nombres: primera.nombres,
        cedula: primera.cedula,
        citas: r.recordset
          .filter((f) => f.codigo != null)
          .map((f) => ({
            codigo: f.codigo,
            estado: f.estado,
            servicio: f.servicio,
            fecha: f.fecha,
            horaInicio: f.hora_inicio,
            informes: f.informes,
          })),
      };
    },
  };
}

module.exports = { crearInformesRepository };
