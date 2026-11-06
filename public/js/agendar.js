// P2 – Agendar cita en 4 pasos (CU-02, CU-03, CU-04) y P3 – Comprobante (CU-05).
// Los datos viven solo en memoria de la página: nunca en la URL ni en el almacenamiento del navegador.
import { api, el, formatearFecha, hoyManagua, mostrarAviso, sumarDias } from './api.js';
import { validarCampo } from './validacion.js';
import { pintarTurnos } from './selector-turnos.js';
import { servicioDeLaUrl } from './parametro-servicio.js';
import { entrarVista, escalonar, fundir, quitarEscalonado, reiniciarClase } from './movimiento.js';

const VENTANA_DIAS = 14;
const MAX_DIAS_ADELANTE = 90;
const CAMPOS = ['cedula', 'nombres', 'telefono', 'correo'];

const $ = (id) => document.getElementById(id);
const aviso = $('aviso');

const estado = {
  paso: 1,
  servicios: [],
  servicio: null,
  hoy: hoyManagua(),
  desde: hoyManagua(),
  turno: null,
  preguntas: [],
  preguntasDe: null, // servicioId de las preguntas cargadas
  enviando: false,
};

// ---------------------------------------------------------------------------
// Utilidades de errores por campo
// ---------------------------------------------------------------------------
function errorCampo(idBase, texto) {
  const p = $(`${idBase}-error`);
  if (!p) return;
  p.textContent = texto ?? '';
  p.hidden = !texto;
  const campo = $(idBase);
  if (campo) campo.setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function enfocarPrimerError(contenedor) {
  const primero = contenedor.querySelector('[aria-invalid="true"]');
  if (primero) primero.focus();
}

// ---------------------------------------------------------------------------
// Navegación entre pasos
// ---------------------------------------------------------------------------
function irAPaso(paso, { mensaje, enfocar = true, animar = true } = {}) {
  const direccion = Math.sign(paso - estado.paso);
  estado.paso = paso;
  for (let i = 1; i <= 4; i += 1) $(`paso-${i}`).hidden = i !== paso;
  // El paso nuevo entra desde el lado del avance (adelante: desde la derecha; atrás: desde la izquierda).
  if (animar) entrarVista($(`paso-${paso}`), direccion);
  for (const li of document.querySelectorAll('#progreso .paso')) {
    const n = Number(li.dataset.paso);
    // La pista gris (border-tinta/20) queda; el relleno de color crece con CSS (.paso::before).
    li.classList.remove('font-bold', 'text-tinta', 'text-tinta-2');
    li.dataset.estado = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
    if (n < paso) li.classList.add('text-tinta');
    else if (n === paso) li.classList.add('font-bold', 'text-tinta');
    else li.classList.add('text-tinta-2');
    if (n === paso) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  }
  mostrarAviso(aviso, mensaje ?? '');
  if (!mensaje && enfocar) $(`titulo-paso-${paso}`).focus();
}

for (const boton of document.querySelectorAll('[data-volver]')) {
  boton.addEventListener('click', () => irAPaso(Number(boton.dataset.volver)));
}

// ---------------------------------------------------------------------------
// Paso 1: servicio
// ---------------------------------------------------------------------------
async function cargarServicios() {
  const lista = $('lista-servicios');
  try {
    estado.servicios = await api('/servicios');
  } catch (err) {
    lista.replaceChildren(el('p', { class: 'text-error' }, err.message));
    return;
  } finally {
    lista.setAttribute('aria-busy', 'false');
  }
  if (estado.servicios.length === 0) {
    lista.replaceChildren(el('p', { class: 'text-tinta-2' }, 'Por ahora no hay servicios disponibles para agendar en línea.'));
    return;
  }
  lista.replaceChildren(
    ...estado.servicios.map((s) =>
      el(
        'label',
        { class: 'tarjeta-opcion flex min-h-11 cursor-pointer gap-3 rounded-lg border-2 border-transparent bg-white p-4 shadow-sm has-[:checked]:border-primario' },
        el('input', {
          type: 'radio',
          name: 'servicio',
          value: String(s.id),
          class: 'mt-1 h-5 w-5 shrink-0 accent-primario',
          checked: estado.servicio?.id === s.id,
          'aria-describedby': `servicio-${s.id}-ind`,
        }),
        el(
          'span',
          {},
          el('span', { class: 'block font-bold' }, s.nombre),
          s.indicaciones && el('span', { id: `servicio-${s.id}-ind`, class: 'mt-1 block text-sm text-tinta-2' }, s.indicaciones),
        ),
      ),
    ),
  );
}

// Al elegir un servicio, su tarjeta da un pulso (anillo que se expande) que confirma la selección.
$('lista-servicios').addEventListener('change', (evento) => {
  const tarjeta = evento.target.closest('.tarjeta-opcion');
  if (!tarjeta) return;
  errorCampo('servicio', null);
  reiniciarClase(tarjeta, 'pulso-seleccion');
});

$('continuar-1').addEventListener('click', () => {
  const marcado = document.querySelector('input[name="servicio"]:checked');
  if (!marcado) {
    errorCampo('servicio', 'Elige un servicio para continuar.');
    return;
  }
  errorCampo('servicio', null);
  const elegido = estado.servicios.find((s) => s.id === Number(marcado.value));
  if (estado.servicio?.id !== elegido.id) estado.turno = null; // A1: cambiar de servicio reinicia el turno
  estado.servicio = elegido;
  $('servicio-elegido').textContent = elegido.nombre;
  irAPaso(2);
  cargarTurnos();
});

// ---------------------------------------------------------------------------
// Paso 2: día y hora (los ocupados aparecen tachados)
// ---------------------------------------------------------------------------
function limiteHasta() {
  return sumarDias(estado.hoy, MAX_DIAS_ADELANTE);
}

/** @param {{entrada?: boolean, recienElegido?: number|null}} [mov] entrada: días escalonados (solo al cargar). */
function pintar(turnos, { entrada = false, recienElegido = null } = {}) {
  quitarEscalonado($('lista-turnos'));
  pintarTurnos($('lista-turnos'), turnos, {
    seleccionadoId: estado.turno?.id ?? null,
    recienElegidoId: recienElegido,
    alElegir: (t) => {
      estado.turno = t;
      errorCampo('turno', null);
      pintar(turnos, { recienElegido: t.id });
      $('continuar-2').focus();
    },
  });
  if (entrada) escalonar($('lista-turnos'));
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
    const params = new URLSearchParams({ servicioId: estado.servicio.id, desde: estado.desde, hasta });
    const turnos = await api(`/turnos?${params}`);
    // Si el turno elegido ya no está libre, se descarta.
    if (estado.turno && turnos.some((t) => t.id === estado.turno.id && !t.disponible)) estado.turno = null;
    pintar(turnos, { entrada: true });
  } catch (err) {
    lista.replaceChildren(el('p', { class: 'text-error' }, err.message));
  } finally {
    lista.setAttribute('aria-busy', 'false');
  }
}

