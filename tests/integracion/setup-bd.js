'use strict';

// Configuración de las pruebas de integración: toma la conexión del .env real,
// pero fuerza el canal de correo simulado (nunca se envían correos reales).
// Jest aísla process.env por archivo, así que process.loadEnvFile() no llega
// al entorno de la prueba: el .env se lee y se copia aquí.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

const rutaEnv = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(rutaEnv)) {
  for (const [clave, valor] of Object.entries(parseEnv(fs.readFileSync(rutaEnv, 'utf8')))) {
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}

process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '';
