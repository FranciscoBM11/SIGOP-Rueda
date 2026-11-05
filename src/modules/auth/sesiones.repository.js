'use strict';

// SesionesRepository: sesiones del personal (dbo.sesiones). La API no guarda
// estado en memoria: cada petición consulta y renueva la fila (Fase 3, 2.5).
const { sql } = require('../../config/base-datos');

function crearSesionesRepository({ obtenerPool }) {
  return {
    /** @returns {Promise<string>} id (GUID) de la sesión nueva */
    async crear({ usuarioId, minutosInactividad, ipHash }) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('usuarioId', sql.Int, usuarioId)
        .input('minutos', sql.Int, minutosInactividad)
        .input('ipHash', sql.Char(64), ipHash)
        .query(
          `INSERT INTO dbo.sesiones (usuario_id, expira_en, ip_hash)
           OUTPUT INSERTED.id
           VALUES (@usuarioId, DATEADD(MINUTE, @minutos, SYSUTCDATETIME()), @ipHash)`,
        );
      return String(r.recordset[0].id).toUpperCase();
    },

    /**
     * Si la sesión está vigente (no revocada, sin vencer por inactividad y con
     * el usuario activo) renueva su inactividad y devuelve el usuario.
     * @returns {Promise<null | { usuarioId, nombre, rol }>}
     */
    async renovar(id, { minutosInactividad }) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .input('minutos', sql.Int, minutosInactividad)
        .query(
          `UPDATE s
              SET ultima_actividad = SYSUTCDATETIME(),
                  expira_en = DATEADD(MINUTE, @minutos, SYSUTCDATETIME())
           OUTPUT inserted.usuario_id, u.nombre_completo, u.rol
             FROM dbo.sesiones s
             JOIN dbo.usuarios u ON u.id = s.usuario_id
            WHERE s.id = @id AND s.revocada = 0
              AND s.expira_en > SYSUTCDATETIME() AND u.activo = 1`,
        );
      const f = r.recordset[0];
      return f ? { usuarioId: f.usuario_id, nombre: f.nombre_completo, rol: f.rol } : null;
    },

    /** Cierre de sesión (CU-10, A1). */
    async revocar(id) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query('UPDATE dbo.sesiones SET revocada = 1 WHERE id = @id');
    },
  };
}

module.exports = { crearSesionesRepository };
