'use strict';

// Arranque del servidor HTTP.
const { obtenerConfig } = require('./config/config');
const registro = require('./common/registro');

let config;
try {
  config = obtenerConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { crearApp } = require('./app');
const { cerrarPool } = require('./config/base-datos');

const servidor = crearApp().listen(config.puerto, () => {
  registro.info('servidor_iniciado', { puerto: config.puerto, entorno: config.entorno });
});

let cerrando = false;
async function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  registro.info('servidor_apagando', { senal });
  servidor.close(async () => {
    await cerrarPool();
    process.exit(0);
  });
  // Si quedan conexiones abiertas, forzar la salida a los 10 s.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
process.on('unhandledRejection', (err) => {
  registro.error('promesa_no_manejada', { error: registro.resumirError(err) });
});