$('semana-anterior').addEventListener('click', () => {
  const nuevo = sumarDias(estado.desde, -VENTANA_DIAS);
  estado.desde = nuevo < estado.hoy ? estado.hoy : nuevo;
  cargarTurnos();
});
$('semana-siguiente').addEventListener('click', () => {
  estado.desde = sumarDias(estado.desde, VENTANA_DIAS);
  cargarTurnos();
});

$('continuar-2').addEventListener('click', async () => {
  if (!estado.turno) {
    errorCampo('turno', 'Elige un horario libre para continuar.');
    return;
  }
  errorCampo('turno', null);
  irAPaso(3);
});

// ---------------------------------------------------------------------------
// Paso 3: datos de la paciente y consentimiento (RN-05)
// ---------------------------------------------------------------------------
function leerPaciente({ marcar = true } = {}) {
  const paciente = {};
  let valido = true;
  for (const campo of CAMPOS) {
    const { valor, error } = validarCampo(campo, $(campo).value);
    paciente[campo] = valor;
    if (marcar) errorCampo(campo, error);
    if (error) valido = false;
  }
  return { paciente, valido };
}

for (const campo of CAMPOS) {
  $(campo).addEventListener('blur', () => {
    if ($(campo).value.trim() !== '') errorCampo(campo, validarCampo(campo, $(campo).value).error);
  });
}

$('continuar-3').addEventListener('click', async () => {
  const { valido } = leerPaciente();
  const acepta = $('consentimiento').checked;
  errorCampo('consentimiento', acepta ? null : 'Debes aceptar el consentimiento informado para agendar.');
  if (!valido || !acepta) {
    enfocarPrimerError($('paso-3'));
    return;
  }
  irAPaso(4);
  await cargarPreguntas();
  pintarResumen();
});

// ---------------------------------------------------------------------------
// Paso 4: pre-triaje (CU-04) y confirmación
// ---------------------------------------------------------------------------
const CLASE_CAMPO = 'mt-1 block min-h-11 w-full rounded-lg border border-tinta/30 bg-white px-3';

