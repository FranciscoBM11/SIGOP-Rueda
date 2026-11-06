// A2 – Agenda diaria (CU-11) con estados (CU-12), gestión desde recepción
// (CU-13) y ficha de triaje para la médica (CU-14, A3).
// Las acciones de cada cita las decide el servidor según el rol y el estado
// (campo `transiciones` y `puedeReprogramar`); aquí solo se muestran.
// La agenda se actualiza sola cada 20 s mientras la pestaña está visible, sin
// diálogos ni menú abiertos. Cada petición renueva la sesión, así que se pausa
// tras 10 min sin interacción: la sesión vence a más tardar ~40 min después del
// último uso (30 min de inactividad del servidor + la pausa).
import { api, el, formatearFecha, hoyManagua, mostrarAviso, sumarDias } from './api.js';
import { iniciarPanel, manejarErrorSesion } from './admin-comun.js';
import { pintarTurnos } from './selector-turnos.js';
import { entrarVista, escalonar, fundir, movimientoReducido, quitarEscalonado } from './movimiento.js';

const $ = (id) => document.getElementById(id);

const ESTADOS = {
  CONFIRMADA: { texto: 'Confirmada', plural: 'Confirmadas', clase: 'border-info/30 bg-info/10 text-info' },
  EN_ESPERA: { texto: 'En espera', plural: 'En espera', clase: 'border-aviso/30 bg-aviso-fondo text-aviso' },
  ATENDIDA: { texto: 'Atendida', plural: 'Atendidas', clase: 'border-salvia/30 bg-salvia/10 text-salvia' },
  NO_ASISTIO: { texto: 'No asistió', plural: 'No asistió', clase: 'border-tinta/15 bg-tinta/10 text-tinta-2' },
  CANCELADA: { texto: 'Cancelada', plural: 'Canceladas', clase: 'border-dashed border-error/40 bg-error/5 text-error' },
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
const INTERVALO_AUTO_MS = 20 * 1000; // actualización automática
const PAUSA_SIN_USO_MS = 10 * 60 * 1000; // sin clic, toque ni tecla: deja de actualizar

const BOTON = {
  principal: 'min-h-11 rounded-lg bg-salvia px-4 font-bold text-white hover:bg-salvia/90 disabled:opacity-60',
  secundario: 'min-h-11 rounded-lg border border-tinta/20 bg-white px-4 font-bold hover:bg-bruma disabled:opacity-60',
  menu: 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-tinta/20 bg-white px-3 hover:bg-bruma aria-expanded:bg-bruma',
  opcion: 'flex min-h-11 w-full items-center rounded-lg px-3 text-left font-bold hover:bg-bruma',
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
  // Movimiento: cita cuyo estado acaba de cambiar (fundido de la insignia) y cifras de los filtros ya mostradas.
  cambio: null,
  cuentas: null,
  destello: null, // código de la cita recién actualizada (destello breve en su fila)
  // Actualización automática
  version: 0, // sube en cada carga; una respuesta de una carga anterior se descarta
  ocupado: 0, // cargas o cambios de estado en curso
  firma: '', // lo último dibujado; si no cambia, no se vuelve a dibujar
  ultimaCarga: 0,
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

function insignia(estadoCita, extra = '') {
  const e = ESTADOS[estadoCita] ?? { texto: estadoCita, clase: 'border-tinta/10' };
  return el('span', { class: `inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-bold ${e.clase} ${extra}` }, e.texto);
}

/** Insignia del estado; si acaba de cambiar, la anterior se desvanece encima de la nueva (solo opacidad). */
function insigniaConCambio(c) {
  const cambio = estado.cambio;
  if (!cambio || cambio.codigo !== c.codigo || cambio.anterior === c.estado || movimientoReducido()) return insignia(c.estado);
  const anterior = insignia(cambio.anterior, 'insignia-anterior');
  anterior.setAttribute('aria-hidden', 'true');
  anterior.addEventListener('animationend', () => anterior.remove(), { once: true });
  return el('span', { class: 'cambio-insignia' }, anterior, insignia(c.estado, 'insignia-nueva'));
}

// CU-16 E2: la médica cambió su horario y esta cita quedó fuera; recepción la reprograma.
function insignias(c) {
  return el(
    'span',
    { class: 'inline-flex flex-wrap gap-1' },
    insigniaConCambio(c),
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
/** @param {{conservarAviso?: boolean, entrada?: boolean}} [opciones] entrada: filas escalonadas (al cambiar de día). */
async function cargar({ conservarAviso = false, entrada = true } = {}) {
  if (!conservarAviso) avisoOk('');
  mostrarAviso($('aviso'), '');
  $('fecha').value = estado.fecha;
  $('hoy').disabled = estado.fecha === estado.hoy;
  history.replaceState(null, '', estado.fecha === estado.hoy ? location.pathname : `?fecha=${estado.fecha}`);
  const dia = formatearFecha(estado.fecha, 'dia');
  $('titulo').textContent = `Agenda del ${dia.charAt(0).toLowerCase()}${dia.slice(1)}`;
  $('resumen').textContent = 'Cargando…';
  const version = ++estado.version;
  estado.ocupado += 1;
  try {
    const citas = await api(`/admin/citas/agenda?fecha=${estado.fecha}`);
    if (version !== estado.version) return; // ya se pidió otro día
    estado.citas = citas;
  } catch (err) {
    if (version !== estado.version) return;
    estado.citas = [];
    $('resumen').textContent = '';
    pintar();
    tratarError(err);
    return;
  } finally {
    estado.ocupado -= 1;
    estado.ultimaCarga = Date.now();
  }
  pintar({ entrada });
}

/** Lo que se ve de la agenda: los datos y qué citas están en curso (cambia con la hora). */
function firmaAgenda(citas) {
  return `${JSON.stringify(citas)}|${citas.filter(enCurso).map((c) => c.codigo).join(',')}`;
}

/** @param {{entrada?: boolean, fundido?: boolean}} [mov] entrada: escalonado; fundido: cambio de filtro. */
function pintar({ entrada = false, fundido = false } = {}) {
  estado.firma = firmaAgenda(estado.citas);
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
  quitarEscalonado($('filas'));
  quitarEscalonado($('tarjetas'));
  $('filas').replaceChildren(...visibles.map(fila));
  $('tarjetas').replaceChildren(...visibles.map(tarjeta));
  estado.cambio = null;
  estado.destello = null;
  // Escalonado muy corto (25 ms, con tope): la agenda se usa muchas veces al día.
  if (entrada) {
    escalonar($('filas'), 'entra-escalonado-rapido');
    escalonar($('tarjetas'), 'entra-escalonado-rapido');
  } else if (fundido) {
    fundir($('filas'));
    fundir($('tarjetas'));
  }
}

function pintarFiltros() {
  const cuenta = (e) => (e === 'TODAS' ? estado.citas.length : estado.citas.filter((c) => c.estado === e).length);
  const previas = estado.cuentas;
  estado.cuentas = Object.fromEntries(ORDEN_FILTROS.map((e) => [e, cuenta(e)]));
  // La cifra que cambió da un pulso breve (no en la primera carga).
  const cifra = (e) => el('span', { class: `tabular-nums ${previas && previas[e] !== estado.cuentas[e] ? 'cifra-cambia' : ''}` }, String(estado.cuentas[e]));
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
            if (estado.filtro === e) return;
            estado.filtro = e;
            pintar({ fundido: true });
          },
        },
        `${e === 'TODAS' ? 'Todas' : ESTADOS[e].plural} `,
        cifra(e),
      );
    }),
  );
}

