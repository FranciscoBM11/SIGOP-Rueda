'use strict';

// Límite de peticiones por IP para las rutas públicas (Fase 3, Tabla 58):
// 20 por minuto. Cada llamada crea un contador nuevo (en memoria del proceso).
const { rateLimit } = require('express-rate-limit');
const { ErrorNegocio } = require('../errores');

function limitePeticiones({ maximo = 20, ventanaMs = 60 * 1000 } = {}) {
  return rateLimit({
    windowMs: ventanaMs,
    limit: maximo,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => {
      next(
        new ErrorNegocio(
          'DEMASIADAS_PETICIONES',
          'Hiciste demasiadas solicitudes en poco tiempo. Espera un minuto e intenta de nuevo.',
          429,
        ),
      );
    },
  });
}

module.exports = { limitePeticiones };
