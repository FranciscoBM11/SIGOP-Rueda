'use strict';

// Rutas públicas de citas, todas con límite de 20 peticiones/min por IP.
//   POST  /citas                      CU-03, CU-05 (pública)
//   POST  /citas/acceso               CU-08 (pública, con límite de intentos por cédula)
//   POST  /citas/:codigo/cancelacion  CU-06 (token de cita)
//   PATCH /citas/:codigo              CU-07 (token de cita)
const { Router } = require('express');
const { crearCitasController } = require('./citas.controller');
const { limitePeticiones } = require('../../common/middlewares/limite-peticiones');
const { requiereTokenCita } = require('../../common/middlewares/token-cita');

function crearCitasRoutes(dependencias) {
  const c = crearCitasController(dependencias);
  const tokenCita = requiereTokenCita(dependencias.tokenCita);
  const router = Router();
  router.post('/citas', limitePeticiones(), c.agendar);
  router.post('/citas/acceso', limitePeticiones(), c.acceso);
  router.post('/citas/:codigo/cancelacion', limitePeticiones(), tokenCita, c.cancelar);
  router.patch('/citas/:codigo', limitePeticiones(), tokenCita, c.reprogramar);
  return router;
}

module.exports = { crearCitasRoutes };
