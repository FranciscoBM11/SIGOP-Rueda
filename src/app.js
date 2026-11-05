'use strict';

// Aplicación Express: middlewares, rutas de la API y archivos estáticos.
// Se exporta como fábrica para poder probarla con Supertest sin abrir un puerto.
const path = require('node:path');
const express = require('express');
const { cabecerasSeguras } = require('./common/middlewares/cabeceras-seguras');
const { idPeticion } = require('./common/middlewares/id-peticion');
const { rutaNoEncontrada, manejadorErrores } = require('./common/errores');
const saludRoutes = require('./common/salud.routes');
const { crearDependencias } = require('./modules/dependencias');
const { crearCalculadoraRoutes } = require('./modules/calculadora/calculadora.routes');
const { crearServiciosRoutes } = require('./modules/catalogo/servicios.routes');
const { crearTurnosRoutes } = require('./modules/disponibilidad/turnos.routes');
const { crearCitasRoutes } = require('./modules/citas/citas.routes');
const { crearAuthRoutes } = require('./modules/auth/auth.routes');
const { crearCitasAdminRoutes } = require('./modules/citas/citas-admin.routes');
const { crearTriajeAdminRoutes } = require('./modules/triaje/triaje-admin.routes');

const CARPETA_PUBLICA = path.resolve(__dirname, '..', 'public');

/**
 * @param {object} [opciones]
 * @param {object} [opciones.servicios] servicios ya construidos (en pruebas, simulados).
 *        Si se omite se crean los reales con crearDependencias().
 */
function crearApp({ servicios } = {}) {
  const dependencias = servicios ?? crearDependencias();
  const app = express();

  // Render pone un proxy delante: confiar en un salto para obtener la IP real.
  app.set('trust proxy', 1);

  app.use(cabecerasSeguras());
  app.use(idPeticion);
  app.use(express.json({ limit: '100kb' }));

  // ---- API /api/v1 -----------------------------------------------------------
  const api = express.Router();
  api.use(saludRoutes);
  api.use(crearCalculadoraRoutes(dependencias));
  api.use(crearServiciosRoutes(dependencias));
  api.use(crearTurnosRoutes(dependencias));
  api.use(crearCitasRoutes(dependencias));
  // Panel del personal (/admin, con sesión)
  api.use(crearAuthRoutes(dependencias));
  api.use(crearCitasAdminRoutes(dependencias));
  api.use(crearTriajeAdminRoutes(dependencias));
  api.use(rutaNoEncontrada);
  app.use('/api/v1', api);
  app.use('/api', rutaNoEncontrada);

  // ---- Frontend --------------------------------------------------------------
  // Entrada al panel: la agenda redirige al inicio de sesión si no hay sesión.
  app.get(['/admin', '/admin/'], (req, res) => res.redirect('/admin/agenda.html'));
  app.use(express.static(CARPETA_PUBLICA, { extensions: ['html'] }));

  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
