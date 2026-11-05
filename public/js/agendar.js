// P2 – Agendar cita en 4 pasos (CU-02, CU-03, CU-04) y P3 – Comprobante (CU-05).
// Los datos viven solo en memoria de la página: nunca en la URL ni en el almacenamiento del navegador.
import { api, el, formatearFecha, hoyManagua, mostrarAviso, sumarDias } from './api.js';
import { validarCampo } from './validacion.js';

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
function irAPaso(paso, { mensaje, enfocar = true } = {}) {
  estado.paso = paso;
  for (let i = 1; i <= 4; i += 1) $(`paso-${i}`).hidden = i !== paso;
  for (const li of document.querySelectorAll('#progreso .paso')) {
    const n = Number(li.dataset.paso);
    li.classList.remove('border-baya', 'border-salvia', 'border-tinta/20', 'font-bold', 'text-tinta', 'text-tinta-2');
    if (n < paso) li.classList.add('border-salvia', 'text-tinta');
    else if (n === paso) li.classList.add('border-baya', 'font-bold', 'text-tinta');
    else li.classList.add('border-tinta/20', 'text-tinta-2');
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
        { class: 'flex min-h-11 cursor-pointer gap-3 rounded-lg border-2 border-transparent bg-white p-4 shadow-sm has-[:checked]:border-baya' },
        el('input', {
          type: 'radio',
          name: 'servicio',
          value: String(s.id),
          class: 'mt-1 h-5 w-5 shrink-0 accent-baya',
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

function claseTurno(t) {
  if (!t.disponible) return 'min-h-11 rounded-lg border border-transparent bg-tinta/10 px-2 text-sm text-tinta-2 line-through cursor-not-allowed';
  if (estado.turno?.id === t.id) return 'min-h-11 rounded-lg border-2 border-sol bg-sol px-2 text-sm font-bold text-tinta';
  return 'min-h-11 rounded-lg border border-baya bg-white px-2 text-sm font-bold text-baya hover:bg-baya/10';
}

function pintarTurnos(turnos) {
  const lista = $('lista-turnos');
  if (turnos.length === 0) {
    lista.replaceChildren(el('p', { class: 'rounded-lg bg-white p-4 text-tinta-2 shadow-sm' }, 'No hay turnos en estas fechas. Prueba con las siguientes.'));
    return;
  }
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
          delDia.map((t) =>
            el(
              'button',
              {
                type: 'button',
                class: claseTurno(t),
                disabled: !t.disponible,
                'aria-pressed': t.disponible ? String(estado.turno?.id === t.id) : false,
                'aria-label': `${formatearFecha(fecha, 'dia')}, ${t.horaInicio}${t.disponible ? '' : ', ocupado'}`,
                onclick: () => {
                  estado.turno = t;
                  errorCampo('turno', null);
                  pintarTurnos(turnos);
                  $('continuar-2').focus();
                },
              },
              t.horaInicio,
            ),
          ),
        ),
      );
    }),
  );
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
    pintarTurnos(turnos);
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
  const comunes = { id, name: id, 'aria-describedby': `${id}-error`, 'aria-required': p.obligatoria ? 'true' : false };
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
            { class: 'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-tinta/30 bg-white px-4 has-[:checked]:border-baya has-[:checked]:font-bold' },
            el('input', { type: 'radio', name: id, value: v, class: 'h-5 w-5 accent-baya' }),
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
  $('resumen').replaceChildren(...filas.flatMap(([k, v]) => [el('dt', { class: 'text-tinta-2' }, k), el('dd', { class: 'font-bold break-words' }, v)]));
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
irAPaso(1, { enfocar: false });
cargarServicios();
