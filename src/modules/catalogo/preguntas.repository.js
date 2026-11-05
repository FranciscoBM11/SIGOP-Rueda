'use strict';

// PreguntasRepository: preguntas de triaje activas y sus opciones (RN-08).
const { sql } = require('../../config/base-datos');

function crearPreguntasRepository({ obtenerPool }) {
  return {
    async listarActivasPorServicio(servicioId) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('servicioId', sql.Int, servicioId)
        .query(
          `SELECT p.id, p.texto, p.tipo_respuesta, p.obligatoria, p.orden,
                  o.id AS opcion_id, o.etiqueta AS opcion_etiqueta
             FROM dbo.preguntas_triaje p
             LEFT JOIN dbo.opciones_pregunta o ON o.pregunta_id = p.id
            WHERE p.servicio_id = @servicioId AND p.activa = 1
            ORDER BY p.orden, o.orden`,
        );
      return r.recordset;
    },
  };
}

module.exports = { crearPreguntasRepository };
