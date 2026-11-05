// A2 – Agenda diaria (CU-11) con estados (CU-12), gestión desde recepción
// (CU-13) y ficha de triaje para la médica (CU-14, A3).
// Las acciones de cada cita las decide el servidor según el rol y el estado
// (campo `transiciones` y `puedeReprogramar`); aquí solo se muestran.
// La página no se actualiza sola: así la sesión vence tras 30 min sin uso.
import { api, el, formatearFecha, hoyManagua, mostrarAviso, sumarDias } from './api.js';
import { iniciarPanel, manejarErrorSesion } from './admin-comun.js';
import { pintarTurnos } from './selector-turnos.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = {
  CONFIRMADA: { texto: 'Confirmada', plural: 'Confirmadas', clase: 'border-baya/20 bg-baya/10 text-baya' },
  EN_ESPERA: { texto: 'En espera', plural: 'En espera', clase: 'border-sol bg-sol/25 text-tinta' },
  ATENDIDA: { texto: 'Atendida', plural: 'Atendidas', clase: 'border-salvia/20 bg-salvia/15 text-salvia' },
  NO_ASISTIO: { texto: 'No asistió', plural: 'No asistió', clase: 'border-tinta/10 bg-tinta/10 text-tinta-2' },
  CANCELADA: { texto: 'Cancelada', plural: 'Canceladas', clase: 'border-dashed border-tinta/40 bg-white text-tinta-2' },
};
const ORDEN_FILTROS = ['TODAS', 'CONFIRMADA', 'EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA'];
const EXITO_POR_ESTADO = {
  EN_ESPERA: 'llegada registrada',
  ATENDIDA: 'marcada como atendida',
  NO_ASISTIO: 'marcada como «No asistió»',
  CANCELADA: 'cancelada; el turno quedó libre',
};
const ERRORES_DE_TURNO = ['TURNO_OCUPADO', 'TURNO_NO_DISPONIBLE', 'TURNO_NO_ENCONTRADO', 'MISMO_TURNO'];
const VENTANA_DIAS = 14;
const MAX_DIAS_ADELANTE = 90;

const BOTON = {
  principal: 'min-h-11 rounded-lg bg-salvia px-4 font-bold text-white hover:bg-salvia/90 disabled:opacity-60',
  secundario: 'min-h-11 rounded-lg border border-tinta/20 bg-white px-4 font-bold hover:bg-bruma disabled:opacity-60',
};

