// Cuadrícula de turnos agrupados por día (CU-02), compartida por P2 Agendar
// y P4 Mi cita. Los ocupados aparecen tachados (Figura 18) y el elegido relleno en Primario.
import { el, formatearFecha } from './api.js';

const CLASES = {
  ocupado: 'min-h-11 rounded-lg border border-transparent bg-tinta/10 px-2 text-sm text-tinta-2 line-through cursor-not-allowed',
  actual: 'min-h-11 rounded-lg border-2 border-dashed border-primario bg-bruma px-2 text-sm font-bold text-primario cursor-not-allowed',
  elegido: 'min-h-11 rounded-lg border-2 border-primario bg-primario px-2 text-sm font-bold text-white',
  libre: 'min-h-11 rounded-lg border border-primario bg-white px-2 text-sm font-bold text-primario hover:bg-primario/10',
};

/**
 * @param {HTMLElement} lista contenedor donde se dibujan los días
 * @param {Array<{id, fecha, horaInicio, horaFin, disponible}>} turnos
 * @param {object} opciones
 * @param {number|null} [opciones.seleccionadoId] turno elegido
 * @param {{fecha: string, horaInicio: string}|null} [opciones.actual] horario actual de la cita (al reprogramar)
 * @param {(turno) => void} opciones.alElegir
 * @param {string} [opciones.vacio] mensaje si no hay turnos
 */
export function pintarTurnos(lista, turnos, { seleccionadoId = null, actual = null, alElegir, vacio } = {}) {
  if (turnos.length === 0) {
    lista.replaceChildren(
      el('p', { class: 'rounded-lg bg-white p-4 text-tinta-2 shadow-sm' }, vacio ?? 'No hay turnos en estas fechas. Prueba con las siguientes.'),
    );
    return;
  }
  const esActual = (t) => actual != null && t.fecha === actual.fecha && t.horaInicio === actual.horaInicio;
  const porDia = new Map();
  for (const t of turnos) {
    if (!porDia.has(t.fecha)) porDia.set(t.fecha, []);
    porDia.get(t.fecha).push(t);
  }
  lista.replaceChildren(
    ...[...porDia].map(([fecha, delDia]) => {
      const libres = delDia.filter((t) => t.disponible).length;
      return el(
        'div',
        { class: 'rounded-lg bg-white p-4 shadow-sm' },
        el(
          'h3',
          { class: 'font-bold' },
          formatearFecha(fecha, 'dia'),
          el('span', { class: 'ml-2 text-sm font-normal text-tinta-2' }, libres === 0 ? 'sin turnos libres' : `${libres} libre${libres === 1 ? '' : 's'}`),
        ),
        el(
          'div',
          { class: 'mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6' },
          delDia.map((t) => {
            const deEstaCita = esActual(t);
            const elegido = t.disponible && seleccionadoId === t.id;
            let clase = CLASES.libre;
            let sufijo = '';
            if (deEstaCita) {
              clase = CLASES.actual;
              sufijo = ', tu horario actual';
            } else if (!t.disponible) {
              clase = CLASES.ocupado;
              sufijo = ', ocupado';
            } else if (elegido) {
              clase = CLASES.elegido;
            }
            return el(
              'button',
              {
                type: 'button',
                class: clase,
                disabled: !t.disponible || deEstaCita,
                'aria-pressed': t.disponible && !deEstaCita ? String(elegido) : false,
                'aria-label': `${formatearFecha(fecha, 'dia')}, ${t.horaInicio}${sufijo}`,
                onclick: () => alElegir(t),
              },
              t.horaInicio,
            );
          }),
        ),
      );
    }),
  );
}
