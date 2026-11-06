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

let temporizadorAnima = null;

function alternarEscritorio() {
  if (estaEncogido()) {
    raiz.removeAttribute('data-menu');
    // Los textos aparecen con un fundido mientras el menú crece (CSS: [data-menu-anima]).
    clearTimeout(temporizadorAnima);
    raiz.setAttribute('data-menu-anima', 'desplegar');
    temporizadorAnima = setTimeout(() => raiz.removeAttribute('data-menu-anima'), 320);
  } else {
    clearTimeout(temporizadorAnima);
    raiz.removeAttribute('data-menu-anima');
    raiz.setAttribute('data-menu', 'encogido');
  }
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

// ---- Indicador deslizante ----
// Una barra fina a la izquierda del ítem activo: al cargar se desliza hasta él; con
// el mouse sigue al ítem señalado y vuelve al activo al salir. Solo transform.
// Sin JS no existe (el ítem activo ya se marca con fondo blanco).

function iniciarIndicador() {
  const nav = menu.querySelector('nav');
  const activo = nav?.querySelector('[aria-current="page"]');
  if (!nav || !activo || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const barra = document.createElement('span');
  barra.className = 'indicador-menu';
  barra.setAttribute('aria-hidden', 'true');
  nav.append(barra); // al final: no altera el orden de la cascada (nth-child)

  const ir = (enlace) => {
    // Alto del ítem (tamaño, no animado) y posición con transform.
    barra.style.height = `${enlace.offsetHeight - 16}px`;
    barra.style.transform = `translateY(${enlace.offsetTop + 8}px)`;
  };

  // Llegada: parte del primer ítem y se desliza al activo después de la cascada.
  const primero = nav.querySelector('a[href]');
  ir(primero);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      barra.setAttribute('data-llegando', '');
      barra.setAttribute('data-listo', '');
      ir(activo);
      setTimeout(() => barra.removeAttribute('data-llegando'), 1100);
    }),
  );

  const conMouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  nav.addEventListener('pointerover', (evento) => {
    const enlace = evento.target.closest('a.enlace-menu');
    if (enlace && conMouse.matches) ir(enlace);
  });
  nav.addEventListener('pointerleave', () => ir(activo));
  nav.addEventListener('focusin', (evento) => {
    if (evento.target.matches('a.enlace-menu')) ir(evento.target);
  });
  nav.addEventListener('focusout', () => ir(activo));
  // Al encoger/desplegar el menú o cambiar el tamaño, los ítems cambian de alto.
  // (El primer aviso llega al observar; se ignora para no saltarse el deslizamiento de llegada.)
  let primerAviso = true;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (primerAviso) primerAviso = false;
      else ir(activo);
    }).observe(nav);
  }
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
  iniciarIndicador();
  // Las transiciones se activan después del primer pintado (así no anima al cargar).
  requestAnimationFrame(() => raiz.setAttribute('data-menu-listo', ''));
}
