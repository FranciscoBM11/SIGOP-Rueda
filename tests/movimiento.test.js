'use strict';

// Movimiento y microinteracciones (Fase 3, sección 8.7). Solo interfaz: sin cambios de API.
// Reglas: solo transform/opacity (excepción documentada: trazo de íconos), respuestas a
// clics 150–350 ms, entradas 600–900 ms, respeta prefers-reduced-motion, nada queda
// oculto si el JS falla, nada tapa los botones y no hay animación al escribir.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publico = path.join(__dirname, '..', 'public');
const leer = (ruta) => fs.readFileSync(path.join(publico, ruta), 'utf8');
const css = leer('css/tailwind.css');

/** Carga un módulo ES del navegador en un contexto aislado (sin imports; los da `globales`). */
function cargarModulo(archivo, globales = {}) {
  const fuente = leer(path.join('js', archivo))
    .replace(/^import .*$/gm, '')
    .replace(/^export (const|function|let) /gm, '$1 ');
  const nombres = [...fuente.matchAll(/^(?:const|function|let) (\w+)/gm)].map((m) => m[1]);
  const contexto = { ...globales };
  vm.runInNewContext(`${fuente}\n${nombres.map((n) => `this.${n} = ${n};`).join('\n')}`, contexto);
  return contexto;
}

/** Duración en ms del primer tiempo de una parte de animation/transition (el segundo es el retraso). */
function duracionDe(parte) {
  const tokens = parte.trim().split(/\s+/);
  if (tokens.some((x) => x.startsWith('var(--dur-'))) return null; // duración por token (validada aparte)
  const t = tokens.find((x) => /^\d+(\.\d+)?m?s$/.test(x));
  if (!t) return null;
  return { ms: t.endsWith('ms') ? Number.parseFloat(t) : Number.parseFloat(t) * 1000, tokens };
}

