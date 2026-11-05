'use strict';

// ServiciosRepository: único lugar con SQL sobre dbo.servicios.
const { sql } = require('../../config/base-datos');

function crearServiciosRepository({ obtenerPool }) {
  return {
    async listarActivos() {
      const pool = await obtenerPool();
      const r = await pool.request().query(
        `SELECT id, nombre, indicaciones_previas
           FROM dbo.servicios
          WHERE activo = 1
          ORDER BY id`,
      );
      return r.recordset;
    },

    /** Devuelve el servicio (activo o no) o null. */
    async obtenerPorId(id) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('id', sql.Int, id)
        .query('SELECT id, nombre, indicaciones_previas, activo FROM dbo.servicios WHERE id = @id');
      return r.recordset[0] ?? null;
    },
  };
}

module.exports = { crearServiciosRepository };
