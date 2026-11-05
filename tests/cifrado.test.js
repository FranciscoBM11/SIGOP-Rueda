'use strict';

// RN-14: las respuestas de triaje y los PDF se guardan cifrados (AES-256-GCM).
const crypto = require('node:crypto');
const { cifrar, descifrar, descifrarTexto } = require('../src/common/cifrado');

const clave = crypto.randomBytes(32);

describe('cifrado AES-256-GCM', () => {
  test('cifra y descifra texto con acentos (ida y vuelta)', () => {
    const paquete = cifrar('Sí, sangrado leve', clave);
    expect(descifrarTexto(paquete, clave)).toBe('Sí, sangrado leve');
  });

  test('el resultado no contiene el texto original y usa iv + etiqueta (28 bytes extra)', () => {
    const paquete = cifrar('dato sensible', clave);
    expect(paquete.includes(Buffer.from('dato sensible'))).toBe(false);
    expect(paquete.length).toBe(12 + 16 + Buffer.byteLength('dato sensible'));
  });

  test('cada cifrado usa un IV distinto', () => {
    expect(cifrar('igual', clave).equals(cifrar('igual', clave))).toBe(false);
  });

  test('detecta un dato alterado', () => {
    const paquete = cifrar('respuesta', clave);
    paquete[paquete.length - 1] ^= 0xff;
    expect(() => descifrar(paquete, clave)).toThrow();
  });

  test('falla con otra clave', () => {
    const paquete = cifrar('respuesta', clave);
    expect(() => descifrar(paquete, crypto.randomBytes(32))).toThrow();
  });

  test('cifra Buffers (PDF)', () => {
    const pdf = Buffer.from('%PDF-1.7 contenido');
    expect(descifrar(cifrar(pdf, clave), clave).equals(pdf)).toBe(true);
  });

  test('rechaza claves que no son de 32 bytes', () => {
    expect(() => cifrar('x', Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  test('usa CLAVE_CIFRADO de la configuración por defecto', () => {
    expect(descifrarTexto(cifrar('hola'))).toBe('hola');
  });

  test('la respuesta más larga (500 caracteres de 4 bytes) cabe en VARBINARY(2100)', () => {
    expect(cifrar('😀'.repeat(500), clave).length).toBeLessThanOrEqual(2100);
  });
});
