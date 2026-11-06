// A5 – Disponibilidad (CU-16), solo la médica.
// Muestra los 7 días con «Atiende», apertura, cierre y duración del turno.
// Al guardar, el servidor regenera los turnos desde mañana y devuelve las
// citas activas que quedaron fuera del horario (E2), que se conservan.
import { api, el, formatearFecha, mostrarAviso } from './api.js';
import { iniciarPanel, manejarErrorSesion } from './admin-comun.js';

const $ = (id) => document.getElementById(id);

const DURACIONES = [30, 35, 40, 45]; // RN-10: de 30 a 45 minutos
const POR_DEFECTO = { apertura: '08:00', cierre: '16:00', duracion: 40 };
const CLASE_CAMPO = 'mt-1 block min-h-11 w-full rounded-lg border border-tinta/30 bg-white px-3 disabled:bg-bruma disabled:text-tinta-2 md:mt-0';

const estado = { guardados: [], cambios: false };

const minutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

// ---------------------------------------------------------------------------
// Pintar la semana
// ---------------------------------------------------------------------------
function etiquetaMovil(texto, para) {
  return el('label', { for: para, class: 'block text-sm font-bold text-tinta-2 md:sr-only' }, texto);
}

function filaDia(d) {
  const id = (campo) => `dia-${d.diaSemana}-${campo}`;
  const valores = {
    apertura: d.apertura ?? POR_DEFECTO.apertura,
    cierre: d.cierre ?? POR_DEFECTO.cierre,
    duracion: d.duracion ?? POR_DEFECTO.duracion,
  };
  const duraciones = DURACIONES.includes(valores.duracion) ? DURACIONES : [...DURACIONES, valores.duracion].sort((a, b) => a - b);

  return el(
    'div',
    {
      'data-dia': String(d.diaSemana),
      class: 'grid grid-cols-2 items-center gap-3 px-5 py-4 md:grid-cols-[8rem_5.5rem_1fr_1fr_10rem] md:gap-4',
    },
    el('span', { id: id('nombre'), class: 'font-bold' }, d.nombre),
    el(
      'label',
      { class: 'inline-flex min-h-11 cursor-pointer items-center justify-self-end md:justify-self-start' },
      el('input', {
        type: 'checkbox',
        id: id('atiende'),
        role: 'switch',
        autocomplete: 'off',
        checked: d.atiende,
        'aria-labelledby': id('nombre'),
        'aria-describedby': `${id('atiende')}-texto`,
        class: 'peer sr-only',
      }),
      el(
        'span',
        {
          'aria-hidden': 'true',
          class: 'relative h-8 w-14 rounded-full bg-tinta/20 transition-colors after:absolute after:left-1 after:top-1 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-salvia peer-checked:after:translate-x-6 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-primario',
        },
      ),
      el('span', { id: `${id('atiende')}-texto`, class: 'sr-only' }, 'Atiende este día'),
    ),
    el('div', {}, etiquetaMovil('Apertura', id('apertura')),
      el('input', { type: 'time', id: id('apertura'), value: valores.apertura, step: '300', autocomplete: 'off', 'aria-label': `Apertura del ${d.nombre.toLowerCase()}`, class: CLASE_CAMPO })),
    el('div', {}, etiquetaMovil('Cierre', id('cierre')),
      el('input', { type: 'time', id: id('cierre'), value: valores.cierre, step: '300', autocomplete: 'off', 'aria-label': `Cierre del ${d.nombre.toLowerCase()}`, class: CLASE_CAMPO })),
    el('div', { class: 'col-span-2 md:col-span-1' }, etiquetaMovil('Duración del turno', id('duracion')),
      el(
        'select',
        { id: id('duracion'), autocomplete: 'off', 'aria-label': `Duración del turno del ${d.nombre.toLowerCase()}`, class: CLASE_CAMPO },
        duraciones.map((m) => el('option', { value: String(m), selected: m === valores.duracion }, `${m} minutos`)),
      )),
    el('p', { id: `${id('error')}`, class: 'col-span-2 text-sm text-error md:col-span-5', hidden: true }),
  );
}

function actualizarFila(fila) {
  const atiende = fila.querySelector('input[type="checkbox"]').checked;
  for (const campo of fila.querySelectorAll('input[type="time"], select')) campo.disabled = !atiende;
  fila.classList.toggle('text-tinta-2', !atiende);
}

function pintar(horarios) {
  const contenedor = $('dias');
  contenedor.replaceChildren(...horarios.map(filaDia));
  for (const fila of contenedor.children) actualizarFila(fila);
  estado.cambios = false;
}

