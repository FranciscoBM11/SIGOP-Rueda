'use strict';

// Rutas del panel para la disponibilidad (CU-16), solo la médica (Fase 3, Tabla 58):
//   GET /admin/disponibilidad   → { horarios[7], citasFueraDeHorario[] }
//   PUT /admin/disponibilidad   guardarHorariosSchema → igual
// La médica es la usuaria en sesión: medico_id = req.sesion.usuarioId.
const { Router } = require('express');
const { requiereSesion, requiereRol } = require('../../common/middlewares/sesion');
const { guardarHorariosSchema } = require('./disponibilidad.schemas');

function crearDisponibilidadAdminRoutes({ authService, horariosService }) {
  const sesion = requiereSesion(authService);
  const medica = requiereRol('MEDICO');
  const router = Router();

  router.get('/admin/disponibilidad', sesion, medica, async (req, res) => {
    res.status(200).json(await horariosService.obtener(req.sesion.usuarioId));
  });

  router.put('/admin/disponibilidad', sesion, medica, async (req, res) => {
    const { horarios } = guardarHorariosSchema.parse(req.body ?? {});
    res.status(200).json(await horariosService.guardar(req.sesion.usuarioId, horarios));
  });

  return router;
}

module.exports = { crearDisponibilidadAdminRoutes };
