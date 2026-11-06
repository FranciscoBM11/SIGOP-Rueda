// A4 – Subir informe de resultados (CU-15), solo recepción.
// 1) busca a la paciente por cédula (la cédula va en el cuerpo, no en la URL);
// 2) elige la cita y el PDF; 3) lo sube como multipart. El servidor vuelve a
// validar todo (tipo, tamaño y contenido real del PDF) y lo guarda cifrado.
import { api, el, formatearFecha, formatearTamano, mostrarAviso } from './api.js';
import { iniciarPanel, manejarErrorSesion } from './admin-comun.js';
import { validarCampo } from './validacion.js';

const $ = (id) => document.getElementById(id);

const MAX_BYTES = 10 * 1024 * 1024;
const ESTADO_TEXTO = {
  CONFIRMADA: 'Confirmada',
  EN_ESPERA: 'En espera',
  ATENDIDA: 'Atendida',
  NO_ASISTIO: 'No asistió',
  CANCELADA: 'Cancelada',
};

const estado = { paciente: null, citas: [], archivo: null };

function errorCampo(id, texto) {
  const p = $(`${id}-error`);
  p.textContent = texto ?? '';
  p.hidden = !texto;
  $(id)?.setAttribute('aria-invalid', texto ? 'true' : 'false');
}

function limpiarAvisos() {
  mostrarAviso($('aviso'), '');
  $('aviso-ok').hidden = true;
}

function mostrarExito(texto) {
  mostrarAviso($('aviso'), '');
  const ok = $('aviso-ok');
  ok.textContent = texto;
  ok.hidden = false;
}

function manejarError(err, contenedor = $('aviso')) {
  if (manejarErrorSesion(err)) return;
  mostrarAviso(contenedor, err.message);
}

// ---------------------------------------------------------------------------
// Pasos 1-2: búsqueda
// ---------------------------------------------------------------------------
function textoCita(c) {
  const dia = formatearFecha(c.fecha, 'larga');
  const informes = c.informes === 0 ? 'sin informes' : c.informes === 1 ? '1 informe' : `${c.informes} informes`;
  return { dia, informes };
}

function pintarCitas() {
  $('titulo-citas').textContent = `${estado.paciente.nombres}: elige la cita`;
  const lista = $('lista-citas');
  lista.replaceChildren(
    ...estado.citas.map((c, i) => {
      const { dia, informes } = textoCita(c);
      const id = `cita-${i}`;
      return el(
        'label',
        {
          for: id,
          class: `flex min-h-11 gap-3 rounded-lg border-2 p-4 ${
            c.admiteInforme
              ? 'cursor-pointer border-tinta/10 bg-white has-[:checked]:border-primario has-[:checked]:bg-primario/5'
              : 'border-dashed border-tinta/15 bg-bruma/50 text-tinta-2'
          }`,
        },
        el('input', {
          type: 'radio',
          id,
          name: 'cita',
          value: c.codigo,
          autocomplete: 'off',
          disabled: !c.admiteInforme,
          'aria-describedby': `${id}-detalle`,
          class: 'mt-1 h-5 w-5 shrink-0 accent-primario',
        }),
        el(
          'span',
          { class: 'min-w-0' },
          el('span', { class: 'block' }, el('strong', {}, c.servicio), `, ${dia}, ${c.codigo}`),
          el(
            'span',
            { id: `${id}-detalle`, class: 'block text-sm text-tinta-2' },
            `${ESTADO_TEXTO[c.estado] ?? c.estado} · ${informes}`,
            c.motivo ? ` · ${c.motivo}` : null,
          ),
        ),
      );
    }),
  );
  // Si solo hay una cita que admite informe, se elige sola.
  const habilitadas = lista.querySelectorAll('input:not([disabled])');
  if (habilitadas.length === 1) habilitadas[0].checked = true;
}

async function buscar(cedula, { conservarAvisos = false } = {}) {
  const r = await api('/admin/pacientes/busqueda', { metodo: 'POST', cuerpo: { cedula } });
  estado.paciente = r.paciente;
  estado.citas = r.citas;
  if (!conservarAvisos) limpiarAvisos();
  pintarCitas();
  $('form-informe').hidden = false;
}

$('form-busqueda').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarAvisos();
  const cedula = validarCampo('cedula', $('cedula').value);
  if (cedula.valor === '') cedula.error = 'Ingresa la cédula de la paciente.';
  errorCampo('cedula', cedula.error);
  if (cedula.error) {
    $('cedula').focus();
    return;
  }
  $('cedula').value = cedula.valor;
  const boton = $('buscar');
  boton.disabled = true;
  boton.textContent = 'Buscando…';
  $('form-informe').hidden = true;
  quitarArchivo();
  try {
    await buscar(cedula.valor);
    $('titulo-citas').focus();
  } catch (err) {
    if (err.codigo === 'DATOS_INVALIDOS') {
      for (const d of err.detalles) if (d.campo === 'cedula') errorCampo('cedula', d.mensaje);
    }
    manejarError(err);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Buscar';
  }
});

