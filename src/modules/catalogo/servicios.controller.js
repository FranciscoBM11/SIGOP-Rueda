'use strict';

// Controlador delgado del catálogo: valida la entrada, llama al servicio y responde.
const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

const paramsServicio = z.strictObject({ id: esquemas.id });

function crearServiciosController({ serviciosService, preguntasService }) {
  return {
    async listar(req, res) {
      res.json(await serviciosService.listar());
    },

    async listarPreguntas(req, res) {
      const { id } = paramsServicio.parse(req.params);
      res.json(await preguntasService.listarPorServicio(id));
    },
  };
}

module.exports = { crearServiciosController };
