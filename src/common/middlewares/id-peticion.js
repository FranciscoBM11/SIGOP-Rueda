'use strict';

// Asigna un identificador a cada petición y registra el acceso al terminar.
// Se registra solo la ruta (sin query string) para no filtrar datos personales.
const { randomUUID } = require('node:crypto');
const registro = require('../registro');

/** Ruta completa (req.path es relativo al router montado) sin query string. */
function rutaSinQuery(req) {
  return req.originalUrl.split('?')[0];
}

function idPeticion(req, res, next) {
  const inicio = process.hrtime.bigint();
  req.idPeticion = randomUUID();
  res.setHeader('X-Id-Peticion', req.idPeticion);
  res.on('finish', () => {
    registro.info('peticion', {
      idPeticion: req.idPeticion,
      metodo: req.method,
      ruta: rutaSinQuery(req),
      estado: res.statusCode,
      ms: Number((process.hrtime.bigint() - inicio) / 1000000n),
    });
  });
  next();
}

module.exports = { idPeticion, rutaSinQuery };
