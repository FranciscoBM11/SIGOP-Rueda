'use strict';

// Token de cita (CU-08, Fase 3 sección 5): credencial temporal que se entrega
// tras validar cédula y código. Vale 15 minutos y solo para esa cita.
// Es un JWT HS256 firmado con SECRETO_SESION y audiencia 'cita', para que no
// pueda usarse como sesión del personal (que tendrá otra audiencia).
// No lleva datos personales: solo el id interno y el código de la cita.
const jwt = require('jsonwebtoken');
const { ErrorNegocio } = require('../../common/errores');

const DURACION_SEGUNDOS = 15 * 60;
const AUDIENCIA = 'cita';
const EMISOR = 'sigop-rueda';
const ALGORITMO = 'HS256';

function errorTokenInvalido() {
  return new ErrorNegocio(
    'TOKEN_INVALIDO',
    'Tu acceso a la cita expiró o no es válido. Vuelve a ingresar tu cédula y código.',
    401,
  );
}

/**
 * @param {object} opciones
 * @param {string} opciones.secreto SECRETO_SESION (32 caracteres o más)
 * @param {number} [opciones.duracionSegundos]
 */
function crearTokenCita({ secreto, duracionSegundos = DURACION_SEGUNDOS }) {
  if (typeof secreto !== 'string' || secreto.length < 32) {
    throw new Error('El secreto del token de cita debe tener al menos 32 caracteres.');
  }
  return {
    duracionSegundos,

    /** @returns {string} token firmado */
    firmar({ citaId, codigo }) {
      return jwt.sign({ cid: citaId, cod: codigo }, secreto, {
        algorithm: ALGORITMO,
        audience: AUDIENCIA,
        issuer: EMISOR,
        expiresIn: duracionSegundos,
      });
    },

    /**
     * Verifica firma, algoritmo, audiencia, emisor y vencimiento.
     * @returns {{ citaId: number, codigo: string }}
     * @throws ErrorNegocio TOKEN_INVALIDO (401)
     */
    verificar(token) {
      let datos;
      try {
        datos = jwt.verify(token, secreto, { algorithms: [ALGORITMO], audience: AUDIENCIA, issuer: EMISOR });
      } catch {
        throw errorTokenInvalido();
      }
      if (!Number.isInteger(datos.cid) || typeof datos.cod !== 'string') throw errorTokenInvalido();
      return { citaId: datos.cid, codigo: datos.cod };
    },
  };
}

module.exports = { crearTokenCita, DURACION_SEGUNDOS, AUDIENCIA };
