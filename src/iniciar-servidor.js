'use strict';

// Arranca el servidor HTTP: resuelve cuando ya escucha y rechaza si no puede
// (por ejemplo, EADDRINUSE porque otro proceso ocupa el puerto).
//
// No se usa app.listen(puerto, callback): en Express 5 ese callback también se
// llama con el error de 'error' (node_modules/express/lib/application.js), así
// que un puerto ocupado parecía un arranque correcto y el proceso terminaba en
// silencio con código 0.
const http = require('node:http');

/**
 * @param {import('express').Express} app
 * @param {number} puerto
 * @returns {Promise<http.Server>}
 */
function iniciarServidor(app, puerto) {
  return new Promise((resolver, rechazar) => {
    const servidor = http.createServer(app);
    servidor.once('error', rechazar);
    servidor.listen(puerto, () => {
      servidor.off('error', rechazar);
      resolver(servidor);
    });
  });
}

module.exports = { iniciarServidor };
