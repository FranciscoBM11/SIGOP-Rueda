// Secciones que aparecen al hacer scroll (portada). Solo interfaz.
//
// Seguro ante fallos: el HTML y el CSS dejan todo VISIBLE. Este módulo solo marca
// como «pendiente» lo que al cargar está fuera de la pantalla (la persona aún no lo
// ve, así que no hay parpadeo) y lo muestra al acercarse. Sin JavaScript, sin
// IntersectionObserver o con movimiento reducido, no se oculta nada.
import { movimientoReducido } from './movimiento.js';

/** ¿El elemento empieza por debajo del borde inferior de la ventana? */
export function fueraDePantalla(rect, altoVentana) {
  return rect.top > altoVentana;
}

function iniciar() {
  const nodos = [...document.querySelectorAll('[data-revelar]')];
  if (nodos.length === 0 || movimientoReducido() || !('IntersectionObserver' in window)) return;

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        entrada.target.setAttribute('data-revelar', 'visible');
        observador.unobserve(entrada.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );

  const alto = window.innerHeight;
  for (const nodo of nodos) {
    if (!fueraDePantalla(nodo.getBoundingClientRect(), alto)) continue; // ya visible: se deja quieto
    nodo.setAttribute('data-revelar', 'pendiente');
    observador.observe(nodo);
  }

  const mostrarTodo = () => {
    for (const nodo of document.querySelectorAll('[data-revelar="pendiente"]')) nodo.setAttribute('data-revelar', 'visible');
  };
  // Al saltar con un ancla o «Saltar al contenido», nada debe quedar oculto.
  window.addEventListener('hashchange', mostrarTodo);
  // Con el teclado: si el foco entra en algo pendiente, se muestra de inmediato.
  document.addEventListener('focusin', (evento) => {
    const pendiente = evento.target.closest?.('[data-revelar="pendiente"]');
    if (pendiente) pendiente.setAttribute('data-revelar', 'visible');
  });
  // Al imprimir, todo visible.
  window.addEventListener('beforeprint', mostrarTodo);
}

/** Fracción leída de la página (0–1). */
export function fraccionLeida(scrollY, altoDocumento, altoVentana) {
  const recorrido = altoDocumento - altoVentana;
  return recorrido > 0 ? Math.min(1, Math.max(0, scrollY / recorrido)) : 0;
}

/**
 * Barra de progreso de lectura. Si el navegador tiene línea de tiempo de scroll, la anima
 * el CSS (fuera del hilo principal) y aquí no se hace nada. Si no, un respaldo liviano:
 * un solo transform por cuadro, con requestAnimationFrame y escucha pasiva.
 */
function iniciarProgreso() {
  const barra = document.querySelector('.progreso-lectura');
  if (!barra || movimientoReducido()) return;
  if (window.CSS?.supports?.('animation-timeline: scroll()')) return;
  let pendiente = false;
  const pintar = () => {
    pendiente = false;
    const f = fraccionLeida(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
    barra.style.transform = `scaleX(${f})`;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(pintar);
    },
    { passive: true },
  );
  pintar();
}

/**
 * Teléfono: el botón flotante de WhatsApp quedaría encima de «Mi cita» del hero. Mientras
 * los botones del hero están a la vista, WhatsApp espera fuera; al bajar, entra con una
 * transición (CSS: [data-whatsapp-espera]). Sin JS se muestra como siempre.
 */
function iniciarWhatsapp() {
  const acciones = document.querySelector('[data-acciones-hero]');
  const boton = document.querySelector('.boton-whatsapp');
  if (!acciones || !boton || !('IntersectionObserver' in window)) return;
  const telefono = window.matchMedia('(width < 64rem)');
  const raiz = document.documentElement;
  let heroVisible = true;
  const pintar = () => raiz.toggleAttribute('data-whatsapp-espera', telefono.matches && heroVisible);
  new IntersectionObserver(([entrada]) => {
    heroVisible = entrada.isIntersecting;
    pintar();
  }).observe(acciones);
  telefono.addEventListener?.('change', pintar);
  pintar();
}

/**
 * Los bucles decorativos (flotado del afiche) se pausan cuando el hero sale de la
 * pantalla: no gastan cuadros ni batería mientras se lee el resto (CSS: [data-hero-fuera]).
 */
function pausarBuclesFueraDeVista() {
  const hero = document.querySelector('section.hero');
  if (!hero || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entrada]) => {
    document.documentElement.toggleAttribute('data-hero-fuera', !entrada.isIntersecting);
  }).observe(hero);
}

if (typeof document !== 'undefined') {
  iniciar();
  iniciarProgreso();
  iniciarWhatsapp();
  pausarBuclesFueraDeVista();
}
