'use strict';

// Carga y valida las variables de entorno al iniciar (Fase 3, Tabla 56).
// Si falta una variable obligatoria la aplicación no arranca.
const fs = require('node:fs');
const path = require('node:path');
const { z } = require('zod');

const RUTA_ENV = path.resolve(__dirname, '..', '..', '.env');

const booleano = z
  .enum(['true', 'false'], { message: 'debe ser true o false' })
  .transform((v) => v === 'true');

const vacioComoIndefinido = (v) => (v === '' ? undefined : v);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DB_SERVIDOR: z.string().min(1),
  DB_PUERTO: z.coerce.number().int().min(1).max(65535).default(1433),
  DB_INSTANCIA: z.preprocess(vacioComoIndefinido, z.string().optional()),
  DB_NOMBRE: z.string().min(1),
  DB_USUARIO: z.string().min(1),
  DB_CLAVE: z.string().min(1),
  DB_CIFRAR: booleano.default(true),
  DB_CONFIAR_CERTIFICADO: booleano.default(false),

  CLAVE_CIFRADO: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'debe tener 64 caracteres hexadecimales (32 bytes)'),
  SECRETO_SESION: z.string().min(32, 'debe tener al menos 32 caracteres'),

  // Correo (Nodemailer). Obligatorias en producción. En desarrollo y pruebas,
  // si SMTP_HOST está vacío se usa un canal simulado que no envía nada.
  SMTP_HOST: z.preprocess(vacioComoIndefinido, z.string().optional()),
  SMTP_PUERTO: z.preprocess(vacioComoIndefinido, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_SEGURO: z.preprocess(vacioComoIndefinido, booleano.optional()),
  SMTP_USUARIO: z.preprocess(vacioComoIndefinido, z.string().optional()),
  SMTP_CLAVE: z.preprocess(vacioComoIndefinido, z.string().optional()),
  CORREO_REMITENTE: z.preprocess(vacioComoIndefinido, z.string().optional()),
}).superRefine((e, ctx) => {
  const smtp = ['SMTP_HOST', 'SMTP_PUERTO', 'SMTP_SEGURO', 'SMTP_USUARIO', 'SMTP_CLAVE', 'CORREO_REMITENTE'];
  // En producción todas; fuera de producción, si se configura SMTP_HOST, el resto también.
  const exigir = e.NODE_ENV === 'production' || e.SMTP_HOST !== undefined;
  if (!exigir) return;
  for (const nombre of smtp) {
    if (e[nombre] === undefined) ctx.addIssue({ code: 'custom', path: [nombre], message: 'falta' });
  }
});

class ErrorConfiguracion extends Error {
  constructor(problemas) {
    super(
      'Configuración inválida. Revisa el archivo .env (ver .env.example):\n' +
        problemas.map((p) => `  - ${p}`).join('\n'),
    );
    this.name = 'ErrorConfiguracion';
    this.problemas = problemas;
  }
}

/**
 * Valida un conjunto de variables y devuelve la configuración tipada.
 * Los mensajes nombran las variables, nunca muestran sus valores.
 */
function construirConfig(entorno) {
  const resultado = esquema.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => {
      const nombre = i.path.join('.');
      const faltante = entorno[nombre] === undefined || entorno[nombre] === '';
      return faltante ? `${nombre}: falta` : `${nombre}: ${i.message}`;
    });
    throw new ErrorConfiguracion(problemas);
  }
  const e = resultado.data;
  return Object.freeze({
    entorno: e.NODE_ENV,
    esProduccion: e.NODE_ENV === 'production',
    esPrueba: e.NODE_ENV === 'test',
    puerto: e.PORT,
    baseDatos: Object.freeze({
      servidor: e.DB_SERVIDOR,
      puerto: e.DB_PUERTO,
      instancia: e.DB_INSTANCIA,
      nombre: e.DB_NOMBRE,
      usuario: e.DB_USUARIO,
      clave: e.DB_CLAVE,
      cifrar: e.DB_CIFRAR,
      confiarCertificado: e.DB_CONFIAR_CERTIFICADO,
    }),
    claveCifrado: Buffer.from(e.CLAVE_CIFRADO, 'hex'),
    secretoSesion: e.SECRETO_SESION,
    smtp: Object.freeze({
      configurado: e.SMTP_HOST !== undefined,
      host: e.SMTP_HOST,
      puerto: e.SMTP_PUERTO,
      seguro: e.SMTP_SEGURO,
      usuario: e.SMTP_USUARIO,
      clave: e.SMTP_CLAVE,
      remitente: e.CORREO_REMITENTE,
    }),
  });
}

function cargarArchivoEnv() {
  // En Render no existe .env: las variables vienen del panel.
  // loadEnvFile no sobrescribe variables ya definidas en el entorno.
  if (fs.existsSync(RUTA_ENV)) process.loadEnvFile(RUTA_ENV);
}

let configCache;

/** Devuelve la configuración de la aplicación (se calcula una sola vez). */
function obtenerConfig() {
  if (!configCache) {
    cargarArchivoEnv();
    configCache = construirConfig(process.env);
  }
  return configCache;
}

module.exports = { obtenerConfig, construirConfig, ErrorConfiguracion };
