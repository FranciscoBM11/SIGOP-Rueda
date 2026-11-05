'use strict';

// Sesión del personal (CU-10):
//   POST   /admin/sesion  pública, 20 peticiones/min por IP; bloqueo por cuenta (RN-12)
//   GET    /admin/sesion  sesión: { nombre, rol } del usuario conectado
//   DELETE /admin/sesion  cierra la sesión (aunque ya haya vencido)
const { Router } = require('express');
const { crearAuthController } = require('./auth.controller');
const { limitePeticiones } = require('../../common/middlewares/limite-peticiones');
const { requiereSesion } = require('../../common/middlewares/sesion');

function crearAuthRoutes(dependencias) {
  const c = crearAuthController(dependencias);
  const router = Router();
  router.post('/admin/sesion', limitePeticiones(), c.iniciar);
  router.get('/admin/sesion', requiereSesion(dependencias.authService), c.actual);
  router.delete('/admin/sesion', c.cerrar);
  return router;
}

module.exports = { crearAuthRoutes };
