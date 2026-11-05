'use strict';

// AuthService (CU-10) con repositorios simulados: RN-12 (bloqueo tras 5
// intentos fallidos consecutivos), mensaje genérico (E1), cuenta bloqueada
// (E3), sesión con inactividad (A2) y cierre (A1). RNF-03: bcrypt.
const bcrypt = require('bcryptjs');
const { crearAuthService, MAX_FALLIDOS, MINUTOS_BLOQUEO, MINUTOS_INACTIVIDAD } = require('../src/modules/auth/auth.service');
const { crearTokenSesion } = require('../src/modules/auth/token-sesion');

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres';
const SESION_ID = '6F9619FF-8B86-D011-B42D-00C04FC964FF';
// Costo bajo solo para que las pruebas sean rápidas; la aplicación usa 12.
const HASH = bcrypt.hashSync('Clinica2026', 4);
const HASH_FICTICIO = bcrypt.hashSync('nadie-la-conoce', 4);

const cuenta = (extra = {}) => ({
  id: 1,
  usuario: 'dra.rueda',
  contrasenaHash: HASH,
  nombre: 'Dra. Rueda',
  rol: 'MEDICO',
  activo: true,
  segundosBloqueo: 0,
  ...extra,
});

function armar({ usuario = cuenta(), fallo = { intentos: 1, segundosBloqueo: 0 }, sesion } = {}) {
  const tokenSesion = crearTokenSesion({ secreto: SECRETO });
  const d = {
    usuariosRepo: {
      buscarParaAcceso: jest.fn().mockResolvedValue(usuario),
      registrarFallo: jest.fn().mockResolvedValue(fallo),
      registrarExito: jest.fn(),
    },
    sesionesRepo: {
      crear: jest.fn().mockResolvedValue(SESION_ID),
      renovar: jest.fn().mockResolvedValue(sesion === undefined ? { usuarioId: 1, nombre: 'Dra. Rueda', rol: 'MEDICO' } : sesion),
      revocar: jest.fn(),
    },
    tokenSesion,
    hashIp: jest.fn(() => 'a'.repeat(64)),
    hashFicticio: HASH_FICTICIO,
  };
  return { d, tokenSesion, auth: crearAuthService(d) };
}

describe('CU-10 iniciarSesion', () => {
  test('flujo principal: reinicia el contador, crea la sesión y devuelve nombre, rol y token', async () => {
    const { d, auth, tokenSesion } = armar();
    const r = await auth.iniciarSesion({ usuario: 'dra.rueda', contrasena: 'Clinica2026', ip: '10.0.0.1' });

    expect(d.usuariosRepo.registrarExito).toHaveBeenCalledWith(1);
    expect(d.usuariosRepo.registrarFallo).not.toHaveBeenCalled();
    expect(d.sesionesRepo.crear).toHaveBeenCalledWith({ usuarioId: 1, minutosInactividad: MINUTOS_INACTIVIDAD, ipHash: 'a'.repeat(64) });
    expect(d.hashIp).toHaveBeenCalledWith('10.0.0.1');
    expect(r).toEqual({ token: expect.any(String), nombre: 'Dra. Rueda', rol: 'MEDICO' });
    expect(tokenSesion.verificar(r.token)).toBe(SESION_ID);
    // RNF-03: la respuesta nunca incluye el hash.
    expect(JSON.stringify(r)).not.toContain(HASH);
  });

  test('E1: contraseña incorrecta → 401 genérico y suma un intento (RN-12)', async () => {
    const { d, auth } = armar();
    await expect(auth.iniciarSesion({ usuario: 'dra.rueda', contrasena: 'Otra2026' })).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      http: 401,
      message: 'Usuario o contraseña incorrectos.',
    });
    expect(d.usuariosRepo.registrarFallo).toHaveBeenCalledWith(1, { maximo: MAX_FALLIDOS, minutos: MINUTOS_BLOQUEO });
    expect(d.sesionesRepo.crear).not.toHaveBeenCalled();
  });

  test('E1: usuario inexistente → el mismo mensaje, y la contraseña se compara igual (sin atajo de tiempo)', async () => {
    const { d } = armar({ usuario: null });
    d.bcrypt = { compare: jest.fn().mockResolvedValue(false) };
    await expect(crearAuthService(d).iniciarSesion({ usuario: 'nadie', contrasena: 'x' })).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
      message: 'Usuario o contraseña incorrectos.',
    });
    expect(d.bcrypt.compare).toHaveBeenCalledWith('x', HASH_FICTICIO);
    expect(d.usuariosRepo.registrarFallo).not.toHaveBeenCalled();
  });

  test('cuenta inactiva → mismo mensaje genérico, aunque la contraseña sea correcta', async () => {
    const { d, auth } = armar({ usuario: cuenta({ activo: false }) });
    await expect(auth.iniciarSesion({ usuario: 'dra.rueda', contrasena: 'Clinica2026' })).rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS' });
    expect(d.sesionesRepo.crear).not.toHaveBeenCalled();
  });

  test('E2 (RN-12): el 5.º fallo bloquea la cuenta y lo informa de inmediato (423)', async () => {
    const { auth } = armar({ fallo: { intentos: 5, segundosBloqueo: 900 } });
    await expect(auth.iniciarSesion({ usuario: 'dra.rueda', contrasena: 'mala' })).rejects.toMatchObject({
      codigo: 'CUENTA_BLOQUEADA',
      http: 423,
      message: expect.stringContaining('15 minutos'),
    });
  });

  test('E3: cuenta bloqueada → 423 con el tiempo restante, sin validar la contraseña ni contar el intento', async () => {
    const { d } = armar({ usuario: cuenta({ segundosBloqueo: 61 }) });
    const compare = jest.fn();
    d.bcrypt = { compare };
    await expect(crearAuthService(d).iniciarSesion({ usuario: 'dra.rueda', contrasena: 'Clinica2026' })).rejects.toMatchObject({
      codigo: 'CUENTA_BLOQUEADA',
      message: expect.stringContaining('2 minutos'),
    });
    expect(compare).not.toHaveBeenCalled();
    expect(d.usuariosRepo.registrarFallo).not.toHaveBeenCalled();
    expect(d.usuariosRepo.registrarExito).not.toHaveBeenCalled();
  });

  test('E3: con un minuto o menos usa el singular', async () => {
    const { auth } = armar({ usuario: cuenta({ segundosBloqueo: 30 }) });
    await expect(auth.iniciarSesion({ usuario: 'dra.rueda', contrasena: 'x' })).rejects.toMatchObject({
      message: expect.stringContaining('1 minuto.'),
    });
  });
});

