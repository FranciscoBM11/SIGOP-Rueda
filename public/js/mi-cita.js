// P4 – Mi cita: acceso con cédula y código (CU-08), cancelar (CU-06) y
// reprogramar (CU-07). El token de cita vive solo en memoria de la página:
// nunca en la URL ni en el almacenamiento del navegador. Al recargar la
// página hay que volver a ingresar la cédula y el código.
import { api, el, formatearFecha, hoyManagua, mostrarAviso, sumarDias } from './api.js';
import { validarCampo } from './validacion.js';
import { pintarTurnos } from './selector-turnos.js';

const VENTANA_DIAS = 14;
const MAX_DIAS_ADELANTE = 90;
const ERRORES_DE_TURNO = ['TURNO_OCUPADO', 'TURNO_NO_DISPONIBLE', 'TURNO_NO_ENCONTRADO', 'MISMO_TURNO'];
const ERRORES_DE_TOKEN = ['TOKEN_INVALIDO', 'TOKEN_REQUERIDO', 'TOKEN_NO_CORRESPONDE'];

const $ = (id) => document.getElementById(id);

const ESTADOS = {
  CONFIRMADA: { texto: 'Confirmada', clase: 'bg-primario/10 text-primario' },
  EN_ESPERA: { texto: 'En espera', clase: 'bg-acento/30 text-tinta' },
  ATENDIDA: { texto: 'Atendida', clase: 'bg-salvia/15 text-salvia' },
  NO_ASISTIO: { texto: 'No asistió', clase: 'bg-tinta/10 text-tinta-2' },
  CANCELADA: { texto: 'Cancelada', clase: 'bg-error/10 text-error' },
};

