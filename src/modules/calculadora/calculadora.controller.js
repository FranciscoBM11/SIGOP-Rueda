'use strict';

const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

const fppSchema = z.strictObject({ fum: esquemas.fecha });

function crearCalculadoraController({ calculadoraService }) {
  return {
    async calcularFpp(req, res) {
      const { fum } = fppSchema.parse(req.body ?? {});
      res.json(await calculadoraService.calcular(fum));
    },
  };
}

module.exports = { crearCalculadoraController, fppSchema };