/** Acciones secundarias que el servidor permite (RN-11); van en el menú «⋯». */
function accionesSecundarias(c) {
  const lista = [];
  if (c.transiciones.includes('NO_ASISTIO')) lista.push({ texto: 'Marcar «No asistió»', vista: 'no-asistio' });
  if (c.puedeReprogramar) lista.push({ texto: 'Reprogramar', vista: 'reprogramar' });
  if (c.transiciones.includes('CANCELADA')) lista.push({ texto: 'Cancelar cita', vista: 'cancelar', peligro: true });
  return lista;
}

/**
 * Botones de la cita según el rol, el estado y lo que el servidor permite (RN-11).
 * Una acción principal por fila:
 *  - Confirmada → «Registrar llegada» (recepción).
 *  - En espera  → «Marcar atendida» junto a «Ver triaje» (médica).
 *  - Atendida   → «Ver triaje» (médica).
 * No asistió, Reprogramar y Cancelar van en el menú «⋯», cada una con confirmación.
 */
function acciones(c) {
  const nodos = [];
  const rol = estado.sesion.rol;
  if (rol === 'RECEPCIONISTA' && c.transiciones.includes('EN_ESPERA')) {
    nodos.push(el('button', { type: 'button', class: BOTON.principal, onclick: (ev) => cambiarEstado(c, 'EN_ESPERA', ev.currentTarget) }, 'Registrar llegada'));
  }
  if (rol === 'MEDICO') {
    if (c.transiciones.includes('ATENDIDA')) {
      nodos.push(el('button', { type: 'button', class: BOTON.principal, onclick: (ev) => cambiarEstado(c, 'ATENDIDA', ev.currentTarget) }, 'Marcar atendida'));
    }
    if (c.tieneTriaje && c.estado !== 'CANCELADA') {
      nodos.push(el('button', { type: 'button', class: BOTON.secundario, 'aria-label': `Ver triaje de ${c.paciente}, cita ${c.codigo}`, onclick: () => abrirTriaje(c) }, 'Ver triaje'));
    } else if (c.estado !== 'CANCELADA') {
      nodos.push(el('span', { class: 'text-sm text-tinta-2' }, 'Sin triaje'));
    }
  }
  if (accionesSecundarias(c).length > 0) {
    nodos.push(
      el(
        'button',
        {
          type: 'button',
          class: BOTON.menu,
          'aria-haspopup': 'true',
          'aria-expanded': 'false',
          'aria-controls': 'menu-acciones',
          'aria-label': `Más acciones para la cita ${c.codigo} de ${c.paciente}`,
          title: 'Más acciones',
          onclick: (ev) => alternarMenuAcciones(c, ev.currentTarget),
        },
        el('span', { 'aria-hidden': 'true', class: 'text-xl font-bold leading-none' }, '⋯'),
      ),
    );
  }
  return nodos;
}

