// P5 – Resultados: acceso con cédula y código (CU-08) y descarga de informes
// en PDF (CU-09). El token de cita vive solo en memoria de la página: nunca en
// la URL ni en el almacenamiento del navegador. Al recargar hay que volver a
// ingresar los datos (importante en dispositivos compartidos).
import { api, descargarArchivo, el, formatearFecha, formatearTamano, mostrarAviso } from './api.js';
import { validarCampo } from './validacion.js';
import {
  aparecerAviso,
  cargando,
  entrarTarjeta,
  escalonar,
  llevarALaVista,
  realzarCampos,
  reiniciarClase,
  sacudir,
  salirConFundido,
} from './movimiento.js';

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
  const panel = $('panel-resultados');
  const terminar = () => {
    if (estado.token) return; // se volvió a consultar durante el fundido: no ocultar lo nuevo
    panel.hidden = true;
    $('lista-informes').replaceChildren();
  };
  if (panel.hidden) terminar();
  else salirConFundido(panel, terminar);
  mostrarAviso($('aviso-acceso'), mensaje ?? '');
  aparecerAviso($('aviso-acceso'));
  $('cedula').focus();
}

function tarjetaInforme(informe) {
  const boton = el('button', { type: 'button', class: 'min-h-11 shrink-0 rounded-lg bg-primario px-4 font-bold text-white hover:bg-tinta-2 disabled:opacity-60' }, 'Descargar');
  boton.addEventListener('click', async () => {
    mostrarAviso($('aviso-resultados'), '');
    boton.disabled = true;
    boton.textContent = 'Descargando…';
    cargando(boton, true);
    try {
      await descargarArchivo(`/resultados/${informe.id}/archivo`, { token: estado.token, nombre: informe.nombre });
      // Confirmación sutil: la tarjeta destella y el botón da un pulso.
      reiniciarClase(boton.closest('li'), 'fila-destello');
      reiniciarClase(boton, 'turno-recien-elegido');
    } catch (err) {
      if (ERRORES_DE_TOKEN.includes(err.codigo)) {
        cerrarResultados(err.message);
        return;
      }
      mostrarAviso($('aviso-resultados'), err.message); // E4 y otros
      aparecerAviso($('aviso-resultados'));
    } finally {
      cargando(boton, false);
      boton.disabled = false;
      boton.textContent = 'Descargar';
    }
  });

  return el(
    'li',
    { class: 'tarjeta-informe flex flex-wrap items-center gap-3 rounded-lg border border-tinta/10 bg-white p-4 sm:flex-nowrap' },
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
  const yaVisible = !$('panel-resultados').hidden;
  $('panel-resultados').hidden = false;
  if (!yaVisible) entrarTarjeta($('panel-resultados'));
  escalonar($('lista-informes'));
  if (informes.length === 0) reiniciarClase($('sin-informes'), 'vacio-entra');
  $('titulo-resultados').focus({ preventScroll: true });
  llevarALaVista($('panel-resultados'));
}

$('form-acceso').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarAviso($('aviso-acceso'), '');
  const cedula = validarCampo('cedula', $('cedula').value);
  const codigo = validarCampo('codigo', $('codigo').value);
  errorCampo('cedula', cedula.error);
  errorCampo('codigo', codigo.error);
  if (cedula.error || codigo.error) {
    sacudir($('form-acceso'));
    $(cedula.error ? 'cedula' : 'codigo').focus();
    return;
  }
  $('cedula').value = cedula.valor;
  $('codigo').value = codigo.valor;

  const boton = $('buscar');
  boton.disabled = true;
  boton.textContent = 'Buscando…';
  cargando(boton, true);
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
    // La MISMA sacudida y el mismo fundido para cualquier error (no revela si la cédula existe).
    mostrarAviso($('aviso-acceso'), err.message);
    sacudir($('form-acceso'));
    aparecerAviso($('aviso-acceso'));
  } finally {
    cargando(boton, false);
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

// Resalte suave al enfocar la cédula y el código.
realzarCampos($('form-acceso'));
