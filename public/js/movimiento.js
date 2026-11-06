// Utilidades de movimiento compartidas (Fase 3, sección 8.7). Solo interfaz.
// - Respetan prefers-reduced-motion: si la persona lo pide, no hay movimiento.
// - Solo animan transform y opacity, y nunca ocultan contenido: si algo falla,
//   el elemento queda en su estado final (visible).

const consulta = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const EASE_SALIDA = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Máximo de elementos con retraso propio en un escalonado; el resto entra con el último. */
export const TOPE_ESCALONADO = 8;

export function movimientoReducido() {
  return Boolean(consulta?.matches);
}

/**
 * Anima con la Web Animations API si está disponible y permitido.
 * @returns {Animation|null}
 */
export function animar(nodo, fotogramas, opciones) {
  if (!nodo || movimientoReducido() || typeof nodo.animate !== 'function') return null;
  try {
    return nodo.animate(fotogramas, { easing: EASE_SALIDA, ...opciones });
  } catch {
    return null;
  }
}

/** Entrada de un paso o vista: desde la dirección del avance (1 = adelante, -1 = atrás, 0 = en su lugar). */
export function entrarVista(nodo, direccion = 0) {
  // Respuesta a un clic: desplazamiento claro (24 px) pero corta (340 ms).
  const dx = direccion * 24;
  return animar(
    nodo,
    [
      { opacity: 0, transform: `translateX(${dx}px)` },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 340 },
  );
}

/** Fundido breve al reemplazar contenido (resúmenes, listas filtradas). */
export function fundir(nodo) {
  return animar(nodo, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
}

/** Vuelve a disparar una animación de CSS ligada a una clase (pulsos, destellos). */
export function reiniciarClase(nodo, clase) {
  if (!nodo || movimientoReducido()) return;
  nodo.classList.remove(clase);
  void nodo.offsetWidth;
  nodo.classList.add(clase);
}

/** Quita la marca de escalonado: lo que se pinte después (elegir, filtrar) aparece sin repetir la entrada. */
export function quitarEscalonado(contenedor) {
  contenedor?.classList.remove('entra-escalonado', 'entra-escalonado-rapido');
}

/**
 * Marca un contenedor para que sus hijos entren escalonados (CSS: .entra-escalonado).
 * El índice se topa para que el total no pase de ~500 ms.
 * @param {number} [grupo] hijos que entran juntos (2 en un <dl>: cada <dt> con su <dd>).
 */
export function escalonar(contenedor, clase = 'entra-escalonado', { grupo = 1 } = {}) {
  if (!contenedor) return;
  [...contenedor.children].forEach((hijo, i) => hijo.style.setProperty('--i', String(Math.min(Math.floor(i / grupo), TOPE_ESCALONADO))));
  contenedor.classList.remove('entra-escalonado', 'entra-escalonado-rapido');
  if (movimientoReducido()) return;
  void contenedor.offsetWidth; // reinicia la animación si la clase ya estaba
  contenedor.classList.add(clase);
}

// ---------------------------------------------------------------------------
// Formularios de acceso y tarjetas (Mi cita, Resultados, login del personal)
// ---------------------------------------------------------------------------
const EASE_SUAVE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Sacudida horizontal corta (250 ms, ±6 px) ante un error. Es IGUAL para cualquier
 * error de acceso: no revela si la cédula existe ni distingue bloqueo de rechazo.
 */
export function sacudir(nodo) {
  return animar(
    nodo,
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(1px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 250, easing: 'ease-out' },
  );
}

/** Aviso que aparece con fundido y un desplazamiento corto (solo si está visible). */
export function aparecerAviso(nodo) {
  if (!nodo || nodo.hidden) return null;
  return animar(
    nodo,
    [
      { opacity: 0, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 240 },
  );
}

/** Entrada de una tarjeta o panel con escala y fundido (entrada de contenido: 600 ms). */
export function entrarTarjeta(nodo) {
  return animar(
    nodo,
    [
      { opacity: 0, transform: 'translateY(16px) scale(0.97)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 600, easing: EASE_SUAVE },
  );
}

/** Panel que se abre en su lugar (confirmar cancelación, elegir turno): respuesta a un clic. */
export function abrirPanel(nodo) {
  return animar(
    nodo,
    [
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 240 },
  );
}

/**
 * Salida con fundido (200 ms) y después `alTerminar` (ocultar, limpiar). Sin animación
 * (movimiento reducido, sin WAAPI) se ejecuta de inmediato. Nunca deja de llamarse.
 */
export function salirConFundido(nodo, alTerminar) {
  const a = animar(nodo, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
  if (!a) {
    alTerminar();
    return;
  }
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    alTerminar();
  };
  a.finished.then(fin, fin);
}

/** Estado «cargando» de un botón: indicador discreto (CSS [data-cargando]) y aria-busy. */
export function cargando(boton, activo) {
  if (!boton) return;
  boton.toggleAttribute('data-cargando', Boolean(activo));
  boton.setAttribute('aria-busy', String(Boolean(activo)));
}

/**
 * Envuelve un campo en un contenedor relativo (para el resalte de foco y el botón del ojo).
 * El margen superior del campo pasa al contenedor para que el diseño no cambie.
 */
export function envolverCampo(input) {
  const padre = input.parentElement;
  if (padre?.classList.contains('campo-envoltura')) return padre;
  const envoltura = document.createElement('span');
  envoltura.className = 'campo-envoltura';
  if (input.classList.contains('mt-1')) {
    input.classList.remove('mt-1');
    envoltura.classList.add('mt-1');
  }
  input.before(envoltura);
  envoltura.append(input);
  return envoltura;
}

/** Resalte suave al enfocar cada campo del formulario (capa con opacidad y escala). */
export function realzarCampos(formulario) {
  for (const input of formulario?.querySelectorAll('input:not([type=checkbox]):not([type=radio])') ?? []) {
    envolverCampo(input).classList.add('con-halo');
  }
}

/**
 * Teléfono: la tarjeta nueva aparece debajo del formulario. Si su inicio queda en la mitad
 * inferior de la pantalla, la lleva a la vista con un desplazamiento suave (instantáneo con
 * movimiento reducido), para que la transición se vea y sus botones no queden bajo la barra fija.
 */
export function llevarALaVista(nodo) {
  if (!nodo?.getBoundingClientRect) return;
  if (nodo.getBoundingClientRect().top < window.innerHeight * 0.45) return;
  nodo.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'start' });
}
