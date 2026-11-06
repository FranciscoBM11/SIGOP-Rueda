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
 */
export function escalonar(contenedor, clase = 'entra-escalonado') {
  if (!contenedor) return;
  [...contenedor.children].forEach((hijo, i) => hijo.style.setProperty('--i', String(Math.min(i, TOPE_ESCALONADO))));
  contenedor.classList.remove('entra-escalonado', 'entra-escalonado-rapido');
  if (movimientoReducido()) return;
  void contenedor.offsetWidth; // reinicia la animación si la clase ya estaba
  contenedor.classList.add(clase);
}
