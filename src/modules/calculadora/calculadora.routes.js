'use strict';

// POST /calculadora/fpp (CU-01), pública.
const { Router } = require('express');
const { crearCalculadoraController } = require('./calculadora.controller');

function crearCalculadoraRoutes(dependencias) {
  const c = crearCalculadoraController(dependencias);
  const router = Router();
  router.post('/calculadora/fpp', c.calcularFpp);
  return router;
}

module.exports = { crearCalculadoraRoutes };
