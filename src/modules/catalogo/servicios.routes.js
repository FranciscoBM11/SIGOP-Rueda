'use strict';

// Rutas públicas del catálogo: GET /servicios y GET /servicios/:id/preguntas.
const { Router } = require('express');
const { crearServiciosController } = require('./servicios.controller');

function crearServiciosRoutes(dependencias) {
  const c = crearServiciosController(dependencias);
  const router = Router();
  router.get('/servicios', c.listar);
  router.get('/servicios/:id/preguntas', c.listarPreguntas);
  return router;
}

module.exports = { crearServiciosRoutes };
