'use strict';

// POST /citas (CU-03, CU-05), pública con límite de 20 peticiones/min por IP.
const { Router } = require('express');
const { crearCitasController } = require('./citas.controller');
const { limitePeticiones } = require('../../common/middlewares/limite-peticiones');

function crearCitasRoutes(dependencias) {
  const c = crearCitasController(dependencias);
  const router = Router();
  router.post('/citas', limitePeticiones(), c.agendar);
  return router;
}

module.exports = { crearCitasRoutes };