function controlPregunta(p) {
  const id = `pregunta-${p.id}`;
  const comunes = { id, name: id, autocomplete: 'off', 'aria-describedby': `${id}-error`, 'aria-required': p.obligatoria ? 'true' : false };
  switch (p.tipo) {
    case 'TEXTO':
      return el('textarea', { ...comunes, rows: '3', maxlength: '500', class: `${CLASE_CAMPO} py-2` });
    case 'NUMERO':
      return el('input', { ...comunes, type: 'text', inputmode: 'decimal', maxlength: '9', class: CLASE_CAMPO });
    case 'FECHA':
      return el('input', { ...comunes, type: 'date', max: estado.hoy, class: CLASE_CAMPO });
    case 'SELECCION':
      return el(
        'select',
        { ...comunes, class: CLASE_CAMPO },
        el('option', { value: '' }, 'Elige una opción'),
        p.opciones.map((o) => el('option', { value: o.etiqueta }, o.etiqueta)),
      );
    case 'SI_NO':
      return el(
        'div',
        { id, role: 'radiogroup', 'aria-describedby': `${id}-error`, class: 'mt-1 flex gap-3' },
        ['SI', 'NO'].map((v) =>
          el(
            'label',
            { class: 'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-tinta/30 bg-white px-4 has-[:checked]:border-primario has-[:checked]:font-bold' },
            el('input', { type: 'radio', name: id, value: v, autocomplete: 'off', class: 'h-5 w-5 accent-primario' }),
            v === 'SI' ? 'Sí' : 'No',
          ),
        ),
      );
    default:
      return el('input', { ...comunes, type: 'text', class: CLASE_CAMPO });
  }
}

async function cargarPreguntas() {
  const form = $('form-triaje');
  if (estado.preguntasDe === estado.servicio.id) return; // conserva las respuestas ya escritas
  form.replaceChildren(el('p', { class: 'text-tinta-2' }, 'Cargando preguntas…'));
  try {
    estado.preguntas = await api(`/servicios/${estado.servicio.id}/preguntas`);
    estado.preguntasDe = estado.servicio.id;
  } catch (err) {
    form.replaceChildren(el('p', { class: 'text-error' }, err.message));
    return;
  }
  if (estado.preguntas.length === 0) {
    form.replaceChildren(el('p', { class: 'text-tinta-2' }, 'Este servicio no requiere pre-triaje. Revisa el resumen y confirma.'));
    return;
  }
  form.replaceChildren(
    ...estado.preguntas.map((p) => {
      const esGrupo = p.tipo === 'SI_NO';
      const etiqueta = [p.texto, p.obligatoria && el('span', { class: 'text-error', 'aria-hidden': 'true' }, ' *')];
      return el(
        esGrupo ? 'fieldset' : 'div',
        {},
        esGrupo
          ? el('legend', { class: 'font-bold' }, ...etiqueta)
          : el('label', { for: `pregunta-${p.id}`, class: 'block font-bold' }, ...etiqueta),
        controlPregunta(p),
        el('p', { id: `pregunta-${p.id}-error`, class: 'mt-1 text-sm text-error', hidden: true }),
      );
    }),
  );
}

function valorPregunta(p) {
  if (p.tipo === 'SI_NO') return document.querySelector(`input[name="pregunta-${p.id}"]:checked`)?.value ?? '';
  return $(`pregunta-${p.id}`).value.trim();
}

function leerRespuestas() {
  const respuestas = [];
  let valido = true;
  for (const p of estado.preguntas) {
    const valor = valorPregunta(p);
    const falta = p.obligatoria && valor === '';
    errorCampo(`pregunta-${p.id}`, falta ? 'Esta pregunta es obligatoria.' : null);
    if (falta) valido = false;
    if (valor !== '') respuestas.push({ preguntaId: p.id, valor });
  }
  return { respuestas, valido };
}

function pintarResumen() {
  const { paciente } = leerPaciente({ marcar: false });
  const filas = [
    ['Servicio', estado.servicio.nombre],
    ['Fecha', formatearFecha(estado.turno.fecha)],
    ['Hora', `${estado.turno.horaInicio} a ${estado.turno.horaFin}`],
    ['Paciente', paciente.nombres],
    ['Correo', paciente.correo],
  ];
  const resumen = $('resumen');
  const antes = resumen.textContent;
  resumen.replaceChildren(...filas.flatMap(([k, v]) => [el('dt', { class: 'text-tinta-2' }, k), el('dd', { class: 'font-bold break-words' }, v)]));
  // Solo si cambió algo (otro turno, otros datos), un fundido breve lo hace notar.
  if (antes && antes !== resumen.textContent) fundir(resumen);
}

