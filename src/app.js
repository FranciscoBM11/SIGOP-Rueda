'use strict';

// Aplicación Express: middlewares, rutas de la API y archivos estáticos.
// Se exporta como fábrica para poder probarla con Supertest sin abrir un puerto.
const path = require('node:path');
const express = require('express');
const { cabecerasSeguras } = require('./common/middlewares/cabeceras-seguras');
const { idPeticion } = require('./common/middlewares/id-peticion');
const { rutaNoEncontrada, manejadorErrores } = require('./common/errores');
const saludRoutes = require('./common/salud.routes');

const CARPETA_PUBLICA = path.resolve(__dirname, '..', 'public');

function crearApp() {
  const app = express();

  // Render pone un proxy delante: confiar en un salto para obtener la IP real.
  app.set('trust proxy', 1);

  app.use(cabecerasSeguras());
  app.use(idPeticion);
  app.use(express.json({ limit: '100kb' }));

  // ---- API /api/v1 -----------------------------------------------------------
  const api = express.Router();
  api.use(saludRoutes);
  // Los módulos (citas, triaje, ...) se montarán aquí en las siguientes iteraciones.
  api.use(rutaNoEncontrada);
  app.use('/api/v1', api);
  app.use('/api', rutaNoEncontrada);

  // ---- Frontend --------------------------------------------------------------
  app.use(express.static(CARPETA_PUBLICA, { extensions: ['html'] }));

  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
