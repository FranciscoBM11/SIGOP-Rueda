'use strict';

// Túnel de Cloudflare (cloudflared en la misma computadora): req.ip debe ser la
// IP real de la persona para los límites de intentos (RN-12, RN-15) y el hash
// de la IP, sin que nadie pueda falsificarla enviando X-Forwarded-For.

jest.mock('../src/config/base-datos', () => ({
  obtenerPool: jest.fn(),
  transaccion: jest.fn(),
  cerrarPool: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { crearApp, confianzaProxy } = require('../src/app');
const { manejadorErrores } = require('../src/common/errores');
const { limitePeticiones } = require('../src/common/middlewares/limite-peticiones');

const IP_CLIENTE = '203.0.113.7'; // rango de documentación (RFC 5737)
const IP_FALSA = '198.51.100.99';

/** req.ip tal como lo calcula Express con la configuración real de la app. */
function ipVista(app, { desde, xff }) {
  const req = Object.create(app.request);
  req.app = app;
  req.socket = { remoteAddress: desde };
  req.headers = xff ? { 'x-forwarded-for': xff } : {};
  return req.ip;
}

describe('trust proxy (cloudflared en la misma computadora)', () => {
  const app = crearApp();

  test('fuera de producción confía solo en loopback; en Render, un salto', () => {
    expect(app.get('trust proxy')).toBe('loopback');
    expect(confianzaProxy('development')).toBe('loopback');
    expect(confianzaProxy('test')).toBe('loopback');
    expect(confianzaProxy('production')).toBe(1);
  });

  test('desde loopback (el túnel) con X-Forwarded-For, req.ip es la IP del cliente', () => {
    expect(ipVista(app, { desde: '127.0.0.1', xff: IP_CLIENTE })).toBe(IP_CLIENTE);
    expect(ipVista(app, { desde: '::1', xff: IP_CLIENTE })).toBe(IP_CLIENTE);
    expect(ipVista(app, { desde: '::ffff:127.0.0.1', xff: IP_CLIENTE })).toBe(IP_CLIENTE);
  });

  test('por el túnel, una IP falsa que la persona antepone no reemplaza a la real', () => {
    // cloudflared agrega la IP real al final; lo que la persona envió queda antes.
    expect(ipVista(app, { desde: '127.0.0.1', xff: `${IP_FALSA}, ${IP_CLIENTE}` })).toBe(IP_CLIENTE);
  });

  test('sin proxy (conexión directa por la red) no se puede falsificar con X-Forwarded-For', () => {
    expect(ipVista(app, { desde: '192.168.1.50', xff: IP_FALSA })).toBe('192.168.1.50');
    expect(ipVista(app, { desde: IP_CLIENTE, xff: '127.0.0.1' })).toBe(IP_CLIENTE);
  });

  test('sin X-Forwarded-For, req.ip es la del socket', () => {
    expect(ipVista(app, { desde: '127.0.0.1' })).toBe('127.0.0.1');
  });

  test('extremo a extremo: por loopback con X-Forwarded-For llega la IP del cliente', async () => {
    const eco = express();
    eco.set('trust proxy', app.get('trust proxy'));
    eco.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const res = await request(eco).get('/ip').set('X-Forwarded-For', IP_CLIENTE);
    expect(res.body.ip).toBe(IP_CLIENTE);
  });

  test('el límite por IP (RN-15) cuenta a cada persona del túnel por separado', async () => {
    const eco = express();
    eco.set('trust proxy', app.get('trust proxy'));
    eco.get('/x', limitePeticiones({ maximo: 1 }), (req, res) => res.sendStatus(204));
    eco.use(manejadorErrores);

    const a1 = await request(eco).get('/x').set('X-Forwarded-For', IP_CLIENTE);
    const a2 = await request(eco).get('/x').set('X-Forwarded-For', IP_CLIENTE);
    const b1 = await request(eco).get('/x').set('X-Forwarded-For', IP_FALSA);
    expect(a1.status).toBe(204);
    expect(a2.status).toBe(429);
    expect(b1.status).toBe(204);
  });
});
