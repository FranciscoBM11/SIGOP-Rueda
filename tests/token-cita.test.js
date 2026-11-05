'use strict';

// Token de cita (CU-08): 15 minutos, solo para esa cita, audiencia 'cita'.
const jwt = require('jsonwebtoken');
const { crearTokenCita, DURACION_SEGUNDOS } = require('../src/modules/seguridad/token-cita');
const { ErrorNegocio } = require('../src/common/errores');

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres';

function codigoDeError(fn) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ErrorNegocio);
    return { codigo: err.codigo, http: err.http };
  }
  throw new Error('no lanzó');
}

describe('token de cita', () => {
  const tokenCita = crearTokenCita({ secreto: SECRETO });

  test('firma y verifica el id y el código de la cita', () => {
    const token = tokenCita.firmar({ citaId: 12, codigo: 'CR-04821' });
    expect(tokenCita.verificar(token)).toEqual({ citaId: 12, codigo: 'CR-04821' });
  });

  test('dura 15 minutos y no lleva datos personales', () => {
    const token = tokenCita.firmar({ citaId: 12, codigo: 'CR-04821' });
    const datos = jwt.decode(token);
    expect(DURACION_SEGUNDOS).toBe(900);
    expect(datos.exp - datos.iat).toBe(900);
    expect(Object.keys(datos).sort()).toEqual(['aud', 'cid', 'cod', 'exp', 'iat', 'iss']);
  });

  test('vencido → 401 TOKEN_INVALIDO', () => {
    const corto = crearTokenCita({ secreto: SECRETO, duracionSegundos: -1 });
    const token = corto.firmar({ citaId: 1, codigo: 'CR-00001' });
    expect(codigoDeError(() => tokenCita.verificar(token))).toEqual({ codigo: 'TOKEN_INVALIDO', http: 401 });
  });

  test('firmado con otro secreto → 401', () => {
    const otro = crearTokenCita({ secreto: 'x'.repeat(40) });
    const token = otro.firmar({ citaId: 1, codigo: 'CR-00001' });
    expect(codigoDeError(() => tokenCita.verificar(token)).codigo).toBe('TOKEN_INVALIDO');
  });

  test('un JWT con otra audiencia (p. ej. sesión del personal) no sirve como token de cita', () => {
    const token = jwt.sign({ cid: 1, cod: 'CR-00001' }, SECRETO, { audience: 'sesion', issuer: 'sigop-rueda', expiresIn: 60 });
    expect(codigoDeError(() => tokenCita.verificar(token)).codigo).toBe('TOKEN_INVALIDO');
  });

  test('rechaza el algoritmo "none"', () => {
    const token = jwt.sign({ cid: 1, cod: 'CR-00001', aud: 'cita', iss: 'sigop-rueda' }, null, { algorithm: 'none' });
    expect(codigoDeError(() => tokenCita.verificar(token)).codigo).toBe('TOKEN_INVALIDO');
  });

  test('texto que no es un token → 401', () => {
    expect(codigoDeError(() => tokenCita.verificar('abc')).codigo).toBe('TOKEN_INVALIDO');
  });

  test('exige un secreto de 32 caracteres o más', () => {
    expect(() => crearTokenCita({ secreto: 'corto' })).toThrow();
  });
});