// ---------------------------------------------------------------------------
// Menú «⋯» (un solo panel flotante; posición fija para que la tabla no lo recorte)
// ---------------------------------------------------------------------------
const menuAcciones = { boton: null };

function cerrarMenuAcciones({ devolverFoco = false } = {}) {
  const panel = $('menu-acciones');
  if (panel.hidden) return;
  panel.hidden = true;
  menuAcciones.boton?.setAttribute('aria-expanded', 'false');
  if (devolverFoco) menuAcciones.boton?.focus();
  menuAcciones.boton = null;
}

function alternarMenuAcciones(c, boton) {
  if (menuAcciones.boton === boton) {
    cerrarMenuAcciones();
    return;
  }
  cerrarMenuAcciones();
  const panel = $('menu-acciones');
  $('menu-acciones-titulo').textContent = `Cita ${c.codigo} · ${c.paciente}`;
  $('menu-acciones-lista').replaceChildren(
    ...accionesSecundarias(c).map((a) =>
      el(
        'button',
        {
          type: 'button',
          class: `${BOTON.opcion} ${a.peligro ? 'text-error hover:bg-error/5' : ''}`,
          onclick: () => {
            cerrarMenuAcciones();
            abrirGestion(c, a.vista);
          },
        },
        a.texto,
      ),
    ),
  );
  panel.hidden = false;
  menuAcciones.boton = boton;
  boton.setAttribute('aria-expanded', 'true');
  // Debajo del botón, alineado a su borde derecho; arriba si no cabe.
  const r = boton.getBoundingClientRect();
  const ancho = panel.offsetWidth;
  const alto = panel.offsetHeight;
  const izquierda = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
  const encima = r.bottom + 6 + alto > window.innerHeight;
  const arriba = encima ? Math.max(8, r.top - 6 - alto) : r.bottom + 6;
  panel.style.left = `${izquierda}px`;
  panel.style.top = `${arriba}px`;
  // Crece desde la esquina más cercana al botón «⋯».
  panel.style.transformOrigin = `${encima ? 'bottom' : 'top'} right`;
  panel.querySelector('button')?.focus();
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !$('menu-acciones').hidden) cerrarMenuAcciones({ devolverFoco: true });
});
document.addEventListener('pointerdown', (ev) => {
  if (!$('menu-acciones').hidden && !$('menu-acciones').contains(ev.target) && !menuAcciones.boton?.contains(ev.target)) cerrarMenuAcciones();
});
$('menu-acciones').addEventListener('focusout', (ev) => {
  if (ev.relatedTarget && !$('menu-acciones').contains(ev.relatedTarget) && ev.relatedTarget !== menuAcciones.boton) cerrarMenuAcciones();
});
window.addEventListener('resize', () => cerrarMenuAcciones());
window.addEventListener('scroll', () => cerrarMenuAcciones(), { passive: true });

/** Destello breve sobre la fila o tarjeta de la cita que se acaba de actualizar. */
function claseDestello(c) {
  return estado.destello === c.codigo && !movimientoReducido() ? 'fila-destello' : '';
}

