// Cliente de la API /api/v1 y utilidades de interfaz compartidas por las páginas.
// La CSP no permite scripts ni estilos en línea: todo el DOM se construye aquí
// con textContent (nunca innerHTML con datos), lo que además evita XSS.

export class ErrorApi extends Error {
  constructor(status, { codigo, mensaje, detalles }) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = Array.isArray(detalles) ? detalles : [];
  }
}

/**
 * Llama a la API. Devuelve el JSON de la respuesta o lanza ErrorApi con el
 * formato estándar { codigo, mensaje, detalles }.
 * `token`: token de cita (CU-08); se envía como 'Authorization: Bearer'.
 */
export async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const headers = {};
  // FormData (subida de archivos): el navegador pone el Content-Type multipart.
  const esFormulario = typeof FormData !== 'undefined' && cuerpo instanceof FormData;
  if (cuerpo !== undefined && !esFormulario) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api/v1${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo === undefined ? undefined : esFormulario ? cuerpo : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, {
      codigo: 'SIN_CONEXION',
      mensaje: 'No se pudo conectar. Revisa tu conexión a internet e intenta de nuevo.',
    });
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErrorApi(
      res.status,
      datos ?? { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.' },
    );
  }
  return datos;
}

/**
 * Descarga un archivo protegido (p. ej. un informe PDF). El token va en la
 * cabecera Authorization, nunca en la URL, por eso no basta con un enlace.
 */
export async function descargarArchivo(ruta, { token, nombre = 'archivo.pdf' } = {}) {
  let res;
  try {
    res = await fetch(`/api/v1${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ErrorApi(0, {
      codigo: 'SIN_CONEXION',
      mensaje: 'No se pudo conectar. Revisa tu conexión a internet e intenta de nuevo.',
    });
  }
  if (!res.ok) {
    const datos = await res.json().catch(() => null);
    throw new ErrorApi(
      res.status,
      datos ?? { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.' },
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** '1258291' → '1.2 MB'; '48000' → '47 KB'. */
export function formatearTamano(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Crea un elemento: el('p', { class: 'x' }, 'texto', otroNodo). */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    if (clave.startsWith('on')) nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

// ---- Fechas (America/Managua) ---------------------------------------------
const ZONA = 'America/Managua';

/** Fecha de hoy en Managua, 'AAAA-MM-DD'. */
export function hoyManagua() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

const formatos = {
  larga: new Intl.DateTimeFormat('es-NI', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dia: new Intl.DateTimeFormat('es-NI', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }),
  corta: new Intl.DateTimeFormat('es-NI', { timeZone: 'UTC', day: 'numeric', month: 'short' }),
};

/** '2026-11-09' → 'lunes, 9 de noviembre de 2026' (estilo: larga | dia | corta). */
export function formatearFecha(iso, estilo = 'larga') {
  const [a, m, d] = iso.split('-').map(Number);
  const texto = formatos[estilo].format(new Date(Date.UTC(a, m - 1, d)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ---- Mensajes ---------------------------------------------------------------

/** Muestra (o limpia, con texto vacío) un aviso en un contenedor role="alert". */
export function mostrarAviso(contenedor, texto) {
  contenedor.textContent = texto ?? '';
  contenedor.hidden = !texto;
  if (texto) contenedor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
