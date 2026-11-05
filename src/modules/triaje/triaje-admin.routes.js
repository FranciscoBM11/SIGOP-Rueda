'use strict';

// CU-14: GET /admin/citas/:codigo/triaje — solo la médica (RN-16).
// Cada consulta queda en el registro con el id del usuario y de la cita,
// sin datos personales ni respuestas.
const { Router } = require('express');
const { ErrorNegocio } = require('../../common/errores');
const registro = require('../../common/registro');
const { requiereSesion, requiereRol } = require('../../common/middlewares/sesion');
const { codigoRutaSchema } = require('../citas/citas.schemas');

function crearTriajeAdminRoutes({ authService, citasService, triajeService }) {
  const router = Router();

  router.get('/admin/citas/:codigo/triaje', requiereSesion(authService), requiereRol('MEDICO'), async (req, res) => {
    const { codigo } = codigoRutaSchema.parse(req.params);
    const { id, item } = await citasService.obtenerItemAgenda(codigo, req.sesion.rol);
    const ficha = await triajeService.consultarFicha(id);
    registro.info('triaje_consultado', { idPeticion: req.idPeticion, usuarioId: req.sesion.usuarioId, citaId: id, encontrada: Boolean(ficha) });
    if (!ficha) {
      // E1
      throw new ErrorNegocio('FICHA_NO_ENCONTRADA', 'Esta cita no tiene ficha de triaje: la paciente no respondió el cuestionario.', 404);
    }
    res.status(200).json({ cita: item, fechaRegistro: ficha.fechaRegistro, respuestas: ficha.respuestas });
  });

  return router;
}

module.exports = { crearTriajeAdminRoutes };