const estado = {
  token: null,
  cita: null,
  hoy: hoyManagua(),
  desde: hoyManagua(),
  turno: null, // nuevo turno elegido al reprogramar
  ocupado: false,
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function errorCampo(idBase, texto) {
  const p = $(`${idBase}-error`);
  p.textContent = texto ?? '';
  p.hidden = !texto;
  const campo = $(idBase);
  if (campo) campo.setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function mostrarSolo(vista) {
  // vista: 'acciones' | 'cancelar' | 'reprogramar' | 'ninguna'
  $('acciones').hidden = vista !== 'acciones';
  $('confirmar-cancelacion').hidden = vista !== 'cancelar';
  $('reprogramar').hidden = vista !== 'reprogramar';
}

function limpiarMensajes() {
  mostrarAviso($('aviso-cita'), '');
}

// ---------------------------------------------------------------------------
// Pantalla de confirmación (CU-07 paso 9 y CU-06 paso 7)
// ---------------------------------------------------------------------------
function mostrarPantalla(cual) {
  // cual: 'principal' | 'confirmacion'
  $('vista-principal').hidden = cual !== 'principal';
  $('confirmacion').hidden = cual !== 'confirmacion';
  window.scrollTo(0, 0);
}

function confirmacionReprogramada(r) {
  const etiqueta = $('conf-etiqueta');
  etiqueta.textContent = '✓ Cita reprogramada';
  etiqueta.className = 'inline-flex items-center gap-2 rounded-full bg-salvia px-3 py-1 text-sm font-bold text-white';
  $('conf-titulo').textContent = 'Cambiamos tu cita';
  $('conf-texto').textContent = 'Conservas el mismo código. El horario anterior quedó libre.';
  $('conf-servicio').textContent = r.servicio;
  $('conf-dia').textContent = formatearFecha(r.nuevoHorario.fecha);
  $('conf-hora').textContent = `${r.nuevoHorario.horaInicio} a ${r.nuevoHorario.horaFin}`;
  $('conf-codigo').textContent = r.codigo;
  $('conf-detalle').hidden = false;
  $('conf-correo-ok').hidden = !r.correoEnviado;
  $('conf-correo-fallo').hidden = r.correoEnviado;
  $('conf-ver-cita').hidden = false;
  $('conf-agendar').hidden = true;
  mostrarPantalla('confirmacion');
  $('conf-titulo').focus();
}

function confirmacionCancelada(cita) {
  const etiqueta = $('conf-etiqueta');
  etiqueta.textContent = 'Cita cancelada';
  etiqueta.className = 'inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-1 text-sm font-bold text-error';
  $('conf-titulo').textContent = 'Tu cita fue cancelada';
  $('conf-texto').textContent = 'El horario quedó libre para otra paciente. Si lo necesitas, puedes agendar una nueva cita.';
  $('conf-servicio').textContent = cita.servicio;
  $('conf-dia').textContent = formatearFecha(cita.fecha);
  $('conf-hora').textContent = `${cita.horaInicio} a ${cita.horaFin}`;
  $('conf-codigo').textContent = cita.codigo;
  $('conf-detalle').hidden = false;
  $('conf-correo-ok').hidden = true;
  $('conf-correo-fallo').hidden = true;
  $('conf-ver-cita').hidden = true;
  $('conf-agendar').hidden = false;
  mostrarPantalla('confirmacion');
  $('conf-titulo').focus();
}

// "Ver mi cita": vuelve a la tarjeta con el horario ya actualizado.
$('conf-ver-cita').addEventListener('click', () => {
  limpiarMensajes();
  mostrarSolo('acciones');
  mostrarPantalla('principal');
  $('cita-servicio').focus();
});

/** Vuelve al formulario cuando el token venció o no sirve (401/403). */
function accesoExpirado(err) {
  estado.token = null;
  estado.cita = null;
  $('panel-cita').hidden = true;
  mostrarAviso($('aviso-acceso'), err.message);
  $('cedula').focus();
}

// ---------------------------------------------------------------------------
// Tarjeta de la cita
// ---------------------------------------------------------------------------
function pintarCita() {
  const c = estado.cita;
  const info = ESTADOS[c.estado] ?? { texto: c.estado, clase: 'bg-tinta/10 text-tinta' };
  $('cita-servicio').textContent = c.servicio;
  const etiqueta = $('cita-estado');
  etiqueta.textContent = info.texto;
  etiqueta.className = `rounded-full px-3 py-1 text-sm font-bold ${info.clase}`;
  $('cita-paciente').textContent = c.paciente;
  $('cita-dia').textContent = formatearFecha(c.fecha);
  $('cita-hora').textContent = `${c.horaInicio} a ${c.horaFin}`;
  $('cita-codigo').textContent = c.codigo;
}

// ---------------------------------------------------------------------------
// CU-08: buscar mi cita
// ---------------------------------------------------------------------------
$('form-acceso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarAviso($('aviso-acceso'), '');
  const cedula = validarCampo('cedula', $('cedula').value);
  const codigo = validarCampo('codigo', $('codigo').value);
  errorCampo('cedula', cedula.error);
  errorCampo('codigo', codigo.error);
  if (cedula.error || codigo.error) {
    $(cedula.error ? 'cedula' : 'codigo').focus();
    return;
  }
  $('cedula').value = cedula.valor;
  $('codigo').value = codigo.valor;

  const boton = $('buscar');
  boton.disabled = true;
  boton.textContent = 'Buscando…';
  try {
    const r = await api('/citas/acceso', { metodo: 'POST', cuerpo: { cedula: cedula.valor, codigo: codigo.valor } });
    estado.token = r.tokenCita;
    estado.cita = r.cita;
    limpiarMensajes();
    pintarCita();
    mostrarSolo('acciones');
    $('panel-cita').hidden = false;
    $('cita-servicio').focus();
  } catch (err) {
    estado.token = null;
    $('panel-cita').hidden = true;
    if (err.codigo === 'DATOS_INVALIDOS') {
      for (const d of err.detalles) if (d.campo === 'cedula' || d.campo === 'codigo') errorCampo(d.campo, d.mensaje);
    }
    // ACCESO_DENEGADO, ACCESO_BLOQUEADO, CITA_NO_MODIFICABLE, DEMASIADAS_PETICIONES…
    mostrarAviso($('aviso-acceso'), err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Buscar mi cita';
  }
});

// ---------------------------------------------------------------------------
// CU-06: cancelar
// ---------------------------------------------------------------------------
function abrirCancelar() {
  limpiarMensajes();
  mostrarSolo('cancelar');
  $('titulo-cancelar').focus();
}

function volverAAcciones() {
  // A2: la paciente desiste; la cita no cambia.
  mostrarSolo('acciones');
  $('abrir-reprogramar').focus();
}

$('abrir-cancelar').addEventListener('click', abrirCancelar);
$('reprogramar-a-cancelar').addEventListener('click', abrirCancelar); // CU-07 A1
$('no-cancelar').addEventListener('click', volverAAcciones);

$('si-cancelar').addEventListener('click', async () => {
  const boton = $('si-cancelar');
  boton.disabled = true;
  try {
    const r = await api(`/citas/${encodeURIComponent(estado.cita.codigo)}/cancelacion`, { metodo: 'POST', token: estado.token });
    estado.cita = r.cita;
    pintarCita();
    mostrarSolo('ninguna');
    confirmacionCancelada(r.cita);
  } catch (err) {
    if (ERRORES_DE_TOKEN.includes(err.codigo)) return accesoExpirado(err);
    if (err.codigo === 'CITA_NO_MODIFICABLE') mostrarSolo('ninguna');
    mostrarAviso($('aviso-cita'), err.message);
  } finally {
    boton.disabled = false;
  }
  return undefined;
});

// ---------------------------------------------------------------------------
// CU-07: reprogramar
// ---------------------------------------------------------------------------
function limiteHasta() {
  return sumarDias(estado.hoy, MAX_DIAS_ADELANTE);
}

function pintar(turnos) {
  pintarTurnos($('lista-turnos'), turnos, {
    seleccionadoId: estado.turno?.id ?? null,
    actual: { fecha: estado.cita.fecha, horaInicio: estado.cita.horaInicio },
    alElegir: (t) => {
      estado.turno = t;
      errorCampo('turno', null);
      pintar(turnos);
      $('confirmar-reprogramar').focus();
    },
  });
}

async function cargarTurnos() {
  const hasta = [sumarDias(estado.desde, VENTANA_DIAS - 1), limiteHasta()].sort()[0];
  $('rango-texto').textContent = `${formatearFecha(estado.desde, 'corta')} – ${formatearFecha(hasta, 'corta')}`;
  $('semana-anterior').disabled = estado.desde <= estado.hoy;
  $('semana-siguiente').disabled = hasta >= limiteHasta();
  const lista = $('lista-turnos');
  lista.setAttribute('aria-busy', 'true');
  lista.replaceChildren(el('p', { class: 'text-tinta-2' }, 'Buscando turnos…'));
  try {
    const params = new URLSearchParams({ servicioId: estado.cita.servicioId, desde: estado.desde, hasta });
    const turnos = await api(`/turnos?${params}`);
    if (estado.turno && turnos.some((t) => t.id === estado.turno.id && !t.disponible)) estado.turno = null;
    pintar(turnos);
  } catch (err) {
    lista.replaceChildren(el('p', { class: 'text-error' }, err.message));
  } finally {
    lista.setAttribute('aria-busy', 'false');
  }
}

function abrirReprogramar() {
  limpiarMensajes();
  estado.hoy = hoyManagua();
  estado.desde = estado.hoy;
  estado.turno = null;
  errorCampo('turno', null);
  mostrarSolo('reprogramar');
  $('titulo-reprogramar').focus();
  cargarTurnos();
}

$('abrir-reprogramar').addEventListener('click', abrirReprogramar);
$('cancelar-a-reprogramar').addEventListener('click', abrirReprogramar); // CU-06 A1
$('volver-reprogramar').addEventListener('click', volverAAcciones); // CU-07 A2

$('semana-anterior').addEventListener('click', () => {
  const nuevo = sumarDias(estado.desde, -VENTANA_DIAS);
  estado.desde = nuevo < estado.hoy ? estado.hoy : nuevo;
  cargarTurnos();
});
$('semana-siguiente').addEventListener('click', () => {
  estado.desde = sumarDias(estado.desde, VENTANA_DIAS);
  cargarTurnos();
});

$('confirmar-reprogramar').addEventListener('click', async () => {
  if (estado.ocupado) return undefined;
  if (!estado.turno) {
    errorCampo('turno', 'Elige un horario libre para continuar.');
    return undefined;
  }
  errorCampo('turno', null);
  const boton = $('confirmar-reprogramar');
  estado.ocupado = true;
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const r = await api(`/citas/${encodeURIComponent(estado.cita.codigo)}`, {
      metodo: 'PATCH',
      cuerpo: { turnoId: estado.turno.id },
      token: estado.token,
    });
    estado.cita = { ...estado.cita, ...r.nuevoHorario };
    estado.turno = null;
    pintarCita();
    mostrarSolo('acciones');
    confirmacionReprogramada(r);
  } catch (err) {
    if (ERRORES_DE_TOKEN.includes(err.codigo)) return accesoExpirado(err);
    if (ERRORES_DE_TURNO.includes(err.codigo)) {
      // E4: el turno se ocupó; se vuelve a mostrar la disponibilidad.
      estado.turno = null;
      errorCampo('turno', err.message);
      cargarTurnos();
    } else if (err.codigo === 'CITA_NO_MODIFICABLE') {
      mostrarSolo('ninguna');
      mostrarAviso($('aviso-cita'), err.message);
    } else {
      mostrarAviso($('aviso-cita'), err.message);
    }
  } finally {
    estado.ocupado = false;
    boton.disabled = false;
    boton.textContent = 'Confirmar nuevo horario';
  }
  return undefined;
});
