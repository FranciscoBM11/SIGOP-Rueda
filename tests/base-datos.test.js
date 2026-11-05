'use strict';

// Pruebas del pool con mssql simulado (no requieren SQL Server).
const mockConectar = jest.fn();
const mockCerrar = jest.fn();
const mockBegin = jest.fn();
const mockCommit = jest.fn();
const mockRollback = jest.fn();

jest.mock('mssql', () => ({
  ConnectionPool: jest.fn().mockImplementation(() => ({
    connect: mockConectar,
    close: mockCerrar,
    on: jest.fn(),
  })),
  Transaction: jest.fn().mockImplementation(() => ({
    begin: mockBegin,
    commit: mockCommit,
    rollback: mockRollback,
  })),
}));

const sql = require('mssql');
const baseDatos = require('../src/config/base-datos');

function errorConexion(code, number, message = 'error de conexión') {
  const err = new Error(message);
  err.name = 'ConnectionError';
  err.code = code;
  if (number) err.originalError = { number };
  return err;
}

const esperas = [];

beforeEach(async () => {
  await baseDatos.cerrarPool();
  jest.clearAllMocks();
  esperas.length = 0;
  baseDatos._definirEspera(async (ms) => {
    esperas.push(ms);
  });
});

describe('obtenerPool: reintento de conexión', () => {
  test('conecta al primer intento y reutiliza el pool', async () => {
    mockConectar.mockResolvedValue();
    const a = await baseDatos.obtenerPool();
    const b = await baseDatos.obtenerPool();
    expect(a).toBe(b);
    expect(mockConectar).toHaveBeenCalledTimes(1);
  });

  test('Azure SQL pausado: reintenta con espera creciente y conecta al 3.er intento', async () => {
    mockConectar
      .mockRejectedValueOnce(errorConexion('ELOGIN', 40613))
      .mockRejectedValueOnce(errorConexion('ETIMEOUT'))
      .mockResolvedValueOnce();
    await expect(baseDatos.obtenerPool()).resolves.toBeDefined();
    expect(mockConectar).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([2000, 4000]);
  });

  test('detecta Azure pausado por el texto del error aunque no traiga número', async () => {
    mockConectar
      .mockRejectedValueOnce(errorConexion('ELOGIN', undefined, "Database 'SIGOP' on server 'x' is not currently available."))
      .mockResolvedValueOnce();
    await baseDatos.obtenerPool();
    expect(mockConectar).toHaveBeenCalledTimes(2);
  });

  test('se rinde tras 3 intentos con 503 BD_NO_DISPONIBLE', async () => {
    mockConectar.mockRejectedValue(errorConexion('ESOCKET'));
    await expect(baseDatos.obtenerPool()).rejects.toMatchObject({
      codigo: 'BD_NO_DISPONIBLE',
      http: 503,
    });
    expect(mockConectar).toHaveBeenCalledTimes(3);
  });

  test('no reintenta si el login es incorrecto (18456)', async () => {
    mockConectar.mockRejectedValue(errorConexion('ELOGIN', 18456));
    await expect(baseDatos.obtenerPool()).rejects.toMatchObject({ codigo: 'BD_NO_DISPONIBLE' });
    expect(mockConectar).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  test('tras un fallo, la siguiente llamada vuelve a intentar', async () => {
    mockConectar.mockRejectedValueOnce(errorConexion('ELOGIN', 18456)).mockResolvedValueOnce();
    await expect(baseDatos.obtenerPool()).rejects.toBeDefined();
    await expect(baseDatos.obtenerPool()).resolves.toBeDefined();
    expect(mockConectar).toHaveBeenCalledTimes(2);
  });
});

describe('transaccion(fn)', () => {
  beforeEach(() => {
    mockConectar.mockResolvedValue();
  });

  test('hace commit y devuelve el resultado si fn termina bien', async () => {
    const resultado = await baseDatos.transaccion(async (tx) => {
      expect(tx.commit).toBe(mockCommit);
      return 'CR-00001';
    });
    expect(resultado).toBe('CR-00001');
    expect(mockBegin).toHaveBeenCalledTimes(1);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();
    expect(sql.Transaction).toHaveBeenCalledTimes(1);
  });

  test('hace rollback y relanza el error si fn falla', async () => {
    const error = new Error('violación de uq_cita_turno_activa');
    await expect(
      baseDatos.transaccion(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(mockRollback).toHaveBeenCalledTimes(1);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('relanza el error original aunque el rollback también falle', async () => {
    mockRollback.mockRejectedValueOnce(new Error('transacción ya abortada'));
    const error = new Error('fallo original');
    await expect(
      baseDatos.transaccion(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});

describe('crearConfigMssql', () => {
  const base = {
    servidor: 'localhost', puerto: 1433, nombre: 'SIGOP', usuario: 'u', clave: 'c',
    cifrar: true, confiarCertificado: false,
  };

  test('usa el puerto si no hay instancia', () => {
    const c = baseDatos.crearConfigMssql(base);
    expect(c.port).toBe(1433);
    expect(c.options.instanceName).toBeUndefined();
    expect(c.options.encrypt).toBe(true);
  });

  test('usa instanceName (SQLEXPRESS) y omite el puerto', () => {
    const c = baseDatos.crearConfigMssql({ ...base, instancia: 'SQLEXPRESS' });
    expect(c.options.instanceName).toBe('SQLEXPRESS');
    expect(c.port).toBeUndefined();
  });
});
