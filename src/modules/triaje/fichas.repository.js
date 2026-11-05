'use strict';

// FichasRepository: fichas de triaje y sus respuestas cifradas (RN-14).
const { sql } = require('../../config/base-datos');

function crearFichasRepository({ obtenerPool } = {}) {
  return {
    /**
     * CU-14: la ficha de la cita con sus respuestas (aún cifradas), en el orden
     * del cuestionario. Incluye preguntas ya desactivadas: se muestra lo que la
     * paciente respondió. @returns {Promise<null | { fechaRegistro, respuestas[] }>}
     */
    async obtenerPorCita(citaId) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('citaId', sql.Int, citaId)
        .query(
          `SELECT f.id AS ficha_id,
                  CONVERT(char(19), f.fecha_registro, 126) AS fecha_registro,
                  p.id AS pregunta_id, p.texto, p.tipo_respuesta, r.valor_cifrado
             FROM dbo.fichas_triaje f
             LEFT JOIN dbo.respuestas_triaje r ON r.ficha_id = f.id
             LEFT JOIN dbo.preguntas_triaje p  ON p.id = r.pregunta_id
            WHERE f.cita_id = @citaId
            ORDER BY p.orden, p.id`,
        );
      if (r.recordset.length === 0) return null;
      return {
        fechaRegistro: `${r.recordset[0].fecha_registro}Z`,
        respuestas: r.recordset
          .filter((f) => f.pregunta_id != null)
          .map((f) => ({ preguntaId: f.pregunta_id, texto: f.texto, tipo: f.tipo_respuesta, valorCifrado: f.valor_cifrado })),
      };
    },


    async insertarFicha(tx, citaId) {
      const r = await tx
        .request()
        .input('citaId', sql.Int, citaId)
        .query('INSERT INTO dbo.fichas_triaje (cita_id) OUTPUT INSERTED.id VALUES (@citaId)');
      return r.recordset[0].id;
    },

    async insertarRespuesta(tx, fichaId, preguntaId, valorCifrado) {
      await tx
        .request()
        .input('fichaId', sql.Int, fichaId)
        .input('preguntaId', sql.Int, preguntaId)
        .input('valor', sql.VarBinary(2100), valorCifrado)
        .query(
          `INSERT INTO dbo.respuestas_triaje (ficha_id, pregunta_id, valor_cifrado)
           VALUES (@fichaId, @preguntaId, @valor)`,
        );
    },
  };
}

module.exports = { crearFichasRepository };