describe('CSS de movimiento', () => {
  test('no usa «transition: all» ni anima propiedades de diseño en lo nuevo', () => {
    expect(css).not.toMatch(/transition:\s*all/);
    const bloque = css.slice(css.indexOf('Movimiento y microinteracciones'));
    expect(bloque).not.toMatch(/transition:\s*(width|height|top|left|margin|padding)/);
  });

  test('los keyframes solo tocan opacity y transform (excepción: «trazo» de los íconos)', () => {
    const keyframes = [...css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^}]*\})+)\s*\}/g)];
    expect(keyframes.length).toBeGreaterThan(15);
    for (const [, nombre, cuerpo] of keyframes) {
      const propiedades = [...cuerpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      const permitidas = nombre === 'trazo' ? ['stroke-dashoffset'] : ['opacity', 'transform'];
      for (const prop of propiedades) expect(permitidas).toContain(prop);
    }
  });

  test('respuestas a clics 150–350 ms; entradas de página y scroll 600–900 ms; 24–40 px', () => {
    const tokens = Object.fromEntries([...css.matchAll(/--dur-([a-z]+):\s*(\d+)ms/g)].map((m) => [m[1], Number(m[2])]));
    expect(Object.keys(tokens).sort()).toEqual(['corta', 'larga', 'lenta', 'media', 'presion']);
    for (const clave of ['presion', 'corta', 'media']) {
      expect(tokens[clave]).toBeGreaterThanOrEqual(150);
      expect(tokens[clave]).toBeLessThanOrEqual(350);
    }
    for (const clave of ['larga', 'lenta']) {
      expect(tokens[clave]).toBeGreaterThanOrEqual(600);
      expect(tokens[clave]).toBeLessThanOrEqual(900);
    }
    const distancia = Number(css.match(/--dist-entrada:\s*(\d+)px/)[1]);
    expect(distancia).toBeGreaterThanOrEqual(24);
    expect(distancia).toBeLessThanOrEqual(40);

    // Duraciones escritas a mano (sin contar los bucles lentos, que se validan aparte).
    for (const [, valor] of css.matchAll(/(?:^|\s)(?:animation|transition):\s*([^;]+);/gm)) {
      for (const parte of valor.split(',')) {
        const d = duracionDe(parte);
        if (!d || d.ms === 0 || d.tokens.includes('infinite')) continue;
        expect(d.ms).toBeGreaterThanOrEqual(150);
        expect(d.ms).toBeLessThanOrEqual(1200); // máximo: la foto que se asienta bajo su cortina
      }
    }
  });

  test('las respuestas a clics se quedan cortas (diálogos, menú «⋯», presión, paso del flujo)', () => {
    expect(css).toMatch(/dialog\[open\] \{\s*animation: emerger var\(--dur-media\)/);
    expect(css).toMatch(/#menu-acciones:not\(\[hidden\]\) \{\s*animation: emerger var\(--dur-corta\)/);
    const mov = leer('js/movimiento.js');
    const entrar = mov.slice(mov.indexOf('export function entrarVista'));
    expect(Number(entrar.match(/duration: (\d+)/)[1])).toBeLessThanOrEqual(350);
  });

  test('bucles: el afiche flota lento (ciclo 6–8 s, ±6 px) y el brillo cruza con pausa larga', () => {
    const flota = css.match(/\.hero-afiche-flota \{\s*animation: flotar ([\d.]+)s ease-in-out -[\d.]+s infinite alternate;/);
    expect(flota).not.toBeNull();
    const ciclo = Number(flota[1]) * 2; // alternate: ida y vuelta
    expect(ciclo).toBeGreaterThanOrEqual(6);
    expect(ciclo).toBeLessThanOrEqual(8);
    expect(css).toMatch(/@keyframes flotar \{\s*from \{ transform: translateY\(-6px\); \}\s*to \{ transform: translateY\(6px\); \}/);
    // Brillo: cruza en el 14 % de 7 s (~1 s) y descansa el resto.
    expect(css).toMatch(/animation: brillo 7s ease-in-out [\d.]+s infinite;/);
    expect(css).toMatch(/14%, 100% \{ transform: translateX\(360%\)/);
  });

  test('nada tapa los botones: capas decorativas sin clics y detrás del texto', () => {
    const regla = (selector) => {
      const i = css.indexOf(`${selector} {`);
      expect(i).toBeGreaterThan(-1);
      return css.slice(i, css.indexOf('}', i));
    };
    for (const sel of ['.boton-brillo::after', '.progreso-lectura', '.hero-fondo', '.imagen-revela::after', '.indicador-menu', '.servicio-boton::after,\n  .tarjeta-opcion::after', '.tarjeta-opcion::before']) {
      expect(regla(sel)).toContain('pointer-events: none');
    }
    expect(regla('.boton-brillo::after')).toContain('z-index: -1');
    expect(regla('.hero-fondo')).toContain('z-index: -1');
    expect(css).toMatch(/li\.fila-destello::before \{[^}]*pointer-events: none/);
  });

  test('movimiento reducido: sin animaciones, nada oculto, sin capas decorativas', () => {
    const reducido = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducido).toMatch(/animation: none !important/);
    expect(reducido).toMatch(/transition: none !important/);
    expect(reducido).toMatch(/\[data-revelar\] \{\s*opacity: 1 !important;\s*transform: none !important;/);
    expect(reducido).toMatch(/scale: none !important/);
    for (const capa of ['.imagen-revela::after', '.progreso-lectura', '.hero-fondo', '.boton-brillo::after', '.indicador-menu']) {
      expect(reducido).toContain(capa);
    }
  });

  test('los efectos al pasar el cursor solo aplican con mouse (sin hover pegado al tocar)', () => {
    for (const selector of ['.servicio-boton:hover', '.tarjeta-opcion:hover', '.fila-accion:hover svg', '.hero-afiche-marco:hover']) {
      const i = css.indexOf(selector);
      const antes = css.slice(Math.max(0, i - 200), i);
      expect(antes).toContain('@media (hover: hover) and (pointer: fine)');
    }
  });

  test('la sombra de las tarjetas aparece por opacidad de una capa (no se anima box-shadow)', () => {
    const bloque = css.slice(css.indexOf('Movimiento y microinteracciones'));
    expect(bloque).not.toMatch(/transition:[^;]*box-shadow/);
    expect(css).toMatch(/\.servicio-boton:hover::after,\s*\.tarjeta-opcion:hover::after \{\s*opacity: 1;/);
    expect(leer('index.html')).not.toContain('hover:shadow-[');
  });

  test('presionar da respuesta y el toque no destella', () => {
    expect(css).toMatch(/:not\(:disabled\):active \{\s*scale: 0\.97;/);
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
    expect(css).toContain('touch-action: manipulation');
  });

  test('cada animación usada existe en el CSS compilado (npm run css)', () => {
    const compilado = leer('css/app.css');
    const definidas = new Set([...compilado.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]));
    const bloque = css.slice(css.indexOf('@keyframes panel-aparece'));
    const usadas = new Set([...bloque.matchAll(/animation(?:-name)?:\s*([a-z][\w-]*)/g)].map((m) => m[1]).filter((n) => n !== 'none'));
    expect(usadas.size).toBeGreaterThan(15);
    for (const nombre of usadas) expect(definidas).toContain(nombre);
  });

  test('las entradas no dejan «fill: both» (crearía capas que tapan los paneles de servicio)', () => {
    const conBoth = [...css.matchAll(/animation:\s*([\w-]+)[^;]*\bboth;/g)].map((m) => m[1]);
    // Solo las ligadas al scroll (sostienen su valor) y la insignia que sale (se retira del DOM).
    expect(conBoth.sort()).toEqual(['insignia-sale', 'parallax-fondo', 'progreso-lectura']);
  });

  test('las líneas de tiempo de scroll solo se usan si el navegador las soporta', () => {
    for (const [, cuerpo] of css.matchAll(/animation-timeline: scroll\(root\)/g)) expect(cuerpo).toBeUndefined();
    const usos = [...css.matchAll(/animation-timeline: scroll\(root\);/g)].map((m) => css.lastIndexOf('@supports', m.index));
    expect(usos).toHaveLength(2);
    for (const i of usos) expect(css.slice(i, i + 50)).toContain('@supports (animation-timeline: scroll())');
  });

  test('no hay animaciones sobre los campos de formulario (nada al escribir)', () => {
    expect(css).not.toMatch(/(input|textarea|select)[^{]*\{[^}]*animation/);
  });
});

describe('Hero y secciones de la portada', () => {
  const html = leer('index.html');

  test('título palabra por palabra sin perder el texto accesible del h1', () => {
    const h1 = html.match(/<h1 id="titulo-hero"[^>]*>([\s\S]*?)<\/h1>/)[1];
    expect(h1.replace(/<[^>]+>/g, '')).toBe('Clínica Rueda');
    expect(h1.match(/class="palabra-mascara"/g)).toHaveLength(2);
  });

  test('afiche: flota en su capa y se asienta en su marco; fondo con parallax y barra de lectura', () => {
    expect(html).toMatch(/<div class="hero-afiche-flota [^"]*">\s*<div class="hero-afiche-marco [^"]*">\s*<div class="hero-imagen w-full" role="img" aria-label="Portada/);
    expect(html).toContain('<div class="hero-fondo" aria-hidden="true"></div>');
    expect(html).toContain('<div class="progreso-lectura print:hidden" aria-hidden="true"></div>');
  });

  test('los botones del hero no esperan más que el texto', () => {
    expect(html).toMatch(/<div class="hero-paso retraso-3 mt-8 flex/);
    expect(html).toMatch(/class="boton-brillo boton-brillo--claro fila-accion/);
  });

  test('fotos con cortina, íconos que se dibujan y contacto escalonado', () => {
    expect(html.match(/data-revelar class="imagen-revela/g)).toHaveLength(2);
    expect(html.match(/class="icono-trazo h-6 w-6"/g)).toHaveLength(4);
    const iconos = [...html.matchAll(/class="icono-trazo h-6 w-6">([\s\S]*?)<\/svg>/g)].map((m) => m[1]);
    for (const svg of iconos) {
      const formas = svg.match(/<(path|circle|rect)\b[^>]*>/g);
      for (const f of formas) expect(f).toContain('pathLength="1"');
    }
    expect(html.match(/data-revelar class="contacto-item/g)).toHaveLength(3);
    expect(html).toContain('data-revelar class="contacto-nota');
  });

  test('las secciones llevan data-revelar sin valor (visibles por defecto) y cargan revelar.js', () => {
    expect(html).toContain('<script type="module" src="/js/revelar.js"></script>');
    expect(html.match(/data-revelar class=/g).length).toBeGreaterThanOrEqual(14);
    expect(html).not.toMatch(/data-revelar="/); // ningún estado oculto escrito en el HTML
  });

  test('la barra «Agendar cita» brilla en todas las páginas que la tienen', () => {
    for (const pagina of ['index.html', 'calculadora.html', 'mi-cita.html', 'privacidad.html', 'resultados.html']) {
      expect(leer(pagina)).toMatch(/<div class="barra-agendar print:hidden lg:hidden">\s*<a href="\/agendar\.html" class="boton-brillo /);
    }
  });
});

describe('revelar.js: seguro si algo falla', () => {
  /** Documento falso con nodos en distintas posiciones. */
  function escenario({ reducido = false, conObservador = true } = {}) {
    const nodos = [100, 2000].map((top) => ({
      atributos: { 'data-revelar': '' },
      getBoundingClientRect: () => ({ top }),
      setAttribute(k, v) {
        this.atributos[k] = v;
      },
    }));
    const observados = [];
    const globales = {
      movimientoReducido: () => reducido,
      document: { querySelectorAll: () => nodos, querySelector: () => null, addEventListener() {} },
      window: { innerHeight: 800, addEventListener() {} },
    };
    if (conObservador) {
      globales.window.IntersectionObserver = true;
      globales.IntersectionObserver = class {
        observe(n) {
          observados.push(n);
        }
      };
    }
    return { nodos, observados, modulo: cargarModulo('revelar.js', globales) };
  }

  test('solo oculta lo que está fuera de pantalla; lo visible queda quieto', () => {
    const { nodos, observados } = escenario();
    expect(nodos[0].atributos['data-revelar']).toBe('');
    expect(nodos[1].atributos['data-revelar']).toBe('pendiente');
    expect(observados).toEqual([nodos[1]]);
  });

  test('con movimiento reducido o sin IntersectionObserver no oculta nada', () => {
    for (const opciones of [{ reducido: true }, { conObservador: false }]) {
      const { nodos } = escenario(opciones);
      expect(nodos.map((n) => n.atributos['data-revelar'])).toEqual(['', '']);
    }
  });

  test('progreso de lectura: fracción acotada entre 0 y 1', () => {
    const { fraccionLeida } = escenario().modulo;
    expect(fraccionLeida(0, 3000, 800)).toBe(0);
    expect(fraccionLeida(1100, 3000, 800)).toBe(0.5);
    expect(fraccionLeida(5000, 3000, 800)).toBe(1);
    expect(fraccionLeida(-40, 3000, 800)).toBe(0); // rebote del scroll en iOS
    expect(fraccionLeida(0, 600, 800)).toBe(0); // página más corta que la ventana
  });
});

describe('movimiento.js', () => {
  function modulo(reducido) {
    return cargarModulo('movimiento.js', { window: { matchMedia: () => ({ matches: reducido }) } });
  }

  test('con movimiento reducido no anima ni reinicia pulsos', () => {
    const { animar, reiniciarClase } = modulo(true);
    const nodo = { animate: jest.fn(), classList: { add: jest.fn(), remove: jest.fn() } };
    expect(animar(nodo, [], { duration: 200 })).toBeNull();
    reiniciarClase(nodo, 'pulso-seleccion');
    expect(nodo.animate).not.toHaveBeenCalled();
    expect(nodo.classList.add).not.toHaveBeenCalled();
  });

  test('sin reducción usa la curva de salida y la duración pedida', () => {
    const { animar, EASE_SALIDA } = modulo(false);
    const nodo = { animate: jest.fn(() => 'animacion') };
    expect(animar(nodo, [{ opacity: 0 }], { duration: 200 })).toBe('animacion');
    expect(nodo.animate).toHaveBeenCalledWith([{ opacity: 0 }], { easing: EASE_SALIDA, duration: 200 });
  });

  test('reiniciarClase quita y vuelve a poner la clase (vuelve a disparar el pulso)', () => {
    const { reiniciarClase } = modulo(false);
    const orden = [];
    const nodo = { offsetWidth: 0, classList: { add: (c) => orden.push(`+${c}`), remove: (c) => orden.push(`-${c}`) } };
    reiniciarClase(nodo, 'pulso-seleccion');
    expect(orden).toEqual(['-pulso-seleccion', '+pulso-seleccion']);
  });

  test('el escalonado tiene tope (la fila 20 no espera 20 veces)', () => {
    const { escalonar, TOPE_ESCALONADO } = modulo(false);
    const hijos = Array.from({ length: 20 }, () => ({ style: { valores: {}, setProperty(k, v) { this.valores[k] = v; } } }));
    const clases = new Set();
    const contenedor = { children: hijos, offsetWidth: 0, classList: { add: (c) => clases.add(c), remove: (...c) => c.forEach((x) => clases.delete(x)) } };
    escalonar(contenedor, 'entra-escalonado-rapido');
    expect(hijos.map((h) => Number(h.style.valores['--i']))).toEqual(Array.from({ length: 20 }, (_, i) => Math.min(i, TOPE_ESCALONADO)));
    expect(clases.has('entra-escalonado-rapido')).toBe(true);
  });
});

describe('Menú lateral', () => {
  test('cascada solo en la primera página de la sesión y solo en escritorio', () => {
    const estado = leer('js/menu-estado.js');
    expect(estado).toContain("sessionStorage.getItem('sigop.menu-visto')");
    expect(estado).toContain("setAttribute('data-menu-cascada', '')");
    expect(css).toMatch(/@media \(width >= 64rem\) \{\s*\[data-menu-cascada\] \.menu-lateral nav > \*/);
  });

  test('indicador deslizante: solo transform, sin alterar la cascada ni con movimiento reducido', () => {
    const js = leer('js/menu-publico.js');
    expect(js).toContain('nav.append(barra)');
    expect(js).toContain("barra.style.transform = `translateY(");
    expect(js).toMatch(/prefers-reduced-motion: reduce\)'\)\.matches\) return;/);
  });
});

describe('Agendar, calculadora y agenda del personal', () => {
  test('agendar: los pasos entran desde la dirección del avance y no se anima al cargar', () => {
    const js = leer('js/agendar.js');
    expect(js).toMatch(/entrarVista\(\$\(`paso-\$\{paso\}`\), direccion\)/);
    expect(js).toContain('irAPaso(1, { enfocar: false, animar: false });');
    // Elegir un turno no repite la entrada de toda la lista.
    expect(js).toMatch(/pintar\(turnos, \{ recienElegido: t\.id \}\)/);
    expect(js).toContain("quitarEscalonado($('lista-turnos'))");
  });

  test('agendar: tarjetas de servicio con elevación y pulso al elegir', () => {
    const js = leer('js/agendar.js');
    expect(js).toContain("class: 'tarjeta-opcion flex");
    expect(js).toContain("reiniciarClase(tarjeta, 'pulso-seleccion')");
    expect(css).toMatch(/\.tarjeta-opcion\.pulso-seleccion::before \{\s*animation: anillo/);
    expect(css).toMatch(/\.paso::before \{[^}]*transition: transform 700ms/);
  });

  test('calculadora: la barra se llena con transform, no con width', () => {
    const js = leer('js/calculadora.js');
    expect(js).not.toContain('style.width');
    expect(js).toContain("setProperty('--avance', avance)");
    expect(css).toMatch(/\.barra-semanas \{\s*transform: translateX/);
  });

  test('agenda: cambiar un estado o filtrar no repite el escalonado; la fila cambiada destella', () => {
    const js = leer('js/admin-agenda.js');
    expect(js.match(/await cargar\(\{ conservarAviso: true, entrada: false \}\)/g)).toHaveLength(3);
    expect(js.match(/estado\.destello = c\.codigo/g)).toHaveLength(3);
    expect(js).toContain('pintar({ fundido: true })');
    expect(js).toContain("escalonar($('filas'), 'entra-escalonado-rapido')");
    // La insignia anterior queda oculta para lectores de pantalla y se retira al terminar.
    expect(js).toContain("anterior.setAttribute('aria-hidden', 'true')");
    expect(css).toMatch(/\.entra-escalonado-rapido > \* \{\s*animation: deslizar-izq/);
  });

  test('menú «⋯» y diálogos se abren con suavidad', () => {
    expect(leer('js/admin-agenda.js')).toContain('panel.style.transformOrigin');
  });
});
