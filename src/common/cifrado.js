'use strict';

// Cifrado de columnas sensibles con AES-256-GCM (Fase 3, Tabla 56; RN-14).
// Formato guardado: iv (12 bytes) + etiqueta de autenticación (16) + texto cifrado.
const crypto = require('node:crypto');

const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;

function claveDeConfig() {
  const { obtenerConfig } = require('../config/config');
  return obtenerConfig().claveCifrado;
}

function validarClave(clave) {
  if (!Buffer.isBuffer(clave) || clave.length !== 32) {
    throw new Error('La clave de cifrado debe tener 32 bytes.');
  }
}

/**
 * Cifra un texto (UTF-8) o un Buffer. Cada llamada usa un IV aleatorio.
 * @returns {Buffer} iv + etiqueta + texto cifrado
 */
function cifrar(valor, clave = claveDeConfig()) {
  validarClave(clave);
  const datos = Buffer.isBuffer(valor) ? valor : Buffer.from(String(valor), 'utf8');
  const iv = crypto.randomBytes(LARGO_IV);
  const cifrador = crypto.createCipheriv(ALGORITMO, clave, iv);
  const cifrado = Buffer.concat([cifrador.update(datos), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), cifrado]);
}

/** Descifra a Buffer. Lanza si el dato fue alterado o la clave no corresponde. */
function descifrar(paquete, clave = claveDeConfig()) {
  validarClave(clave);
  if (!Buffer.isBuffer(paquete) || paquete.length < LARGO_IV + LARGO_ETIQUETA) {
    throw new Error('Dato cifrado inválido.');
  }
  const iv = paquete.subarray(0, LARGO_IV);
  const etiqueta = paquete.subarray(LARGO_IV, LARGO_IV + LARGO_ETIQUETA);
  const cifrado = paquete.subarray(LARGO_IV + LARGO_ETIQUETA);
  const descifrador = crypto.createDecipheriv(ALGORITMO, clave, iv);
  descifrador.setAuthTag(etiqueta);
  return Buffer.concat([descifrador.update(cifrado), descifrador.final()]);
}

/** Atajo: descifra y devuelve el texto UTF-8. */
function descifrarTexto(paquete, clave) {
  return descifrar(paquete, clave).toString('utf8');
}

module.exports = { cifrar, descifrar, descifrarTexto };