function pintarFueraDeHorario(citas) {
  const caja = $('fuera-horario');
  if (!citas.length) {
    caja.hidden = true;
    return;
  }
  $('fuera-titulo').textContent =
    citas.length === 1 ? '1 cita queda fuera del horario.' : `${citas.length} citas quedan fuera del horario.`;
  $('fuera-lista').replaceChildren(
    ...citas.map((c) =>
      el(
        'li',
        {},
        el(
          'a',
          { href: `/admin/agenda.html?fecha=${c.fecha}`, class: 'inline-flex min-h-11 items-center font-bold text-primario underline' },
          `${c.codigo}: ${c.servicio}, ${formatearFecha(c.fecha, 'dia').toLowerCase()} a las ${c.horaInicio}`,
        ),
      ),
    ),
  );
  caja.hidden = false;
}

// ---------------------------------------------------------------------------
// Leer y validar (RN-10). El servidor valida lo mismo con zod.
// ---------------------------------------------------------------------------
function leer() {
  let valido = true;
  const horarios = [...$('dias').children].map((fila) => {
    const dia = Number(fila.dataset.dia);
    const atiende = fila.querySelector('input[type="checkbox"]').checked;
    const apertura = fila.querySelector(`#dia-${dia}-apertura`).value;
    const cierre = fila.querySelector(`#dia-${dia}-cierre`).value;
    const duracion = Number(fila.querySelector(`#dia-${dia}-duracion`).value);
    let error = null;
    if (atiende) {
      if (!apertura || !cierre) error = 'Indica la hora de apertura y la de cierre.';
      else if (minutos(cierre) <= minutos(apertura)) error = 'La hora de cierre debe ser posterior a la de apertura.';
      else if (minutos(cierre) - minutos(apertura) < duracion) error = 'La jornada es más corta que un turno.';
    }
    const p = fila.querySelector(`#dia-${dia}-error`);
    p.textContent = error ?? '';
    p.hidden = !error;
    if (error) valido = false;
    return atiende
      ? { diaSemana: dia, atiende, apertura, cierre, duracion }
      : { diaSemana: dia, atiende, apertura: null, cierre: null, duracion: null };
  });
  const general = $('horarios-error');
  const ninguno = !horarios.some((h) => h.atiende);
  general.textContent = ninguno ? 'Marca al menos un día de atención.' : '';
  general.hidden = !ninguno;
  return { horarios, valido: valido && !ninguno };
}

/** Errores del servidor (DATOS_INVALIDOS): campo 'horarios.3.cierre' → fila del día. */
function mostrarErroresServidor(detalles) {
  for (const d of detalles) {
    const m = /^horarios\.(\d+)/.exec(d.campo);
    const fila = m ? $('dias').children[Number(m[1])] : null;
    const p = fila ? fila.querySelector('p[id$="-error"]') : $('horarios-error');
    p.textContent = d.mensaje;
    p.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
$('dias').addEventListener('change', (e) => {
  estado.cambios = true;
  $('aviso-ok').hidden = true;
  const fila = e.target.closest('[data-dia]');
  if (e.target.type === 'checkbox' && fila) actualizarFila(fila);
});

// A1: descartar sin guardar.
$('descartar').addEventListener('click', () => {
  mostrarAviso($('aviso'), '');
  $('aviso-ok').hidden = true;
  $('horarios-error').hidden = true;
  pintar(estado.guardados);
});

$('form-horarios').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarAviso($('aviso'), '');
  $('aviso-ok').hidden = true;
  const { horarios, valido } = leer();
  if (!valido) {
    $('form-horarios').querySelector('p[id$="-error"]:not([hidden])')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const boton = $('guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const r = await api('/admin/disponibilidad', { metodo: 'PUT', cuerpo: { horarios } });
    estado.guardados = r.horarios;
    pintar(r.horarios);
    pintarFueraDeHorario(r.citasFueraDeHorario);
    const ok = $('aviso-ok');
    ok.textContent = 'Horario guardado. Los turnos desde mañana ya reflejan el cambio en la página de citas.';
    ok.hidden = false;
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    if (manejarErrorSesion(err)) return;
    if (err.codigo === 'DATOS_INVALIDOS') mostrarErroresServidor(err.detalles);
    mostrarAviso($('aviso'), err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar horario';
  }
});

// Aviso al salir con cambios sin guardar.
window.addEventListener('beforeunload', (e) => {
  if (estado.cambios) e.preventDefault();
});

async function iniciar() {
  try {
    await iniciarPanel({ rol: 'MEDICO' });
  } catch {
    return;
  }
  try {
    const r = await api('/admin/disponibilidad');
    estado.guardados = r.horarios;
    pintar(r.horarios);
    pintarFueraDeHorario(r.citasFueraDeHorario);
  } catch (err) {
    if (!manejarErrorSesion(err)) mostrarAviso($('aviso'), err.message);
  }
}

iniciar();
