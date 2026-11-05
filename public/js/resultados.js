// P5 – Resultados: acceso con cédula y código (CU-08) y descarga de informes
// en PDF (CU-09). El token de cita vive solo en memoria de la página: nunca en
// la URL ni en el almacenamiento del navegador. Al recargar hay que volver a
// ingresar los datos (importante en dispositivos compartidos).
import { api, descargarArchivo, el, formatearFecha, formatearTamano, mostrarAviso } from './api.js';
import { validarCampo } from './validacion.js';

const $ = (id) => document.getElementById(id);
const ERRORES_DE_TOKEN = ['TOKEN_INVALIDO', 'TOKEN_REQUERIDO'];

const estado = { token: null };

const formatoCarga = new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Managua', day: 'numeric', month: 'long' });

function errorCampo(id, texto) {
  const p = $(`${id}-error`);
  p.textContent = texto ?? '';
  p.hidden = !texto;
  $(id).setAttribute('aria-invalid', texto ? 'true' : 'false');
}

/** Vuelve al formulario (salida voluntaria o token vencido). */
function cerrarResultados(mensaje) {
  estado.token = null;
  $('panel-resultados').hidden = true;
  $('lista-informes').replaceChildren();
  mostrarAviso($('aviso-acceso'), mensaje ?? '');
  $('cedula').focus();
}

function tarjetaInforme(informe) {
  const boton = el('button', { type: 'button', class: 'min-h-11 shrink-0 rounded-lg bg-baya px-4 font-bold text-white hover:bg-baya/90 disabled:opacity-60' }, 'Descargar');
  boton.addEventListener('click', async () => {
    mostrarAviso($('aviso-resultados'), '');
    boton.disabled = true;
    boton.textContent = 'Descargando…';
    try {
      await descargarArchivo(`/resultados/${informe.id}/archivo`, { token: estado.token, nombre: informe.nombre });
    } catch (err) {
      if (ERRORES_DE_TOKEN.includes(err.codigo)) {
        cerrarResultados(err.message);
        return;
      }
      mostrarAviso($('aviso-resultados'), err.message); // E4 y otros
    } finally {
      boton.disabled = false;
      boton.textContent = 'Descargar';
    }
  });

  return el(
    'li',
    { class: 'flex flex-wrap items-center gap-3 rounded-lg border border-tinta/10 p-4 sm:flex-nowrap' },
    el('span', { class: 'flex h-12 w-11 shrink-0 items-center justify-center rounded bg-error text-sm font-bold text-white', 'aria-hidden': 'true' }, 'PDF'),
    el(
      'span',
      { class: 'min-w-0 flex-1' },
      el('span', { class: 'block font-bold break-all' }, informe.nombre),
      el('span', { class: 'block text-sm text-tinta-2' }, `Cargado el ${formatoCarga.format(new Date(informe.fechaCarga))}, ${formatearTamano(informe.tamanoBytes)}`),
    ),
    boton,
  );
}

function pintarResultados({ cita, informes }) {
  $('resultados-cita').textContent = `Cita ${cita.codigo}, ${cita.servicio} del ${formatearFecha(cita.fecha, 'larga').replace(/^\p{L}+, /u, '')}`;
  mostrarAviso($('aviso-resultados'), '');
  $('sin-informes').hidden = informes.length > 0; // E3
  $('lista-informes').replaceChildren(...informes.map(tarjetaInforme));
  $('panel-resultados').hidden = false;
  $('titulo-resultados').focus();
}

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
    const r = await api('/resultados/consulta', { metodo: 'POST', cuerpo: { cedula: cedula.valor, codigo: codigo.valor } });
    estado.token = r.tokenCita;
    pintarResultados(r);
  } catch (err) {
    estado.token = null;
    $('panel-resultados').hidden = true;
    if (err.codigo === 'DATOS_INVALIDOS') {
      for (const d of err.detalles) if (d.campo === 'cedula' || d.campo === 'codigo') errorCampo(d.campo, d.mensaje);
    }
    // ACCESO_DENEGADO (E1), ACCESO_BLOQUEADO (E2), DEMASIADAS_PETICIONES…
    mostrarAviso($('aviso-acceso'), err.message);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ver mis resultados';
  }
});

// A2: terminar sin descargar; también limpia los datos del formulario.
$('salir').addEventListener('click', () => {
  $('cedula').value = '';
  $('codigo').value = '';
  cerrarResultados();
});
