'use strict';

const { construirConfig, ErrorConfiguracion } = require('../src/config/config');

const valido = {
  NODE_ENV: 'development',
  DB_SERVIDOR: 'localhost',
  DB_NOMBRE: 'SIGOP',
  DB_USUARIO: 'sigop_app',
  DB_CLAVE: 'clave-secreta-123',
  CLAVE_CIFRADO: 'a'.repeat(64),
  SECRETO_SESION: 's'.repeat(32),
};

describe('construirConfig', () => {
  test('con variables válidas aplica valores por defecto', () => {
    const c = construirConfig(valido);
    expect(c.puerto).toBe(3000);
    expect(c.baseDatos.puerto).toBe(1433);
    expect(c.baseDatos.cifrar).toBe(true);
    expect(c.baseDatos.confiarCertificado).toBe(false);
    expect(c.baseDatos.instancia).toBeUndefined();
    expect(c.claveCifrado).toHaveLength(32);
    expect(Object.isFrozen(c)).toBe(true);
  });

  test('interpreta PORT, booleanos e instancia', () => {
    const c = construirConfig({ ...valido, PORT: '8080', DB_CIFRAR: 'false', DB_CONFIAR_CERTIFICADO: 'true', DB_INSTANCIA: 'SQLEXPRESS' });
    expect(c.puerto).toBe(8080);
    expect(c.baseDatos.cifrar).toBe(false);
    expect(c.baseDatos.confiarCertificado).toBe(true);
    expect(c.baseDatos.instancia).toBe('SQLEXPRESS');
  });

  test('si falta una variable obligatoria, el error la nombra', () => {
    const { DB_CLAVE, ...sinClave } = valido;
    expect(() => construirConfig(sinClave)).toThrow(ErrorConfiguracion);
    expect(() => construirConfig(sinClave)).toThrow(/DB_CLAVE: falta/);
  });

  test('una variable vacía cuenta como faltante', () => {
    expect(() => construirConfig({ ...valido, SECRETO_SESION: '' })).toThrow(/SECRETO_SESION: falta/);
  });

  test('CLAVE_CIFRADO debe ser de 32 bytes en hexadecimal', () => {
    expect(() => construirConfig({ ...valido, CLAVE_CIFRADO: 'corta' })).toThrow(/CLAVE_CIFRADO: debe tener 64/);
  });

  test('el mensaje de error nunca incluye valores secretos', () => {
    const malo = { ...valido, CLAVE_CIFRADO: 'zz-valor-secreto-zz', DB_CIFRAR: 'quizas' };
    let mensaje = '';
    try {
      construirConfig(malo);
    } catch (err) {
      mensaje = err.message;
    }
    expect(mensaje).toMatch(/CLAVE_CIFRADO/);
    expect(mensaje).toMatch(/DB_CIFRAR/);
    expect(mensaje).not.toMatch(/zz-valor-secreto-zz|quizas/);
  });

  test('SMTP es opcional en la Iteración 0', () => {
    const c = construirConfig({ ...valido, SMTP_HOST: '', SMTP_PUERTO: '' });
    expect(c.smtp.host).toBeUndefined();
    expect(c.smtp.puerto).toBeUndefined();
  });
});
