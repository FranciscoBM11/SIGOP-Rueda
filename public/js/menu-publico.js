// Menú lateral compartido del portal público. Solo interfaz: no llama a la API.
//
// Escritorio (≥ 1024 px): desplegado por defecto. El tirador del borde lo encoge
// a una barra de íconos y lo vuelve a desplegar; la elección se recuerda en
// localStorage (si no hay almacenamiento, funciona igual pero no se recuerda).
//
// Teléfono: escondido. Se abre con el botón «Menú» o con el tirador, sobre un
// fondo oscuro; se cierra tocando fuera, con Escape, con la X o al elegir una
// opción. Mientras está abierto, el foco del teclado no sale del menú.

const CLAVE = 'sigop.menu';
const raiz = document.documentElement;
const menu = document.getElementById('menu-publico');
const velo = document.getElementById('velo-menu');
const botonMenu = document.getElementById('abrir-menu');
const botonCerrar = document.getElementById('cerrar-menu');
const tirador = document.getElementById('tirador-menu');
const escritorio = window.matchMedia('(min-width: 64rem)');

function guardar(valor) {
  try {
    window.localStorage.setItem(CLAVE, valor);
  } catch {
    // Sin almacenamiento: la elección dura solo mientras la página está abierta.
  }
}

// ---- Escritorio: desplegado / encogido ----

const estaEncogido = () => raiz.getAttribute('data-menu') === 'encogido';

function pintarEscritorio() {
  const encogido = estaEncogido();
  tirador.setAttribute('aria-expanded', String(!encogido));
  tirador.setAttribute('aria-label', encogido ? 'Desplegar menú' : 'Encoger menú');
  // Con el menú encogido, el nombre de cada opción aparece en un globo (CSS) al pasar el cursor o enfocar.
}

function alternarEscritorio() {
  if (estaEncogido()) raiz.removeAttribute('data-menu');
  else raiz.setAttribute('data-menu', 'encogido');
  guardar(estaEncogido() ? 'encogido' : 'desplegado');
  pintarEscritorio();
}

// ---- Teléfono: cajón ----

const estaAbierto = () => menu.hasAttribute('data-abierto');

function pintarMovil() {
  const abierto = estaAbierto();
  botonMenu.setAttribute('aria-expanded', String(abierto));
  tirador.setAttribute('aria-expanded', String(abierto));
  tirador.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
}

function abrir(origen) {
  menu.setAttribute('data-abierto', '');
  velo.setAttribute('data-abierto', '');
  raiz.classList.add('overflow-hidden');
  pintarMovil();
  menu.dataset.origen = origen;
  (botonCerrar ?? tirador).focus();
}

function cerrar({ devolverFoco = true } = {}) {
  if (!estaAbierto()) return;
  menu.removeAttribute('data-abierto');
  velo.removeAttribute('data-abierto');
  raiz.classList.remove('overflow-hidden');
  pintarMovil();
  if (devolverFoco) (menu.dataset.origen === 'tirador' ? tirador : botonMenu).focus();
}

function enfocables() {
  return [...menu.querySelectorAll('a[href], button:not([disabled])')].filter((n) => n.getClientRects().length > 0);
}

// ---- Conexión ----

function pintar() {
  if (escritorio.matches) {
    cerrar({ devolverFoco: false });
    pintarEscritorio();
  } else {
    pintarMovil();
  }
}

if (menu && velo && botonMenu && tirador) {
  tirador.addEventListener('click', () => {
    if (escritorio.matches) alternarEscritorio();
    else if (estaAbierto()) cerrar();
    else abrir('tirador');
  });
  botonMenu.addEventListener('click', () => (estaAbierto() ? cerrar() : abrir('menu')));
  botonCerrar?.addEventListener('click', () => cerrar());
  velo.addEventListener('click', () => cerrar());

  // Al elegir una opción en el teléfono, el cajón se cierra.
  menu.addEventListener('click', (evento) => {
    if (!escritorio.matches && evento.target.closest('a[href]')) cerrar({ devolverFoco: false });
  });

  document.addEventListener('keydown', (evento) => {
    if (!estaAbierto()) return;
    if (evento.key === 'Escape') {
      cerrar();
      return;
    }
    if (evento.key !== 'Tab') return;
    const nodos = enfocables();
    if (nodos.length === 0) return;
    const primero = nodos[0];
    const ultimo = nodos[nodos.length - 1];
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  });

  escritorio.addEventListener('change', pintar);
  pintar();
  // Las transiciones se activan después del primer pintado (así no anima al cargar).
  requestAnimationFrame(() => raiz.setAttribute('data-menu-listo', ''));
}
