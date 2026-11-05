'use strict';

// EstudiosRepository: estudios sugeridos por trimestre (RF-02).
const { sql } = require('../../config/base-datos');

function crearEstudiosRepository({ obtenerPool }) {
  return {
    async listarPorTrimestre(trimestre) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('trimestre', sql.TinyInt, trimestre)
        .query(
          `SELECT nombre, descripcion
             FROM dbo.estudios_sugeridos
            WHERE trimestre = @trimestre
            ORDER BY orden, nombre`,
        );
      return r.recordset;
    },
  };
}

module.exports = { crearEstudiosRepository };
