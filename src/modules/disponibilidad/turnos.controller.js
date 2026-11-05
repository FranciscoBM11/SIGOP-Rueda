'use strict';

const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

const consultaTurnosSchema = z.strictObject({
  servicioId: esquemas.id,
  desde: esquemas.fecha,
  hasta: esquemas.fecha,
});

function crearTurnosController({ turnosService }) {
  return {
    async consultar(req, res) {
      const filtro = consultaTurnosSchema.parse(req.query);
      res.set('Cache-Control', 'no-store');
      res.json(await turnosService.consultar(filtro));
    },
  };
}

module.exports = { crearTurnosController, consultaTurnosSchema };
