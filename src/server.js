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
const { iniciarServidor } = require('./iniciar-servidor');

let servidor;
iniciarServidor(crearApp(), config.puerto)
  .then((s) => {
    servidor = s;
    s.on('error', (err) => registro.error('servidor_error', { error: registro.resumirError(err) }));
    registro.info('servidor_iniciado', { puerto: config.puerto, entorno: config.entorno });
  })
  .catch((err) => {
    const mensaje =
      err.code === 'EADDRINUSE'
        ? `El puerto ${config.puerto} ya está en uso: cierra el otro servidor (p. ej. otro «npm run dev») o cambia PUERTO.`
        : 'No se pudo iniciar el servidor HTTP.';
    registro.error('servidor_no_iniciado', { puerto: config.puerto, codigo: err.code, mensaje });
    process.exit(1);
  });

let cerrando = false;
async function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  registro.info('servidor_apagando', { senal });
  if (!servidor) process.exit(0);
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
