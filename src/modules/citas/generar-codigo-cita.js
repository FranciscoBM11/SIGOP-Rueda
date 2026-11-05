'use strict';

// RN-02 / ER-05: código único de cita CR-##### (no se repite ni se reutiliza).
const { randomInt } = require('node:crypto');
const { ErrorNegocio } = require('../../common/errores');

const MAX_INTENTOS = 10;

/** Código aleatorio (no secuencial, para que no se pueda adivinar el de otra paciente). */
function codigoAleatorio(aleatorio = randomInt) {
  return `CR-${String(aleatorio(0, 100000)).padStart(5, '0')}`;
}

/**
 * Genera un código que no exista todavía. Como los códigos nunca se borran,
 * comprobar contra la tabla citas garantiza que no se reutilicen.
 * @param {(codigo: string) => Promise<boolean>} existe
 */
async function generarCodigoCita(existe, aleatorio = randomInt) {
  for (let intento = 1; intento <= MAX_INTENTOS; intento += 1) {
    const codigo = codigoAleatorio(aleatorio);
    if (!(await existe(codigo))) return codigo;
  }
  throw new ErrorNegocio('CODIGO_NO_GENERADO', 'No se pudo generar el código de la cita. Intenta de nuevo.', 503);
}

module.exports = { generarCodigoCita, codigoAleatorio, MAX_INTENTOS };
