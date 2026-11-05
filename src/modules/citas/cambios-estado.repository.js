'use strict';

// CambiosEstadoRepository: historial de estados de cada cita (RF-17).
const { sql } = require('../../config/base-datos');

function crearCambiosEstadoRepository() {
  return {
    async registrar(tx, { citaId, estadoAnterior = null, estadoNuevo, origen, usuarioId = null, detalle = null }) {
      await tx
        .request()
        .input('citaId', sql.Int, citaId)
        .input('anterior', sql.VarChar(12), estadoAnterior)
        .input('nuevo', sql.VarChar(12), estadoNuevo)
        .input('origen', sql.VarChar(10), origen)
        .input('usuarioId', sql.Int, usuarioId)
        .input('detalle', sql.NVarChar(200), detalle)
        .query(
          `INSERT INTO dbo.cambios_estado_cita (cita_id, estado_anterior, estado_nuevo, origen, usuario_id, detalle)
           VALUES (@citaId, @anterior, @nuevo, @origen, @usuarioId, @detalle)`,
        );
    },
  };
}

module.exports = { crearCambiosEstadoRepository };