function fila(c) {
  const resaltada = enCurso(c);
  return el(
    'tr',
    { 'data-codigo': c.codigo, class: `border-b border-tinta/10 last:border-0 ${resaltada ? 'bg-acento/10 shadow-[inset_4px_0_0_var(--color-acento)]' : ''} ${claseDestello(c)}` },
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
    { 'data-codigo': c.codigo, class: `rounded-xl bg-white p-4 shadow-sm ${resaltada ? 'border-l-4 border-acento' : ''} ${claseDestello(c)}` },
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
  estado.ocupado += 1; // la actualización automática espera a que termine
  try {
    try {
      await api(`/admin/citas/${c.codigo}/estado`, { metodo: 'PATCH', cuerpo: { estado: nuevo } });
    } catch (err) {
      if (boton) boton.disabled = false;
      if (manejarErrorSesion(err)) return false;
      if (mostrarError) {
        mostrarError(err.message);
      } else {
        // La agenda puede estar desactualizada (otro usuario cambió la cita).
        await cargar({ entrada: false });
        avisoError(err.message);
      }
      return false;
    }
    avisoOk(`Cita ${c.codigo} de ${c.paciente}: ${EXITO_POR_ESTADO[nuevo]}.`);
    estado.cambio = { codigo: c.codigo, anterior: c.estado };
    estado.destello = c.codigo;
    await cargar({ conservarAviso: true, entrada: false });
    return true;
  } finally {
    estado.ocupado -= 1;
  }
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
const VISTAS_GESTION = { opciones: 'gestion-opciones', 'no-asistio': 'gestion-no-asistio', cancelar: 'gestion-cancelar', reprogramar: 'gestion-reprogramar' };

function vistaGestion(vista, { animar = true } = {}) {
  for (const [nombre, id] of Object.entries(VISTAS_GESTION)) $(id).hidden = vista !== nombre;
  $('gestion-aviso').hidden = true;
  // Dentro del diálogo: la confirmación entra desde la derecha; «Volver» a las opciones, desde la izquierda.
  if (animar) entrarVista($(VISTAS_GESTION[vista]), vista === 'opciones' ? -1 : 1);
}

function avisoGestion(texto) {
  $('gestion-aviso').textContent = texto;
  $('gestion-aviso').hidden = !texto;
}

/** @param {'opciones'|'no-asistio'|'cancelar'|'reprogramar'} [vista] vista inicial (desde el menú «⋯»). */
function abrirGestion(c, vista = 'opciones') {
  estado.gestion = { cita: c, desde: estado.hoy, turno: null, directo: vista !== 'opciones' };
  $('gestion-titulo').textContent = `Cita ${c.codigo} de ${c.paciente}`;
  $('gestion-sub').textContent = `${c.servicio}, ${fechaHora(c)}`;
  $('g-no-asistio').hidden = !c.transiciones.includes('NO_ASISTIO');
  $('g-abrir-reprogramar').hidden = !c.puedeReprogramar;
  $('g-abrir-cancelar').hidden = !c.transiciones.includes('CANCELADA');
  $('g-sin-opciones').hidden = !($('g-no-asistio').hidden && $('g-abrir-reprogramar').hidden && $('g-abrir-cancelar').hidden);
  for (const id of ['g-no-asistio', 'g-si-no-asistio', 'g-si-cancelar', 'g-confirmar-reprogramar']) $(id).disabled = false;
  vistaGestion(vista, { animar: false }); // el diálogo ya tiene su propia entrada
  $('dlg-gestion').showModal();
  if (vista === 'reprogramar') cargarTurnos();
}

for (const boton of document.querySelectorAll('[data-volver-opciones]')) {
  // Si se llegó desde el menú «⋯», «Volver» cierra el diálogo; si no, regresa a las opciones.
  boton.addEventListener('click', () => (estado.gestion.directo ? $('dlg-gestion').close() : vistaGestion('opciones')));
}

$('g-no-asistio').addEventListener('click', () => vistaGestion('no-asistio'));

$('g-si-no-asistio').addEventListener('click', async (ev) => {
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
    estado.cambio = { codigo: c.codigo, anterior: c.estado };
    estado.destello = c.codigo;
    await cargar({ conservarAviso: true, entrada: false });
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
        (r.correoEnviado ? 'La paciente recibirá el nuevo horario por correo.' : 'El correo no salió al primer intento y se está reintentando; si es urgente, avisa a la paciente por teléfono.'),
    );
    estado.destello = c.codigo; // reprogramada: si sigue en este día, su fila destella
    await cargar({ conservarAviso: true, entrada: false });
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

// ---------------------------------------------------------------------------
// Actualización automática (cada 20 s, solo con la pestaña visible)
// Conserva la fecha, el filtro, el foco y el desplazamiento; no repite la
// entrada de las filas ni muestra «Cargando…». Si nada cambió, no redibuja.
// ---------------------------------------------------------------------------
const auto = { ultimaActividad: Date.now(), enPausa: false, enCurso: false };

/** ¿Algo abierto que una actualización interrumpiría? (diálogos, menú «⋯» o una acción en curso) */
function hayAlgoAbierto() {
  return Boolean(document.querySelector('dialog[open]')) || !$('menu-acciones').hidden || estado.ocupado > 0;
}

function mostrarPausa(enPausa) {
  auto.enPausa = enPausa;
  $('auto-estado').textContent = enPausa
    ? 'Actualización automática en pausa por falta de uso. Toca la pantalla o pulsa «Actualizar».'
    : 'Se actualiza sola cada 20 segundos.';
}

/** Redibuja sin animación y devuelve el foco al mismo botón (de la fila o del filtro). */
function pintarConservandoFoco() {
  const activo = document.activeElement;
  let pista = null;
  const cita = activo?.closest?.('[data-codigo]');
  if (cita && ($('filas').contains(cita) || $('tarjetas').contains(cita))) {
    const botones = [...cita.querySelectorAll('button')];
    pista = { lista: $('filas').contains(cita) ? 'filas' : 'tarjetas', codigo: cita.dataset.codigo, indice: botones.indexOf(activo), texto: activo.textContent };
  } else if ($('filtros').contains(activo)) {
    pista = { lista: 'filtros', indice: [...$('filtros').querySelectorAll('button')].indexOf(activo) };
  }
  pintar(); // sin entrada ni fundido
  if (!pista) return;
  let botones = [];
  if (pista.lista === 'filtros') {
    botones = [...$('filtros').querySelectorAll('button')];
  } else {
    const nueva = [...$(pista.lista).querySelectorAll('[data-codigo]')].find((n) => n.dataset.codigo === pista.codigo);
    botones = nueva ? [...nueva.querySelectorAll('button')] : [];
  }
  const destino = botones.find((b) => pista.texto && b.textContent === pista.texto) ?? botones[pista.indice];
  destino?.focus({ preventScroll: true });
}

async function actualizarSola() {
  if (!estado.sesion || auto.enCurso || document.visibilityState !== 'visible') return;
  if (Date.now() - auto.ultimaActividad > PAUSA_SIN_USO_MS) {
    if (!auto.enPausa) mostrarPausa(true);
    return;
  }
  if (hayAlgoAbierto()) return;
  const { version, fecha } = estado;
  auto.enCurso = true;
  try {
    const citas = await api(`/admin/citas/agenda?fecha=${fecha}`);
    // Mientras llegaba: se cambió de día, se abrió algo o empezó otra carga.
    if (version !== estado.version || fecha !== estado.fecha || hayAlgoAbierto()) return;
    if (firmaAgenda(citas) === estado.firma) return; // sin cambios: no se toca la página
    estado.citas = citas;
    pintarConservandoFoco();
  } catch (err) {
    // Sesión vencida → login. Otros fallos (red): se reintenta en el próximo ciclo sin molestar.
    manejarErrorSesion(err);
  } finally {
    auto.enCurso = false;
    estado.ultimaCarga = Date.now();
  }
}

function iniciarActualizacionAutomatica() {
  mostrarPausa(false);
  setInterval(() => {
    if (Date.now() - estado.ultimaCarga >= INTERVALO_AUTO_MS - 1000) actualizarSola();
  }, 5000);
  // Al volver a la pestaña, actualizar enseguida si ya tocaba.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - estado.ultimaCarga >= INTERVALO_AUTO_MS) actualizarSola();
  });
  // Uso real de la página (no el movimiento del ratón): reanuda si estaba en pausa.
  for (const tipo of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(
      tipo,
      () => {
        auto.ultimaActividad = Date.now();
        if (auto.enPausa) {
          mostrarPausa(false);
          actualizarSola();
        }
      },
      { passive: true, capture: true },
    );
  }
}

async function iniciar() {
  try {
    estado.sesion = await iniciarPanel();
  } catch {
    return;
  }
  if (estado.sesion.rol === 'MEDICO') estado.filtro = 'EN_ESPERA';
  const pedida = new URLSearchParams(location.search).get('fecha');
  if (pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida)) estado.fecha = pedida;
  await cargar();
  iniciarActualizacionAutomatica();
}

iniciar();
