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
const { crearResultadosRoutes } = require('./modules/resultados/resultados.routes');
const { crearInformesAdminRoutes } = require('./modules/resultados/informes-admin.routes');
const { crearDisponibilidadAdminRoutes } = require('./modules/disponibilidad/disponibilidad-admin.routes');

const CARPETA_PUBLICA = path.resolve(__dirname, '..', 'public');

/**
 * Qué proxy es de confianza para leer X-Forwarded-For (req.ip).
 * - Producción (Render): un salto, el borde de Render.
 * - Desarrollo/feria (laptop + cloudflared en la misma computadora): solo
 *   loopback. Así req.ip es la IP real de la persona cuando llega por el túnel,
 *   y quien se conecta directo (Wi-Fi) no puede falsificarla con la cabecera.
 * Afecta a los límites de intentos (RN-12, RN-15) y al hash de la IP.
 */
function confianzaProxy(entorno = process.env.NODE_ENV) {
  return entorno === 'production' ? 1 : 'loopback';
}

/**
 * @param {object} [opciones]
 * @param {object} [opciones.servicios] servicios ya construidos (en pruebas, simulados).
 *        Si se omite se crean los reales con crearDependencias().
 */
function crearApp({ servicios } = {}) {
  const dependencias = servicios ?? crearDependencias();
  const app = express();

  app.set('trust proxy', confianzaProxy());

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
  api.use(crearResultadosRoutes(dependencias));
  // Panel del personal (/admin, con sesión)
  api.use(crearAuthRoutes(dependencias));
  api.use(crearCitasAdminRoutes(dependencias));
  api.use(crearTriajeAdminRoutes(dependencias));
  api.use(crearInformesAdminRoutes(dependencias));
  api.use(crearDisponibilidadAdminRoutes(dependencias));
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

module.exports = { crearApp, confianzaProxy };
