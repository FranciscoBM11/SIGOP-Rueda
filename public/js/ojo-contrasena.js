// Mostrar u ocultar lo que se escribe en los campos de contraseña. Solo interfaz.
//
// Mejora TODO <input type="password"> de la página (presente al cargar): agrega dentro
// del campo, a la derecha, un <button type="button"> con un ojo. Por defecto el texto
// está oculto; al presionar se muestra y al volver a presionar se oculta.
// - No cambia name, autocomplete, validaciones, límites de intentos ni mensajes.
// - Al enviar el formulario (y, por lo tanto, cuando el acceso falla) vuelve a ocultarse.
// - No roba el foco ni mueve el cursor del campo al usarlo con mouse o dedo.
// - Sin JavaScript no hay botón: el campo funciona como siempre (oculto).
import { envolverCampo } from './movimiento.js';

const ETIQUETA = { mostrar: 'Mostrar contraseña', ocultar: 'Ocultar contraseña' };

const ICONOS = `
  <svg class="ojo-abierto" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>
  <svg class="ojo-tachado" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.6A9.8 9.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.5 7.6C4 9.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/></svg>`;

/**
 * Pone el campo en «visible» u «oculto» y actualiza el botón. Lógica pura (se prueba sin navegador).
 * @returns {boolean} true si el texto quedó visible
 */
export function fijarVisible(input, boton, visible) {
  input.type = visible ? 'text' : 'password';
  boton.setAttribute('aria-pressed', String(visible));
  boton.setAttribute('aria-label', visible ? ETIQUETA.ocultar : ETIQUETA.mostrar);
  return visible;
}

/** Alterna entre visible y oculto conservando la posición del cursor dentro del campo. */
export function alternar(input, boton) {
  const visible = input.type === 'password';
  let inicio = null;
  let fin = null;
  try {
    inicio = input.selectionStart;
    fin = input.selectionEnd;
  } catch {
    // Algunos navegadores no exponen la selección: no pasa nada.
  }
  fijarVisible(input, boton, visible);
  if (inicio != null && input.ownerDocument?.activeElement === input) {
    try {
      input.setSelectionRange(inicio, fin);
    } catch {
      // Sin selección restaurable: el cursor queda al final.
    }
  }
  return visible;
}

/** Vuelve a ocultar todos los campos mejorados de un formulario (o de la página). */
export function ocultarContrasenas(raiz = document) {
  for (const boton of raiz.querySelectorAll('.boton-ojo[aria-pressed="true"]')) {
    const input = boton.parentElement.querySelector('input');
    if (input) fijarVisible(input, boton, false);
  }
}

function preparar(input) {
  const envoltura = envolverCampo(input);
  input.classList.add('pr-12'); // espacio para el botón: el texto no pasa por debajo
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton-ojo';
  boton.setAttribute('aria-controls', input.id);
  boton.innerHTML = ICONOS;
  fijarVisible(input, boton, false);
  // Con mouse o dedo, el foco se queda en el campo (no se pierde el cursor).
  // (mousedown también llega tras un toque: evitarlo impide que el campo pierda el foco.)
  boton.addEventListener('mousedown', (evento) => {
    if (document.activeElement === input) evento.preventDefault();
  });
  boton.addEventListener('click', () => alternar(input, boton));
  envoltura.append(boton);
  // Al enviar el formulario (y si el acceso falla), el texto vuelve a ocultarse.
  input.form?.addEventListener('submit', () => fijarVisible(input, boton, false));
}

if (typeof document !== 'undefined') {
  for (const input of document.querySelectorAll('input[type="password"]')) preparar(input);
}