describe('CU-10 verificarSesion y cerrarSesion', () => {
  test('sesión vigente: renueva la inactividad y devuelve el usuario', async () => {
    const { d, auth, tokenSesion } = armar();
    const r = await auth.verificarSesion(tokenSesion.firmar(SESION_ID));
    expect(d.sesionesRepo.renovar).toHaveBeenCalledWith(SESION_ID, { minutosInactividad: 30 });
    expect(r).toEqual({ sesionId: SESION_ID, usuarioId: 1, nombre: 'Dra. Rueda', rol: 'MEDICO' });
  });

  test('A2: sesión vencida por inactividad o revocada → SESION_EXPIRADA', async () => {
    const { auth, tokenSesion } = armar({ sesion: null });
    await expect(auth.verificarSesion(tokenSesion.firmar(SESION_ID))).rejects.toMatchObject({ codigo: 'SESION_EXPIRADA', http: 401 });
  });

  test('token alterado o de otra audiencia (token de cita) → SESION_EXPIRADA sin consultar la base', async () => {
    const { d, auth } = armar();
    const { crearTokenCita } = require('../src/modules/seguridad/token-cita');
    const deCita = crearTokenCita({ secreto: SECRETO }).firmar({ citaId: 1, codigo: 'CR-00001' });
    await expect(auth.verificarSesion(deCita)).rejects.toMatchObject({ codigo: 'SESION_EXPIRADA' });
    await expect(auth.verificarSesion('a.b.c')).rejects.toMatchObject({ codigo: 'SESION_EXPIRADA' });
    expect(d.sesionesRepo.renovar).not.toHaveBeenCalled();
  });

  test('A1: cerrar sesión revoca la fila', async () => {
    const { d, auth, tokenSesion } = armar();
    await auth.cerrarSesion(tokenSesion.firmar(SESION_ID));
    expect(d.sesionesRepo.revocar).toHaveBeenCalledWith(SESION_ID);
  });

  test('A1: con un token inválido no hay nada que revocar', async () => {
    const { d, auth } = armar();
    await auth.cerrarSesion('basura');
    expect(d.sesionesRepo.revocar).not.toHaveBeenCalled();
  });
});

describe('Token de sesión', () => {
  test('rechaza un id de sesión que no es GUID', () => {
    const tokenSesion = crearTokenSesion({ secreto: SECRETO });
    expect(() => tokenSesion.verificar(tokenSesion.firmar("1' OR 1=1"))).toThrow(expect.objectContaining({ codigo: 'SESION_EXPIRADA' }));
  });

  test('exige un secreto de al menos 32 caracteres', () => {
    expect(() => crearTokenSesion({ secreto: 'corto' })).toThrow();
  });
});
