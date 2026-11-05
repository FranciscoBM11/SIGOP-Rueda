// A1 – Iniciar sesión (CU-10). Mensaje genérico ante credenciales inválidas
// (E1) y aviso con el tiempo restante si la cuenta está bloqueada (E2, E3).
import { api, mostrarAviso } from './api.js';

const $ = (id) => document.getElementById(id);
const DESTINO = '/admin/agenda.html';

const MENSAJES_MOTIVO = {
  expirada: 'Tu sesión expiró por inactividad. Inicia sesión de nuevo.',
  salida: 'Cerraste sesión correctamente.',
};

function errorCampo(id, texto) {
  const p = $(`${id}-error`);
  p.textContent = texto ?? '';
  p.hidden = !texto;
  $(id).setAttribute('aria-invalid', texto ? 'true' : 'false');
}

async function redirigirSiYaHaySesion() {
  try {
    await api('/admin/sesion');
    location.replace(DESTINO);
  } catch {
    // Sin sesión: se queda en el formulario.
  }
}

async function enviar(evento) {
  evento.preventDefault();
  mostrarAviso($('aviso'), '');
  $('aviso-info').hidden = true;
  const usuario = $('usuario').value.trim().toLowerCase();
  const contrasena = $('contrasena').value;
  errorCampo('usuario', usuario ? '' : 'Ingresa tu usuario.');
  errorCampo('contrasena', contrasena ? '' : 'Ingresa tu contraseña.');
  if (!usuario || !contrasena) {
    $(usuario ? 'contrasena' : 'usuario').focus();
    return;
  }

  const boton = $('entrar');
  boton.disabled = true;
  boton.textContent = 'Ingresando…';
  try {
    await api('/admin/sesion', { metodo: 'POST', cuerpo: { usuario, contrasena } });
    location.replace(DESTINO);
  } catch (err) {
    if (err.codigo === 'DATOS_INVALIDOS') {
      // El formato del usuario no corresponde: mismo mensaje genérico (E1).
      mostrarAviso($('aviso'), 'Usuario o contraseña incorrectos.');
    } else {
      mostrarAviso($('aviso'), err.message);
    }
    $('contrasena').value = '';
    $('contrasena').focus();
    boton.disabled = false;
    boton.textContent = 'Iniciar sesión';
  }
}

const motivo = new URLSearchParams(location.search).get('motivo');
if (MENSAJES_MOTIVO[motivo]) {
  $('aviso-info').textContent = MENSAJES_MOTIVO[motivo];
  $('aviso-info').hidden = false;
}
$('form-login').addEventListener('submit', enviar);
redirigirSiYaHaySesion();
