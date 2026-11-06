'use strict';

// Mejoras de usabilidad del portal y del panel (solo interfaz: sin cambios de API).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publico = path.join(__dirname, '..', 'public');
const leer = (ruta) => fs.readFileSync(path.join(publico, ruta), 'utf8');
const PAGINAS_PUBLICAS = ['index.html', 'agendar.html', 'mi-cita.html', 'resultados.html', 'privacidad.html', 'calculadora.html'];

/** Carga una función exportada de un módulo ES del navegador sin transpilar. */
function cargarFuncion(archivo, nombre) {
  const fuente = leer(path.join('js', archivo)).replace(/^export\s+/m, '');
  const contexto = { URLSearchParams };
  vm.runInNewContext(`${fuente}\nthis.${nombre} = ${nombre};`, contexto);
  return contexto[nombre];
}

describe('Menú lateral', () => {
  test.each(PAGINAS_PUBLICAS)('%s: orden Inicio, Agendar, Mi cita, Resultados | Calculadora, Acceso del personal', (pagina) => {
    const html = leer(pagina);
    const nav = html.slice(html.indexOf('aria-label="Principal"'), html.indexOf('</nav>'));
    const etiquetas = [...nav.matchAll(/data-etiqueta="([^"]+)"/g)].map((m) => m[1]);
    expect(etiquetas).toEqual(['Inicio', 'Agendar cita', 'Mi cita', 'Resultados', 'Calculadora de fecha probable de parto', 'Acceso del personal']);
    expect(nav.indexOf('<hr')).toBeGreaterThan(nav.indexOf('data-etiqueta="Resultados"'));
    expect(nav.indexOf('<hr')).toBeLessThan(nav.indexOf('data-etiqueta="Calculadora'));
    // El logo y el nombre llevan a Inicio.
    expect(html).toMatch(/<a href="\/" class="flex min-w-0 items-center gap-3">\s*<img src="\/img\/logo-claro\.png"/);
  });

  test('en modo reducido el nombre aparece al pasar el cursor y al enfocar', () => {
    const css = fs.readFileSync(path.join(publico, 'css', 'tailwind.css'), 'utf8');
    expect(css).toMatch(/\.enlace-menu:hover::after,\s*\[data-menu="encogido"\] \.menu-lateral \.enlace-menu:focus-visible::after/);
    expect(css).toContain('content: attr(data-etiqueta)');
  });
});

describe('Servicios de la portada', () => {
  const html = leer('index.html');

  test('cuatro tarjetas con botón aria-expanded que controla su panel', () => {
    const botones = [...html.matchAll(/<button type="button" id="servicio-(\w+)"[^>]*\s+aria-expanded="false" aria-controls="panel-(\w+)"/g)];
    expect(botones).toHaveLength(4);
    for (const [, id, panel] of botones) {
      expect(panel).toBe(id);
      expect(html).toContain(`<div id="panel-${id}" class="servicio-panel" role="region" aria-labelledby="servicio-${id}" hidden>`);
    }
  });

  test('cada panel tiene preparación, duración y «Agendar este servicio»', () => {
    expect(html.match(/data-preparacion/g)).toHaveLength(4);
    expect(html.match(/data-duracion/g)).toHaveLength(4);
    expect(html.match(/data-agendar[^>]*>Agendar este servicio/g)).toHaveLength(4);
  });

  test('los textos de los servicios están marcados como BORRADOR', () => {
    expect(html.match(/<!-- BORRADOR: explicación pendiente de revisión por la doctora\. -->/g)).toHaveLength(4);
  });

  test('carga su módulo y no usa imágenes anatómicas', () => {
    expect(html).toContain('<script type="module" src="/js/servicios-portada.js"></script>');
    const seccion = html.slice(html.indexOf('id="titulo-servicios"'), html.indexOf('</section>', html.indexOf('id="titulo-servicios"')));
    expect(seccion).not.toContain('<img');
  });
});

describe('Servicio preseleccionado por URL (agendar.html?servicio=)', () => {
  const servicioDeLaUrl = cargarFuncion('parametro-servicio.js', 'servicioDeLaUrl');
  const catalogo = [
    { id: 1, nombre: 'Papanicolaou' },
    { id: 3, nombre: 'Control Prenatal' },
  ];

  test('acepta un id que existe en el catálogo', () => {
    expect(servicioDeLaUrl('?servicio=3', catalogo)).toEqual(catalogo[1]);
  });

  test.each([
    ['sin parámetro', ''],
    ['id que no existe', '?servicio=9'],
    ['cero', '?servicio=0'],
    ['negativo', '?servicio=-1'],
    ['decimal', '?servicio=1.5'],
    ['texto', '?servicio=abc'],
    ['con ceros a la izquierda', '?servicio=01'],
    ['inyección', '?servicio=1%22%3E%3Cscript%3E'],
    ['demasiado largo', '?servicio=1234567890'],
    ['vacío', '?servicio='],
  ])('ignora %s', (_, busqueda) => {
    expect(servicioDeLaUrl(busqueda, catalogo)).toBeNull();
  });

  test('sin catálogo no preselecciona', () => {
    expect(servicioDeLaUrl('?servicio=1', undefined)).toBeNull();
  });

  test('agendar.js usa la validación', () => {
    const js = leer(path.join('js', 'agendar.js'));
    expect(js).toContain("import { servicioDeLaUrl } from './parametro-servicio.js';");
    expect(js).toContain('servicioDeLaUrl(location.search, estado.servicios)');
  });
});

