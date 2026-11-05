'use strict';

// Las IP se guardan como hash (Fase 3, Tabla 58). Se usa HMAC-SHA256 con un
// secreto del servidor en lugar de SHA-256 simple: el espacio de direcciones
// IPv4 es pequeño y un hash sin secreto se revertiría probando todas.
const { createHmac } = require('node:crypto');

/** @returns {(ip: string|undefined) => string|null} 64 caracteres hexadecimales */
function crearHashIp(secreto) {
  return (ip) => (ip ? createHmac('sha256', secreto).update(`ip:${ip}`).digest('hex') : null);
}

module.exports = { crearHashIp };
