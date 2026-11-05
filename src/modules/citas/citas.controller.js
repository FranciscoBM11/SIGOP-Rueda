'use strict';

const { crearCitaSchema } = require('./citas.schemas');

function crearCitasController({ citasService }) {
  return {
    async agendar(req, res) {
      const datos = crearCitaSchema.parse(req.body ?? {});
      const comprobante = await citasService.agendar(datos);
      res.set('Cache-Control', 'no-store');
      res.status(201).json(comprobante);
    },
  };
}

module.exports = { crearCitasController };
