'use strict';

// Arranque del servidor HTTP: un puerto ocupado debe ser un error visible,
// no un «servidor_iniciado» seguido de una salida silenciosa con código 0.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { iniciarServidor } = require('../src/iniciar-servidor');
const { crearApp } = require('../src/app');

const cerrar = (s) => new Promise((r) => s.close(() => r()));

describe('iniciarServidor', () => {
  test('resuelve cuando el servidor ya escucha y responde', async () => {
    const servidor = await iniciarServidor(crearApp(), 0);
    try {
      expect(servidor.listening).toBe(true);
      const { port } = servidor.address();
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/salud`);
      expect(res.status).toBe(200);
    } finally {
      await cerrar(servidor);
    }
  });

  test('si el puerto está ocupado rechaza con EADDRINUSE (no da por iniciado el servidor)', async () => {
    const ocupante = net.createServer();
    await new Promise((r) => ocupante.listen(0, r));
    const { port } = ocupante.address();
    try {
      await expect(iniciarServidor(crearApp(), port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
    } finally {
      await cerrar(ocupante);
    }
  });
});

describe('src/server.js', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');

  test('arranca con iniciarServidor y no con app.listen(callback), que en Express 5 recibe también el error', () => {
    expect(fuente).toContain('iniciarServidor(crearApp(), config.puerto)');
    expect(fuente).not.toMatch(/\.listen\(/);
  });

  test('si no puede escuchar, lo registra y sale con código 1', () => {
    expect(fuente).toMatch(/\.catch\(\(err\) => \{[\s\S]*servidor_no_iniciado[\s\S]*process\.exit\(1\)/);
  });
});
