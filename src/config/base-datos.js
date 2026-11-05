'use strict';

// Pool de conexiones a SQL Server, reintento y ayudante de transacciones
// (Fase 3, Tabla 56). La conexión es perezosa: no se abre al arrancar el
// servidor, sino en la primera consulta, para no despertar a Azure SQL.
const sql = require('mssql');
const registro = require('../common/registro');
const { ErrorNegocio } = require('../common/errores');

const INTENTOS = 3;
const ESPERA_BASE_MS = 2000; // 2 s, luego 4 s
// Errores de Azure SQL que indican base pausada o en reanudación.
const NUMEROS_TRANSITORIOS = new Set([40613, 40197, 40501, 49918, 49919, 49920, 4060]);
// Login incorrecto: no tiene sentido reintentar.
const NUMERO_LOGIN_FALLIDO = 18456;

let poolListo = null; // Promise<ConnectionPool>
let esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function crearConfigMssql(bd) {
  const config = {
    server: bd.servidor,
    database: bd.nombre,
    user: bd.usuario,
    password: bd.clave,
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: bd.cifrar,
      trustServerCertificate: bd.confiarCertificado,
    },
  };
  if (bd.instancia) config.options.instanceName = bd.instancia;
  else config.port = bd.puerto;
  return config;
}

function numeroSql(err) {
  return err?.number ?? err?.originalError?.number ?? err?.originalError?.info?.number;
}

function esTransitorio(err) {
  const numero = numeroSql(err);
  if (numero === NUMERO_LOGIN_FALLIDO) return false;
  if (NUMEROS_TRANSITORIOS.has(numero)) return true;
  // Azure SQL pausado: "Database '...' on server '...' is not currently available."
  if (err?.code === 'ELOGIN' && /not currently available|40613/i.test(err.message ?? '')) return true;
  return ['ETIMEOUT', 'ESOCKET', 'ECONNCLOSED', 'ECONNRESET'].includes(err?.code);
}

async function conectarConReintento(configMssql) {
  let ultimoError;
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    const pool = new sql.ConnectionPool(configMssql);
    try {
      await pool.connect();
      if (intento > 1) registro.info('bd_conectada', { intento });
      return pool;
    } catch (err) {
      ultimoError = err;
      const reintentar = intento < INTENTOS && esTransitorio(err);
      registro.warn('bd_error_conexion', {
        intento,
        codigo: err.code,
        numeroSql: numeroSql(err),
        reintentar,
      });
      if (!reintentar) break;
      await esperar(ESPERA_BASE_MS * 2 ** (intento - 1));
    }
  }
  const error = new ErrorNegocio(
    'BD_NO_DISPONIBLE',
    'El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.',
    503,
  );
  error.cause = ultimoError;
  throw error;
}

/**
 * Devuelve el pool conectado. La primera llamada conecta (con reintento);
 * las siguientes reutilizan la misma conexión. Si falla, la próxima llamada
 * vuelve a intentarlo.
 */
function obtenerPool() {
  if (!poolListo) {
    const { obtenerConfig } = require('./config');
    poolListo = conectarConReintento(crearConfigMssql(obtenerConfig().baseDatos)).then((pool) => {
      pool.on('error', (err) => {
        registro.error('bd_error_pool', { error: registro.resumirError(err) });
      });
      return pool;
    });
    poolListo.catch(() => {
      poolListo = null;
    });
  }
  return poolListo;
}

/**
 * Ejecuta fn(transaccion) dentro de una transacción (unidad de trabajo).
 * Hace commit si fn termina bien y rollback si lanza; el error se relanza.
 * Uso: await transaccion(async (tx) => { await tx.request().input(...).query(...) })
 */
async function transaccion(fn) {
  const pool = await obtenerPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const resultado = await fn(tx);
    await tx.commit();
    return resultado;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (errRollback) {
      // SQL Server puede abortar la transacción por su cuenta (XACT_ABORT).
      registro.warn('bd_error_rollback', { codigo: errRollback.code });
    }
    throw err;
  }
}

/** Cierra el pool (apagado ordenado del servidor y fin de pruebas). */
async function cerrarPool() {
  if (!poolListo) return;
  const promesa = poolListo;
  poolListo = null;
  try {
    const pool = await promesa;
    await pool.close();
  } catch {
    // El pool nunca llegó a conectarse: no hay nada que cerrar.
  }
}

/** Solo para pruebas: reemplaza la función de espera para no demorar. */
function _definirEspera(fn) {
  esperar = fn;
}

module.exports = { sql, obtenerPool, transaccion, cerrarPool, esTransitorio, crearConfigMssql, _definirEspera };