/** Lleva cada error del servidor al campo correspondiente. */
function mostrarErroresServidor(err) {
  const pasoDe = (campo) => {
    if (campo.startsWith('paciente.') || campo === 'consentimiento') return 3;
    if (campo.startsWith('respuestas')) return 4;
    if (campo === 'turnoId') return 2;
    return 1;
  };
  let pasoMinimo = 4;
  for (const d of err.detalles) {
    const campo = d.campo ?? '';
    if (campo.startsWith('paciente.')) errorCampo(campo.slice('paciente.'.length), d.mensaje);
    else if (campo === 'consentimiento') errorCampo('consentimiento', d.mensaje);
    else if (campo.startsWith('respuestas.')) errorCampo(`pregunta-${campo.split('.')[1]}`, d.mensaje);
    pasoMinimo = Math.min(pasoMinimo, pasoDe(campo));
  }
  if (pasoMinimo !== estado.paso) irAPaso(pasoMinimo, { mensaje: err.message });
  else mostrarAviso(aviso, err.message);
  enfocarPrimerError($(`paso-${pasoMinimo}`));
}

async function confirmar() {
  if (estado.enviando) return;
  const { paciente, valido: pacienteValido } = leerPaciente();
  if (!pacienteValido) {
    irAPaso(3, { mensaje: 'Revisa tus datos de contacto.' });
    return;
  }
  const { respuestas, valido } = leerRespuestas();
  if (!valido) {
    mostrarAviso(aviso, 'Responde las preguntas obligatorias.');
    enfocarPrimerError($('paso-4'));
    return;
  }

  estado.enviando = true;
  const boton = $('confirmar');
  boton.disabled = true;
  boton.textContent = 'Confirmando…';
  try {
    const comprobante = await api('/citas', {
      metodo: 'POST',
      cuerpo: {
        servicioId: estado.servicio.id,
        turnoId: estado.turno.id,
        paciente,
        consentimiento: $('consentimiento').checked,
        respuestas,
      },
    });
    mostrarComprobante(comprobante);
  } catch (err) {
    if (['TURNO_OCUPADO', 'TURNO_NO_DISPONIBLE', 'TURNO_NO_ENCONTRADO'].includes(err.codigo)) {
      // E3: vuelve al paso 2 conservando los datos ingresados.
      estado.turno = null;
      irAPaso(2, { mensaje: `${err.message} Tus datos se conservaron.` });
      cargarTurnos();
    } else if (err.codigo === 'SERVICIO_NO_DISPONIBLE') {
      estado.servicio = null;
      estado.turno = null;
      irAPaso(1, { mensaje: err.message });
      cargarServicios();
    } else if (err.detalles.length > 0) {
      mostrarErroresServidor(err);
    } else {
      mostrarAviso(aviso, err.message);
    }
  } finally {
    estado.enviando = false;
    boton.disabled = false;
    boton.textContent = 'Confirmar cita';
  }
}

$('confirmar').addEventListener('click', confirmar);

// ---------------------------------------------------------------------------
// P3: comprobante
// ---------------------------------------------------------------------------
function mostrarComprobante(c) {
  $('comp-codigo').textContent = c.codigo;
  $('comp-servicio').textContent = c.servicio;
  $('comp-fecha').textContent = formatearFecha(c.fecha);
  $('comp-hora').textContent = `${c.horaInicio} a ${c.horaFin}`;
  $('comp-indicaciones').textContent = c.indicaciones || 'No requiere preparación especial.';
  $('comp-correo-ok').hidden = !c.correoEnviado;
  $('comp-correo-fallo').hidden = c.correoEnviado;

  // Se borran los datos personales y clínicos de la página.
  $('form-datos').reset();
  $('form-triaje').replaceChildren();
  estado.preguntasDe = null;

  $('flujo').hidden = true;
  $('comprobante').hidden = false;
  $('titulo-comprobante').focus();
  window.scrollTo({ top: 0 });
}

$('imprimir').addEventListener('click', () => window.print());

// ---------------------------------------------------------------------------
irAPaso(1, { enfocar: false, animar: false });
// Desde la portada («Agendar este servicio»): marca el servicio si el parámetro es válido.
cargarServicios().then(() => {
  const preseleccionado = servicioDeLaUrl(location.search, estado.servicios);
  const radio = preseleccionado && document.querySelector(`input[name="servicio"][value="${preseleccionado.id}"]`);
  if (!radio) return;
  radio.checked = true;
  $('continuar-1').focus();
});
