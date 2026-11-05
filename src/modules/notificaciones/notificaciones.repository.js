'use strict';

// NotificacionesRepository: registro de cada envío (CU-05).
const { sql } = require('../../config/base-datos');

function crearNotificacionesRepository({ obtenerPool }) {
  return {
    async registrarPendiente(tx, { citaId, tipo, canal }) {
      const r = await tx
        .request()
        .input('citaId', sql.Int, citaId)
        .input('tipo', sql.VarChar(15), tipo)
        .input('canal', sql.VarChar(10), canal)
        .query(
          `INSERT INTO dbo.notificaciones (cita_id, tipo, canal)
           OUTPUT INSERTED.id
           VALUES (@citaId, @tipo, @canal)`,
        );
      return r.recordset[0].id;
    },

    async marcarEnviada(id) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          `UPDATE dbo.notificaciones
              SET estado_envio = 'ENVIADA', intentos = intentos + 1,
                  fecha_envio = SYSUTCDATETIME(), detalle_error = NULL
            WHERE id = @id`,
        );
    },

    async marcarFallida(id, detalle) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('id', sql.Int, id)
        .input('detalle', sql.NVarChar(300), detalle)
        .query(
          `UPDATE dbo.notificaciones
              SET estado_envio = 'FALLIDA', intentos = intentos + 1,
                  fecha_envio = SYSUTCDATETIME(), detalle_error = @detalle
            WHERE id = @id`,
        );
    },
  };
}

module.exports = { crearNotificacionesRepository };
