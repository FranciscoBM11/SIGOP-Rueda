'use strict';

// Token de sesión del personal (Fase 3, Tabla 58): JWT HS256 firmado con
// SECRETO_SESION que apunta a una fila de dbo.sesiones. Usa la audiencia
// 'personal', distinta de la del token de cita ('cita'), para que un token no
// pueda usarse en lugar del otro. Solo lleva el id de la sesión.
// La inactividad (30 min) y la revocación se controlan en la base; el
// vencimiento del JWT es un tope absoluto de una jornada.
const jwt = require('jsonwebtoken');
const { ErrorNegocio } = require('../../common/errores');

const DURACION_MAXIMA_SEGUNDOS = 12 * 60 * 60;
const AUDIENCIA = 'personal';
const EMISOR = 'sigop-rueda';
const ALGORITMO = 'HS256';
const PATRON_GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

function errorSesionExpirada() {
  return new ErrorNegocio('SESION_EXPIRADA', 'Tu sesión expiró. Inicia sesión de nuevo.', 401);
}

function crearTokenSesion({ secreto, duracionSegundos = DURACION_MAXIMA_SEGUNDOS }) {
  if (typeof secreto !== 'string' || secreto.length < 32) {
    throw new Error('El secreto del token de sesión debe tener al menos 32 caracteres.');
  }
  return {
    duracionSegundos,

    firmar(sesionId) {
      return jwt.sign({ sid: sesionId }, secreto, {
        algorithm: ALGORITMO,
        audience: AUDIENCIA,
        issuer: EMISOR,
        expiresIn: duracionSegundos,
      });
    },

    /** @returns {string} id de la sesión (GUID) @throws SESION_EXPIRADA (401) */
    verificar(token) {
      let datos;
      try {
        datos = jwt.verify(token, secreto, { algorithms: [ALGORITMO], audience: AUDIENCIA, issuer: EMISOR });
      } catch {
        throw errorSesionExpirada();
      }
      if (typeof datos.sid !== 'string' || !PATRON_GUID.test(datos.sid)) throw errorSesionExpirada();
      return datos.sid;
    },
  };
}

module.exports = { crearTokenSesion, errorSesionExpirada, AUDIENCIA, DURACION_MAXIMA_SEGUNDOS };
