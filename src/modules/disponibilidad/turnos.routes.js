'use strict';

// GET /turnos?servicioId&desde&hasta (CU-02), pública.
const { Router } = require('express');
const { crearTurnosController } = require('./turnos.controller');

function crearTurnosRoutes(dependencias) {
  const c = crearTurnosController(dependencias);
  const router = Router();
  router.get('/turnos', c.consultar);
  return router;
}

module.exports = { crearTurnosRoutes };
