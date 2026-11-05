// P1 – Inicio y calculadora de Fecha Probable de Parto (CU-01).
import { api, el, formatearFecha, hoyManagua, mostrarAviso } from './api.js';

const formulario = document.getElementById('form-fpp');
const campoFum = document.getElementById('fum');
const errorFum = document.getElementById('fum-error');
const aviso = document.getElementById('fpp-aviso');
const resultado = document.getElementById('fpp-resultado');
const boton = formulario.querySelector('button[type="submit"]');

campoFum.max = hoyManagua();
campoFum.min = new Date(Date.parse(`${hoyManagua()}T00:00:00Z`) - 294 * 86400000).toISOString().slice(0, 10);

const NOMBRE_TRIMESTRE = { 1: 'Primer trimestre', 2: 'Segundo trimestre', 3: 'Tercer trimestre' };

function marcarError(texto) {
  errorFum.textContent = texto ?? '';
  errorFum.hidden = !texto;
  campoFum.setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function pintarResultado(r) {
  const progreso = el('div', { class: 'h-full rounded-full bg-sol' });
  progreso.style.width = `${Math.min(100, ((r.semanas * 7 + r.dias) / 280) * 100)}%`;

  resultado.replaceChildren(
    el(
      'div',
      { class: 'grid gap-4 sm:grid-cols-3' },
      el(
        'div',
        { class: 'rounded-lg bg-baya p-4 text-white' },
        el('p', { class: 'text-sm text-white/90' }, 'Fecha probable de parto'),
        el('p', { class: 'font-titulo text-xl font-bold' }, formatearFecha(r.fpp)),
      ),
      el(
        'div',
        { class: 'rounded-lg bg-white p-4 shadow-sm' },
        el('p', { class: 'text-sm text-tinta-2' }, 'Tiempo de gestación'),
        el('p', { class: 'font-titulo text-xl font-bold' }, `${r.semanas} semanas y ${r.dias} ${r.dias === 1 ? 'día' : 'días'}`),
      ),
      el(
        'div',
        { class: 'rounded-lg bg-white p-4 shadow-sm' },
        el('p', { class: 'text-sm text-tinta-2' }, 'Etapa'),
        el('p', { class: 'font-titulo text-xl font-bold' }, NOMBRE_TRIMESTRE[r.trimestre]),
      ),
    ),
    el(
      'div',
      { class: 'mt-4' },
      el('p', { class: 'text-sm text-tinta-2', id: 'progreso-texto' }, `Semana ${r.semanas} de 40`),
      el(
        'div',
        {
          class: 'mt-1 h-3 w-full overflow-hidden rounded-full bg-tinta/10',
          role: 'progressbar',
          'aria-labelledby': 'progreso-texto',
          'aria-valuemin': '0',
          'aria-valuemax': '40',
          'aria-valuenow': String(r.semanas),
        },
        progreso,
      ),
    ),
    r.estudios.length > 0 &&
      el(
        'div',
        { class: 'mt-6' },
        el('h3', { class: 'font-titulo text-lg font-bold' }, 'Estudios sugeridos para esta etapa'),
        el(
          'ul',
          { class: 'mt-2 grid gap-2' },
          r.estudios.map((e) =>
            el('li', { class: 'rounded-lg bg-white p-3 shadow-sm' }, el('p', { class: 'font-bold' }, e.nombre), el('p', { class: 'text-sm text-tinta-2' }, e.descripcion)),
          ),
        ),
      ),
    el(
      'p',
      { class: 'mt-6' },
      el(
        'a',
        { href: '/agendar.html', class: 'inline-flex min-h-11 items-center rounded-lg bg-baya px-5 font-bold text-white hover:bg-baya/90' },
        'Agendar mi control prenatal',
      ),
    ),
    el('p', { class: 'mt-4 text-sm text-tinta-2' }, 'Este cálculo es orientativo y no se guarda. Confírmalo en tu consulta.'),
  );
  resultado.hidden = false;
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarAviso(aviso, '');
  const fum = campoFum.value;
  if (!fum) {
    marcarError('Indica la fecha de tu última menstruación.');
    campoFum.focus();
    return;
  }
  marcarError(null);
  boton.disabled = true;
  try {
    pintarResultado(await api('/calculadora/fpp', { metodo: 'POST', cuerpo: { fum } }));
  } catch (err) {
    resultado.hidden = true;
    const detalle = err.detalles.find((d) => d.campo === 'fum');
    if (detalle || err.codigo.startsWith('FUM_')) {
      marcarError(err.codigo.startsWith('FUM_') ? err.message : detalle.mensaje);
      campoFum.focus();
    } else {
      mostrarAviso(aviso, err.message);
    }
  } finally {
    boton.disabled = false;
  }
});