describe('WhatsApp, barra «Agendar cita» y «Cómo llegar»', () => {
  const URL_WA = 'https://wa.me/50577768649?text=Hola%2C%20quisiera%20informaci%C3%B3n%20sobre%20una%20cita%20en%20Cl%C3%ADnica%20Rueda';

  test.each(PAGINAS_PUBLICAS)('%s: botón de WhatsApp con mensaje precargado y nombre accesible', (pagina) => {
    const html = leer(pagina);
    const boton = html.match(/<a href="https:\/\/wa\.me\/[^"]*"[^>]*>/)?.[0];
    expect(boton).toBeDefined();
    expect(boton).toContain(`href="${URL_WA}"`);
    expect(boton).toContain('rel="noopener noreferrer"');
    expect(boton).toMatch(/aria-label="[^"]*WhatsApp[^"]*"/);
  });

  test.each(PAGINAS_PUBLICAS.filter((p) => p !== 'agendar.html'))('%s: barra fija «Agendar cita» en el teléfono', (pagina) => {
    const html = leer(pagina);
    expect(html).toMatch(/<div class="barra-agendar[^"]*lg:hidden">\s*<a href="\/agendar\.html"/);
    expect(html).toContain('<body class="con-barra');
  });

  test('agendar.html no tiene la barra «Agendar cita»', () => {
    const html = leer('agendar.html');
    expect(html).not.toContain('barra-agendar');
    expect(html).not.toContain('con-barra');
  });

  test.each(PAGINAS_PUBLICAS)('%s: los enlaces de ubicación van a las coordenadas de la clínica en otra pestaña', (pagina) => {
    const html = leer(pagina);
    for (const enlace of html.match(/<a href="https:\/\/www\.google\.com\/maps[^"]*"[^>]*>/g) ?? []) {
      expect(enlace).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=12.1451950,-86.2684700"');
      expect(enlace).toContain('target="_blank"');
      expect(enlace).toContain('rel="noopener noreferrer"');
    }
    expect(html).not.toContain('<iframe');
  });

  test('la portada tiene «Cómo llegar» con las coordenadas', () => {
    expect(leer('index.html')).toMatch(/query=12\.1451950,-86\.2684700" target="_blank" rel="noopener noreferrer"[^>]*>Cómo llegar/);
  });

  test('imágenes de la portada con texto alternativo y carga diferida (salvo la portada, que es fondo CSS)', () => {
    const html = leer('index.html');
    const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
    for (const img of main.match(/<img\b[^>]*>/g)) {
      expect(img).toMatch(/alt="[^"]+"/);
      if (!img.includes('logo-claro.png')) expect(img).toContain('loading="lazy"');
    }
  });
});

describe('Agenda del personal', () => {
  const js = leer(path.join('js', 'admin-agenda.js'));
  const html = leer(path.join('admin', 'agenda.html'));

  test('acciones secundarias en un menú «⋯» con aria-expanded', () => {
    expect(html).toContain('id="menu-acciones"');
    expect(js).toContain("'aria-haspopup': 'true'");
    expect(js).toContain("'aria-expanded': 'false'");
    expect(js).toMatch(/texto: 'Marcar «No asistió»', vista: 'no-asistio'/);
    expect(js).toMatch(/texto: 'Reprogramar', vista: 'reprogramar'/);
    expect(js).toMatch(/texto: 'Cancelar cita', vista: 'cancelar'/);
  });

  test('«No asistió» pide confirmación antes de cambiar el estado', () => {
    expect(html).toContain('id="gestion-no-asistio"');
    expect(html).toContain('id="g-si-no-asistio"');
    expect(js).toMatch(/\$\('g-no-asistio'\)\.addEventListener\('click', \(\) => vistaGestion\('no-asistio'\)\)/);
    expect(js).toMatch(/\$\('g-si-no-asistio'\)\.addEventListener\('click', async[\s\S]{0,120}'NO_ASISTIO'/);
  });

  test('la médica abre filtrada en «En espera»; recepción ve todas', () => {
    expect(js).toContain("if (estado.sesion.rol === 'MEDICO') estado.filtro = 'EN_ESPERA';");
    expect(js).toContain("filtro: 'TODAS',");
  });

  test('estados con color semántico y texto', () => {
    for (const [estado, texto] of [['CONFIRMADA', 'Confirmada'], ['EN_ESPERA', 'En espera'], ['ATENDIDA', 'Atendida'], ['NO_ASISTIO', 'No asistió'], ['CANCELADA', 'Cancelada']]) {
      expect(js).toMatch(new RegExp(`${estado}: \\{ texto: '${texto}'`));
    }
    expect(js).toContain('text-info');
    expect(js).toContain('text-aviso');
  });
});
