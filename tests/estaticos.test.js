'use strict';

const request = require('supertest');
const { crearApp } = require('../src/app');

describe('Archivos estáticos desde public/', () => {
  const app = crearApp();

  test('/ sirve index.html en español y adaptable a móvil', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<html lang="es">');
    expect(res.text).toContain('name="viewport"');
  });

  test('sirve la hoja de estilos compilada', async () => {
    const res = await request(app).get('/css/app.css');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/css/);
  });

  test('archivo inexistente fuera de /api → 404', async () => {
    const res = await request(app).get('/no-existe.html');
    expect(res.status).toBe(404);
  });
});

describe('P4 Mi cita (Iteración 2)', () => {
  const app = crearApp();

  test('/mi-cita.html se sirve con su módulo y sin scripts en línea (CSP)', async () => {
    const res = await request(app).get('/mi-cita.html');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<script type="module" src="/js/mi-cita.js"></script>');
    expect(res.text).not.toMatch(/<script>(?!<\/script>)/);
    expect(res.text).toContain('id="form-acceso"');
  });

  test('los módulos de la página existen', async () => {
    for (const ruta of ['/js/mi-cita.js', '/js/selector-turnos.js']) {
      const res = await request(app).get(ruta);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/javascript/);
    }
  });

  test('tiene pantalla de confirmación con salidas y enlaces para volver al inicio', async () => {
    const res = await request(app).get('/mi-cita.html');
    expect(res.text).toContain('id="confirmacion"');
    expect(res.text).toContain('id="conf-ver-cita"');
    expect(res.text).toMatch(/id="conf-agendar" href="\/agendar\.html"/);
    // Volver al inicio: en el acceso, en la tarjeta de la cita y en la confirmación.
    expect(res.text.match(/href="\/"[^>]*>[^<]*Volver al inicio/g)).toHaveLength(3);
  });

  test('el inicio enlaza a Mi cita', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('href="/mi-cita.html"');
  });
});

describe('Panel administrativo (Iteración 3)', () => {
  const app = crearApp();

  test.each([
    ['/admin/login.html', '/js/admin-login.js', 'id="form-login"'],
    ['/admin/agenda.html', '/js/admin-agenda.js', 'id="dlg-triaje"'],
  ])('%s se sirve con su módulo, sin scripts en línea y sin indexar', async (ruta, modulo, marca) => {
    const res = await request(app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`<script type="module" src="${modulo}"></script>`);
    expect(res.text).not.toMatch(/<script>(?!<\/script>)/);
    expect(res.text).toContain('name="robots" content="noindex"');
    expect(res.text).toContain(marca);
  });

  test('la agenda tiene forma de cerrar sesión y volver al menú', async () => {
    const res = await request(app).get('/admin/agenda.html');
    expect(res.text).toContain('data-cerrar-sesion');
    expect(res.text).toContain('href="/admin/agenda.html"');
    expect(res.text).toContain('id="abrir-menu"');
  });

  test('/admin redirige a la agenda', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/agenda.html');
  });

  test.each(['/js/admin-comun.js', '/js/admin-login.js', '/js/admin-agenda.js'])('existe %s', async (ruta) => {
    const res = await request(app).get(ruta);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });
});

describe('Sin autocompletado del navegador (dispositivos compartidos)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const publico = path.join(__dirname, '..', 'public');

  // Recorre todas las páginas, también las que se agreguen después.
  function paginas(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'css' || e.name === 'js' ? [] : paginas(ruta);
      return e.name.endsWith('.html') ? [path.relative(publico, ruta)] : [];
    });
  }

  test.each(paginas(publico))('%s: formularios y campos con autocomplete', (pagina) => {
    const html = fs.readFileSync(path.join(publico, pagina), 'utf8');
    const etiquetas = html.match(/<(form|input|textarea|select)\b[^>]*>/g) ?? [];
    for (const etiqueta of etiquetas) {
      expect(etiqueta).toMatch(/autocomplete="(off|new-password)"/);
    }
  });

  test('login: usuario off y contraseña new-password', () => {
    const html = fs.readFileSync(path.join(publico, 'admin', 'login.html'), 'utf8');
    expect(html).toMatch(/<input id="usuario"[^>]*autocomplete="off"/);
    expect(html).toMatch(/<input id="contrasena"[^>]*autocomplete="new-password"/);
  });

  test('los campos del triaje creados con JS llevan autocomplete off', () => {
    const js = fs.readFileSync(path.join(publico, 'js', 'agendar.js'), 'utf8');
    expect(js).toMatch(/const comunes = \{[^}]*autocomplete: 'off'/);
  });
});
