'use strict';

// Rutas del panel para las citas (todas exigen sesión):
//   GET   /admin/citas/agenda?fecha            CU-11 (médica y recepción)
//   GET   /admin/citas/:codigo/transiciones    CU-12 (médica y recepción)
//   PATCH /admin/citas/:codigo/estado          CU-12 (el rol lo valida la máquina de estados, RN-11)
//   POST  /admin/citas/:codigo/cancelacion     CU-13 (solo recepción)
//   PATCH /admin/citas/:codigo                 CU-13 (solo recepción)
const { Router } = require('express');
const { crearCitasAdminController } = require('./citas-admin.controller');
const { requiereSesion, requiereRol } = require('../../common/middlewares/sesion');

function crearCitasAdminRoutes(dependencias) {
  const c = crearCitasAdminController(dependencias);
  const sesion = requiereSesion(dependencias.authService);
  const recepcion = requiereRol('RECEPCIONISTA');
  const router = Router();
  router.get('/admin/citas/agenda', sesion, c.agenda);
  router.get('/admin/citas/:codigo/transiciones', sesion, c.transiciones);
  router.patch('/admin/citas/:codigo/estado', sesion, c.cambiarEstado);
  router.post('/admin/citas/:codigo/cancelacion', sesion, recepcion, c.cancelar);
  router.patch('/admin/citas/:codigo', sesion, recepcion, c.reprogramar);
  return router;
}

module.exports = { crearCitasAdminRoutes };
