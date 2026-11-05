'use strict';

// Registro estructurado (una línea JSON por evento). Nunca se registran
// cuerpos de petición, cédulas, nombres ni otros datos personales.

const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 };

function nivelMinimo() {
  if (process.env.NODE_ENV === 'test') return Infinity; // silencioso en pruebas
  return NIVELES[process.env.NIVEL_REGISTRO] ?? NIVELES.info;
}

function escribir(nivel, evento, datos = {}) {
  if (NIVELES[nivel] < nivelMinimo()) return;
  const linea = JSON.stringify({ fecha: new Date().toISOString(), nivel, evento, ...datos });
  if (NIVELES[nivel] >= NIVELES.warn) process.stderr.write(linea + '\n');
  else process.stdout.write(linea + '\n');
}

// Cédula nicaragüense (ER-01), por si aparece dentro de un mensaje técnico.
const PATRON_CEDULA = /\b\d{3}-?\d{6}-?\d{4}[A-Za-z]\b/g;

function enmascarar(texto) {
  return typeof texto === 'string' ? texto.replace(PATRON_CEDULA, '[cedula]') : texto;
}

/** Resume un error para el registro sin incluir datos de la petición. */
function resumirError(err) {
  if (!err) return undefined;
  // Los errores de consulta de SQL Server pueden citar valores de la fila
  // (p. ej. "The duplicate key value is (...)"): se registra solo su número.
  if (err.name === 'RequestError') {
    return { nombre: err.name, codigo: err.code, numeroSql: err.number, pila: enmascarar(err.stack?.split('\n').slice(1).join('\n')) };
  }
  return { nombre: err.name, mensaje: enmascarar(err.message), codigo: err.code, pila: enmascarar(err.stack) };
}

module.exports = {
  debug: (evento, datos) => escribir('debug', evento, datos),
  info: (evento, datos) => escribir('info', evento, datos),
  warn: (evento, datos) => escribir('warn', evento, datos),
  error: (evento, datos) => escribir('error', evento, datos),
  resumirError,
};
