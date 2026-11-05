// Utilidades compartidas por las páginas del panel administrativo.
// La sesión vive en una cookie HttpOnly: JavaScript no la ve; solo pregunta a
// GET /admin/sesion quién está conectado. Si la sesión venció (401) se vuelve
// al inicio de sesión (CU-10 A2, CU-11 E2).
import { api } from './api.js';

export const ROL_TEXTO = { MEDICO: 'Médica', RECEPCIONISTA: 'Recepción' };

const RUTA_LOGIN = '/admin/login.html';

/** Lleva al inicio de sesión. motivo: 'expirada' | 'salida'. */
export function irAlLogin(motivo) {
  location.replace(motivo ? `${RUTA_LOGIN}?motivo=${motivo}` : RUTA_LOGIN);
}

/** Si el error es de sesión (401), redirige y devuelve true. */
export function manejarErrorSesion(err) {
  if (err?.status === 401) {
    irAlLogin('expirada');
    return true;
  }
  return false;
}

/**
 * Comprueba la sesión, completa el nombre y el rol en el menú, muestra solo
 * los enlaces del rol ([data-solo-rol]) y conecta el botón «Menú» (móvil) y
 * «Cerrar sesión». Devuelve { nombre, rol }.
 * Con `rol`, la página es solo para ese rol: a los demás se les explica y se
 * les ofrece volver a la agenda (la API también lo impide con 403).
 */
export async function iniciarPanel({ rol } = {}) {
  let sesion;
  try {
    sesion = await api('/admin/sesion');
  } catch (err) {
    if (!manejarErrorSesion(err)) {
      document.getElementById('contenido').replaceChildren(
        Object.assign(document.createElement('p'), {
          className: 'rounded-lg border border-error bg-white p-4 text-error',
          textContent: err.message,
        }),
      );
      document.body.hidden = false;
    }
    throw err;
  }

  for (const nodo of document.querySelectorAll('[data-usuario-nombre]')) nodo.textContent = sesion.nombre;
  for (const nodo of document.querySelectorAll('[data-usuario-rol]')) nodo.textContent = ROL_TEXTO[sesion.rol] ?? sesion.rol;
  for (const enlace of document.querySelectorAll('[data-solo-rol]')) enlace.hidden = enlace.dataset.soloRol !== sesion.rol;

  const boton = document.getElementById('abrir-menu');
  const menu = document.getElementById('menu-panel');
  boton?.addEventListener('click', () => {
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    boton.setAttribute('aria-expanded', String(!abierto));
    menu.classList.toggle('hidden', abierto);
  });

  for (const salir of document.querySelectorAll('[data-cerrar-sesion]')) {
    salir.addEventListener('click', async () => {
      salir.disabled = true;
      try {
        await api('/admin/sesion', { metodo: 'DELETE' });
      } catch {
        // Aunque falle la red, se vuelve al inicio de sesión.
      }
      irAlLogin('salida');
    });
  }

  document.body.hidden = false;

  if (rol && sesion.rol !== rol) {
    const aviso = document.createElement('div');
    aviso.className = 'rounded-lg border border-tinta/10 bg-white p-5 shadow-sm';
    const texto = document.createElement('p');
    texto.className = 'font-bold';
    texto.textContent = `Esta sección es solo para ${rol === 'MEDICO' ? 'la médica' : 'recepción'}.`;
    const volver = Object.assign(document.createElement('a'), {
      href: '/admin/agenda.html',
      className: 'mt-3 inline-flex min-h-11 items-center font-bold text-baya underline',
      textContent: '← Volver a la agenda',
    });
    aviso.append(texto, volver);
    document.getElementById('contenido').replaceChildren(aviso);
    throw new Error('ROL_NO_AUTORIZADO');
  }
  return sesion;
}
