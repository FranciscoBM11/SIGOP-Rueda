'use strict';

// FichasRepository: fichas de triaje y sus respuestas cifradas (RN-14).
const { sql } = require('../../config/base-datos');

function crearFichasRepository() {
  return {
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