const estado = {
  sesion: null,
  hoy: hoyManagua(),
  fecha: hoyManagua(),
  citas: [],
  filtro: 'TODAS',
  // Diálogo de gestión
  gestion: { cita: null, desde: null, turno: null },
  // Diálogo de triaje
  triaje: null,
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const formatoHora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Managua', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** ¿La cita está en su horario ahora mismo? (se resalta en Sol, Tabla 61). */
function enCurso(c) {
  if (c.fecha !== hoyManagua() || ['CANCELADA', 'ATENDIDA', 'NO_ASISTIO'].includes(c.estado)) return false;
  const ahora = formatoHora.format(new Date());
  return c.horaInicio <= ahora && ahora < c.horaFin;
}

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function insignia(estadoCita) {
  const e = ESTADOS[estadoCita] ?? { texto: estadoCita, clase: 'border-tinta/10' };
  return el('span', { class: `inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${e.clase}` }, e.texto);
}

// CU-16 E2: la médica cambió su horario y esta cita quedó fuera; recepción la reprograma.
function insignias(c) {
  return el(
    'span',
    { class: 'inline-flex flex-wrap gap-1' },
    insignia(c.estado),
    c.fueraDeHorario
      ? el('span', { class: 'inline-flex whitespace-nowrap rounded-full border border-error/30 bg-error/10 px-3 py-1 text-sm font-bold text-error' }, 'Fuera de horario')
      : null,
  );
}

function fechaHora(c) {
  const dia = c.fecha === estado.hoy ? 'hoy' : formatearFecha(c.fecha, 'dia').toLowerCase();
  return `${dia} a las ${c.horaInicio}`;
}

function avisoOk(texto) {
  mostrarAviso($('aviso'), '');
  $('aviso-ok').textContent = texto;
  $('aviso-ok').hidden = !texto;
}

function avisoError(texto) {
  avisoOk('');
  mostrarAviso($('aviso'), texto);
}

/** Maneja un error de la API: sesión vencida → login; si no, muestra el mensaje. */
function tratarError(err, mostrar = avisoError) {
  if (manejarErrorSesion(err)) return;
  mostrar(err.message);
}

// ---------------------------------------------------------------------------
// Carga y dibujo de la agenda (CU-11)
// ---------------------------------------------------------------------------
async function cargar({ conservarAviso = false } = {}) {
  if (!conservarAviso) avisoOk('');
  mostrarAviso($('aviso'), '');
  $('fecha').value = estado.fecha;
  $('hoy').disabled = estado.fecha === estado.hoy;
  history.replaceState(null, '', estado.fecha === estado.hoy ? location.pathname : `?fecha=${estado.fecha}`);
  const dia = formatearFecha(estado.fecha, 'dia');
  $('titulo').textContent = `Agenda del ${dia.charAt(0).toLowerCase()}${dia.slice(1)}`;
  $('resumen').textContent = 'Cargando…';
  try {
    estado.citas = await api(`/admin/citas/agenda?fecha=${estado.fecha}`);
  } catch (err) {
    estado.citas = [];
    $('resumen').textContent = '';
    pintar();
    tratarError(err);
    return;
  }
  pintar();
}

function pintar() {
  const enEspera = estado.citas.filter((c) => c.estado === 'EN_ESPERA').length;
  $('resumen').textContent = `${plural(estado.citas.length, 'cita', 'citas')}, ${enEspera} en espera`;
  pintarFiltros();

  const visibles = estado.filtro === 'TODAS' ? estado.citas : estado.citas.filter((c) => c.estado === estado.filtro);
  const vacio = $('vacio');
  if (visibles.length === 0) {
    // E1
    vacio.textContent =
      estado.citas.length === 0 ? 'No hay citas agendadas para esta fecha.' : 'No hay citas con este estado en esta fecha.';
    vacio.hidden = false;
  } else {
    vacio.hidden = true;
  }
  $('contenedor-tabla').classList.toggle('md:block', visibles.length > 0);
  $('filas').replaceChildren(...visibles.map(fila));
  $('tarjetas').replaceChildren(...visibles.map(tarjeta));
}

function pintarFiltros() {
  const cuenta = (e) => (e === 'TODAS' ? estado.citas.length : estado.citas.filter((c) => c.estado === e).length);
  $('filtros').replaceChildren(
    ...ORDEN_FILTROS.map((e) => {
      const activo = estado.filtro === e;
      return el(
        'button',
        {
          type: 'button',
          'aria-pressed': String(activo),
          class: `min-h-11 rounded-full border px-4 font-bold ${activo ? 'border-tinta bg-tinta text-white' : 'border-tinta/20 bg-white hover:bg-bruma'}`,
          onclick: () => {
            estado.filtro = e;
            pintar();
          },
        },
        `${e === 'TODAS' ? 'Todas' : ESTADOS[e].plural} ${cuenta(e)}`,
      );
    }),
  );
}

/** Botones de la cita según el rol y lo que el servidor permite (RN-11). */
function acciones(c) {
  const nodos = [];
  if (estado.sesion.rol === 'RECEPCIONISTA') {
    if (c.transiciones.includes('EN_ESPERA')) {
      nodos.push(el('button', { type: 'button', class: BOTON.principal, onclick: (ev) => cambiarEstado(c, 'EN_ESPERA', ev.currentTarget) }, 'Registrar llegada'));
    }
    if (c.transiciones.includes('NO_ASISTIO') || c.transiciones.includes('CANCELADA') || c.puedeReprogramar) {
      nodos.push(el('button', { type: 'button', class: BOTON.secundario, 'aria-label': `Más acciones para la cita ${c.codigo}`, onclick: () => abrirGestion(c) }, 'Más'));
    }
  } else if (estado.sesion.rol === 'MEDICO') {
    if (c.tieneTriaje && c.estado !== 'CANCELADA') {
      nodos.push(el('button', { type: 'button', class: BOTON.secundario, 'aria-label': `Ver triaje de la cita ${c.codigo}`, onclick: () => abrirTriaje(c) }, 'Ver triaje'));
    } else if (c.transiciones.includes('ATENDIDA')) {
      nodos.push(el('button', { type: 'button', class: BOTON.principal, onclick: (ev) => cambiarEstado(c, 'ATENDIDA', ev.currentTarget) }, 'Marcar atendida'));
    }
    if (!c.tieneTriaje && c.estado !== 'CANCELADA') {
      nodos.push(el('span', { class: 'text-sm text-tinta-2' }, 'Sin triaje'));
    }
  }
  return nodos;
}

function fila(c) {
  const resaltada = enCurso(c);
  return el(
    'tr',
    { class: `border-b border-tinta/10 last:border-0 ${resaltada ? 'bg-sol/10 shadow-[inset_4px_0_0_var(--color-sol)]' : ''}` },
    el('td', { class: 'px-4 py-4 align-top font-titulo text-lg font-bold' }, c.horaInicio, resaltada ? el('span', { class: 'sr-only' }, ' (en curso)') : null),
    el('td', { class: 'px-4 py-4 align-top' }, el('span', { class: 'block break-words' }, c.paciente), el('span', { class: 'block text-sm text-tinta-2' }, c.cedula)),
    el('td', { class: 'px-4 py-4 align-top' }, c.servicio),
    el('td', { class: 'px-4 py-4 align-top whitespace-nowrap' }, c.codigo),
    el('td', { class: 'px-4 py-4 align-top' }, insignias(c)),
    el('td', { class: 'px-4 py-4 align-top' }, el('div', { class: 'flex flex-wrap items-center gap-2' }, acciones(c))),
  );
}

function tarjeta(c) {
  const resaltada = enCurso(c);
  const botones = acciones(c);
  return el(
    'li',
    { class: `rounded-xl bg-white p-4 shadow-sm ${resaltada ? 'border-l-4 border-sol' : ''}` },
    el(
      'div',
      { class: 'flex gap-3' },
      el('span', { class: 'font-titulo text-lg font-bold' }, c.horaInicio, resaltada ? el('span', { class: 'sr-only' }, ' (en curso)') : null),
      el(
        'div',
        { class: 'min-w-0' },
        el('p', { class: 'font-bold break-words' }, c.paciente),
        el('p', { class: 'text-tinta-2 break-words' }, `${c.servicio}, ${c.codigo}`),
        el('p', { class: 'text-sm text-tinta-2' }, c.cedula),
      ),
    ),
    el('div', { class: 'mt-3 flex flex-wrap items-center justify-between gap-2' }, insignias(c), botones.length ? el('div', { class: 'flex flex-wrap gap-2' }, botones) : null),
  );
}

// ---------------------------------------------------------------------------
// CU-12: cambiar estado
// ---------------------------------------------------------------------------
/**
 * @param {Function} [mostrarError] dónde mostrar el error (la agenda, o el
 *        diálogo abierto para que no quede tapado).
 * @returns {Promise<boolean>} true si se guardó
 */
async function cambiarEstado(c, nuevo, boton, mostrarError) {
  if (boton) boton.disabled = true;
  try {
    await api(`/admin/citas/${c.codigo}/estado`, { metodo: 'PATCH', cuerpo: { estado: nuevo } });
  } catch (err) {
    if (boton) boton.disabled = false;
    if (manejarErrorSesion(err)) return false;
    if (mostrarError) {
      mostrarError(err.message);
    } else {
      // La agenda puede estar desactualizada (otro usuario cambió la cita).
      await cargar();
      avisoError(err.message);
    }
    return false;
  }
  avisoOk(`Cita ${c.codigo} de ${c.paciente}: ${EXITO_POR_ESTADO[nuevo]}.`);
  await cargar({ conservarAviso: true });
  return true;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------
for (const boton of document.querySelectorAll('[data-cerrar-dialogo]')) {
  boton.addEventListener('click', () => boton.closest('dialog').close());
}

// A3 – Ficha de triaje (CU-14)
function formatearRespuesta(r, cita) {
  if (r.valor == null) return 'No se pudo leer esta respuesta. Avisa al administrador del sistema.';
  if (r.tipo === 'SI_NO') return r.valor === 'SI' ? 'Sí' : 'No';
  if (r.tipo === 'FECHA') {
    const texto = formatearFecha(r.valor, 'larga').replace(/^[^,]+, /, '');
    // Para la FUM se indica la semana de gestación a la fecha de la cita.
    if (/menstruaci|FUM/i.test(r.pregunta)) {
      const dias = Math.round((Date.parse(cita.fecha) - Date.parse(r.valor)) / 86400000);
      if (dias >= 0 && dias <= 300) return `${texto} (semana ${Math.floor(dias / 7)})`;
    }
    return texto;
  }
  return r.valor;
}

async function abrirTriaje(c) {
  estado.triaje = c;
  $('triaje-titulo').textContent = `Ficha de triaje de ${c.paciente}`;
  $('triaje-sub').textContent = `${c.servicio}, ${fechaHora(c)}, cita ${c.codigo}`;
  const e = ESTADOS[c.estado];
  $('triaje-estado').className = `rounded-full border px-3 py-1 text-sm font-bold ${e.clase}`;
  $('triaje-estado').textContent = e.texto;
  $('triaje-cargando').hidden = false;
  $('triaje-aviso').hidden = true;
  $('triaje-respuestas').replaceChildren();
  $('triaje-fecha').textContent = '';
  $('triaje-atendida').hidden = !c.transiciones.includes('ATENDIDA');
  $('triaje-atendida').disabled = false;
  $('dlg-triaje').showModal();

  try {
    const ficha = await api(`/admin/citas/${c.codigo}/triaje`);
    $('triaje-respuestas').replaceChildren(
      ...ficha.respuestas.map((r) =>
        el('div', { class: 'py-4 first:pt-0' }, el('dt', { class: 'text-tinta-2' }, r.pregunta), el('dd', { class: 'mt-1 text-lg font-bold break-words' }, formatearRespuesta(r, c))),
      ),
    );
    const registro = new Date(ficha.fechaRegistro);
    $('triaje-fecha').textContent = `Respondido por la paciente el ${new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Managua', dateStyle: 'long', timeStyle: 'short' }).format(registro)}.`;
  } catch (err) {
    if (manejarErrorSesion(err)) return;
    $('triaje-aviso').textContent = err.message;
    $('triaje-aviso').hidden = false;
  } finally {
    $('triaje-cargando').hidden = true;
  }
}

$('triaje-atendida').addEventListener('click', async (ev) => {
  const ok = await cambiarEstado(estado.triaje, 'ATENDIDA', ev.currentTarget, (texto) => {
    $('triaje-aviso').textContent = texto;
    $('triaje-aviso').hidden = false;
  });
  if (ok) $('dlg-triaje').close();
});

// Gestión desde recepción (CU-12 A3 y CU-13)
function vistaGestion(vista) {
  $('gestion-opciones').hidden = vista !== 'opciones';
  $('gestion-cancelar').hidden = vista !== 'cancelar';
  $('gestion-reprogramar').hidden = vista !== 'reprogramar';
  $('gestion-aviso').hidden = true;
}

function avisoGestion(texto) {
  $('gestion-aviso').textContent = texto;
  $('gestion-aviso').hidden = !texto;
}

function abrirGestion(c) {
  estado.gestion = { cita: c, desde: estado.hoy, turno: null };
  $('gestion-titulo').textContent = `Cita ${c.codigo} de ${c.paciente}`;
  $('gestion-sub').textContent = `${c.servicio}, ${fechaHora(c)}`;
  $('g-no-asistio').hidden = !c.transiciones.includes('NO_ASISTIO');
  $('g-abrir-reprogramar').hidden = !c.puedeReprogramar;
  $('g-abrir-cancelar').hidden = !c.transiciones.includes('CANCELADA');
  $('g-sin-opciones').hidden = !($('g-no-asistio').hidden && $('g-abrir-reprogramar').hidden && $('g-abrir-cancelar').hidden);
  for (const id of ['g-no-asistio', 'g-si-cancelar', 'g-confirmar-reprogramar']) $(id).disabled = false;
  vistaGestion('opciones');
  $('dlg-gestion').showModal();
}

for (const boton of document.querySelectorAll('[data-volver-opciones]')) {
  boton.addEventListener('click', () => vistaGestion('opciones'));
}

$('g-no-asistio').addEventListener('click', async (ev) => {
  const ok = await cambiarEstado(estado.gestion.cita, 'NO_ASISTIO', ev.currentTarget, avisoGestion);
  if (ok) $('dlg-gestion').close();
});

$('g-abrir-cancelar').addEventListener('click', () => vistaGestion('cancelar'));

$('g-si-cancelar').addEventListener('click', async (ev) => {
  const boton = ev.currentTarget;
  const c = estado.gestion.cita;
  boton.disabled = true;
  try {
    await api(`/admin/citas/${c.codigo}/cancelacion`, { metodo: 'POST' });
    $('dlg-gestion').close();
    avisoOk(`Cita ${c.codigo} de ${c.paciente}: ${EXITO_POR_ESTADO.CANCELADA}.`);
    await cargar({ conservarAviso: true });
  } catch (err) {
    boton.disabled = false;
    tratarError(err, avisoGestion);
  }
});

// Reprogramar: turnos libres del mismo servicio (CU-02, reutilizado por CU-13)
function limiteHasta() {
  return sumarDias(estado.hoy, MAX_DIAS_ADELANTE);
}

async function cargarTurnos() {
  const g = estado.gestion;
  const hasta = [sumarDias(g.desde, VENTANA_DIAS - 1), limiteHasta()].sort()[0];
  $('g-rango').textContent = `${formatearFecha(g.desde, 'corta')} – ${formatearFecha(hasta, 'corta')}`;
  $('g-anteriores').disabled = g.desde <= estado.hoy;
  $('g-siguientes').disabled = hasta >= limiteHasta();
  $('g-confirmar-reprogramar').disabled = !g.turno;
  const lista = $('g-turnos');
  lista.replaceChildren(el('p', { class: 'text-tinta-2' }, 'Buscando turnos…'));
  try {
    const params = new URLSearchParams({ servicioId: g.cita.servicioId, desde: g.desde, hasta });
    const turnos = await api(`/turnos?${params}`);
    const pintarLista = () =>
      pintarTurnos(lista, turnos, {
        seleccionadoId: g.turno?.id ?? null,
        actual: { fecha: g.cita.fecha, horaInicio: g.cita.horaInicio },
        vacio: 'No hay turnos en estas fechas. Prueba con las siguientes.',
        alElegir: (t) => {
          g.turno = t;
          $('g-confirmar-reprogramar').disabled = false;
          avisoGestion('');
          pintarLista();
        },
      });
    if (g.turno && !turnos.some((t) => t.id === g.turno.id && t.disponible)) g.turno = null;
    pintarLista();
  } catch (err) {
    lista.replaceChildren();
    tratarError(err, avisoGestion);
  }
}

$('g-abrir-reprogramar').addEventListener('click', () => {
  vistaGestion('reprogramar');
  cargarTurnos();
});
$('g-anteriores').addEventListener('click', () => {
  const nuevo = sumarDias(estado.gestion.desde, -VENTANA_DIAS);
  estado.gestion.desde = nuevo < estado.hoy ? estado.hoy : nuevo;
  cargarTurnos();
});
$('g-siguientes').addEventListener('click', () => {
  estado.gestion.desde = sumarDias(estado.gestion.desde, VENTANA_DIAS);
  cargarTurnos();
});

$('g-confirmar-reprogramar').addEventListener('click', async (ev) => {
  const boton = ev.currentTarget;
  const { cita: c, turno } = estado.gestion;
  if (!turno) {
    avisoGestion('Elige primero el nuevo horario.');
    return;
  }
  boton.disabled = true;
  try {
    const r = await api(`/admin/citas/${c.codigo}`, { metodo: 'PATCH', cuerpo: { turnoId: turno.id } });
    $('dlg-gestion').close();
    const nuevo = `${formatearFecha(r.cita.fecha, 'dia').toLowerCase()} a las ${r.cita.horaInicio}`;
    avisoOk(
      `Cita ${c.codigo} reprogramada para el ${nuevo}. ` +
        (r.correoEnviado ? 'La paciente recibirá el nuevo horario por correo.' : 'No se pudo enviar el correo: avisa a la paciente por teléfono.'),
    );
    await cargar({ conservarAviso: true });
  } catch (err) {
    boton.disabled = false;
    if (manejarErrorSesion(err)) return;
    avisoGestion(err.message);
    // E2: el turno fue ocupado → volver a mostrar la disponibilidad.
    if (ERRORES_DE_TURNO.includes(err.codigo)) {
      estado.gestion.turno = null;
      cargarTurnos();
    }
  }
});

// ---------------------------------------------------------------------------
// Navegación por fechas (CU-11 A1) e inicio
// ---------------------------------------------------------------------------
function irA(fecha) {
  estado.fecha = fecha;
  cargar();
}

$('dia-anterior').addEventListener('click', () => irA(sumarDias(estado.fecha, -1)));
$('dia-siguiente').addEventListener('click', () => irA(sumarDias(estado.fecha, 1)));
$('hoy').addEventListener('click', () => irA(estado.hoy));
$('actualizar').addEventListener('click', () => cargar());
$('fecha').addEventListener('change', (ev) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ev.target.value)) irA(ev.target.value);
});

async function iniciar() {
  try {
    estado.sesion = await iniciarPanel();
  } catch {
    return;
  }
  const pedida = new URLSearchParams(location.search).get('fecha');
  if (pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida)) estado.fecha = pedida;
  await cargar();
}

iniciar();