// ---------------------------------------------------------------------------
// Paso 3: archivo (elegido o arrastrado). Revisión rápida en el navegador;
// la validación que cuenta es la del servidor.
// ---------------------------------------------------------------------------
function revisarArchivo(archivo) {
  if (!/\.pdf$/i.test(archivo.name)) return 'Solo se aceptan archivos PDF (.pdf).';
  if (archivo.size === 0) return 'El archivo está vacío.';
  if (archivo.size > MAX_BYTES) return 'El archivo supera el límite de 10 MB.';
  return null;
}

function elegirArchivo(archivo) {
  errorCampo('archivo', null);
  const problema = revisarArchivo(archivo);
  if (problema) {
    quitarArchivo();
    errorCampo('archivo', problema);
    return;
  }
  estado.archivo = archivo;
  $('archivo-nombre').textContent = archivo.name;
  $('archivo-tamano').textContent = `${formatearTamano(archivo.size)}, listo para subir`;
  $('archivo-elegido').hidden = false;
}

function quitarArchivo() {
  estado.archivo = null;
  $('archivo').value = '';
  $('archivo-elegido').hidden = true;
}

$('archivo').addEventListener('change', () => {
  const [archivo] = $('archivo').files;
  if (archivo) elegirArchivo(archivo);
});

$('quitar-archivo').addEventListener('click', () => {
  quitarArchivo();
  $('archivo').focus();
});

const zona = $('zona-archivo');
const RESALTE = ['border-primario', 'bg-primario/5'];
zona.addEventListener('dragover', (e) => {
  e.preventDefault();
  zona.classList.add(...RESALTE);
});
zona.addEventListener('dragleave', () => zona.classList.remove(...RESALTE));
zona.addEventListener('drop', (e) => {
  e.preventDefault();
  zona.classList.remove(...RESALTE);
  const archivos = e.dataTransfer?.files ?? [];
  if (archivos.length > 1) {
    errorCampo('archivo', 'Arrastra un solo archivo a la vez.');
    return;
  }
  if (archivos[0]) elegirArchivo(archivos[0]);
});

// A2: cancelar sin subir.
$('cancelar').addEventListener('click', () => {
  quitarArchivo();
  limpiarAvisos();
  errorCampo('cita', null);
  errorCampo('archivo', null);
  $('form-informe').hidden = true;
  $('cedula').value = '';
  $('cedula').focus();
});

// ---------------------------------------------------------------------------
// Pasos 4-6: subir
// ---------------------------------------------------------------------------
$('form-informe').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarAvisos();
  const elegida = document.querySelector('input[name="cita"]:checked');
  errorCampo('cita', elegida ? null : 'Elige la cita a la que pertenece el informe.');
  errorCampo('archivo', estado.archivo ? null : 'Elige el archivo PDF del informe.');
  if (!elegida || !estado.archivo) {
    (elegida ? $('archivo') : $('lista-citas').querySelector('input:not([disabled])') ?? $('cedula')).focus();
    return;
  }

  const formulario = new FormData();
  formulario.append('archivo', estado.archivo, estado.archivo.name);

  const boton = $('subir');
  boton.disabled = true;
  boton.textContent = 'Subiendo…';
  try {
    const { informe } = await api(`/admin/citas/${encodeURIComponent(elegida.value)}/informes`, {
      metodo: 'POST',
      cuerpo: formulario,
    });
    quitarArchivo();
    // A1: puede subir otro informe para la misma cita; se refresca el conteo.
    await buscar(estado.paciente.cedula, { conservarAvisos: true }).catch(() => {});
    const radio = document.querySelector(`input[name="cita"][value="${informe.cita}"]`);
    if (radio && !radio.disabled) radio.checked = true;
    mostrarExito(`Informe «${informe.nombre}» (${formatearTamano(informe.tamanoBytes)}) subido a la cita ${informe.cita}. Ya está disponible para la paciente.`);
  } catch (err) {
    if (['ARCHIVO_NO_PDF', 'ARCHIVO_VACIO', 'ARCHIVO_DEMASIADO_GRANDE', 'ARCHIVO_DANADO', 'ARCHIVO_REQUERIDO', 'ARCHIVO_INVALIDO'].includes(err.codigo)) {
      if (manejarErrorSesion(err)) return;
      errorCampo('archivo', err.message);
      $('archivo-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      manejarError(err);
    }
  } finally {
    boton.disabled = false;
    boton.textContent = 'Subir informe';
  }
});

iniciarPanel({ rol: 'RECEPCIONISTA' })
  .then(() => $('cedula').focus())
  .catch(() => {});
