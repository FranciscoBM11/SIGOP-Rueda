'use strict';

// Middlewares de la sesión del personal (Fase 3, sección 4.6):
//   requiereSesion: verifica la cookie, renueva la inactividad y deja
//                   req.sesion = { sesionId, usuarioId, nombre, rol }.
//   requiereRol:    autorización por rol (RN-11, RN-16).
// La cookie es HttpOnly, SameSite=Strict y Secure en producción; solo viaja a
// /api/v1/admin. SameSite=Strict impide que otro sitio la envíe (CSRF).
const { ErrorNegocio } = require('../errores');

const NOMBRE_COOKIE = 'sigop_sesion';
const RUTA_COOKIE = '/api/v1/admin';

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: RUTA_COOKIE,
  };
}

/** Lee una cookie de la cabecera sin dependencias extra. */
function leerCookie(req, nombre = NOMBRE_COOKIE) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nombre) {
      const valor = parte.slice(i + 1).trim();
      return valor === '' ? null : valor;
    }
  }
  return null;
}

function guardarCookieSesion(res, token, maxAgeSegundos) {
  res.cookie(NOMBRE_COOKIE, token, { ...opcionesCookie(), maxAge: maxAgeSegundos * 1000 });
}

function borrarCookieSesion(res) {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie());
}

/** @param {{ verificarSesion(token: string): Promise<object> }} authService */
function requiereSesion(authService) {
  return async (req, res, next) => {
    // Respuestas del panel: nunca en caché del navegador ni de un proxy.
    res.set('Cache-Control', 'no-store');
    const token = leerCookie(req);
    if (!token) {
      return next(new ErrorNegocio('SESION_REQUERIDA', 'Inicia sesión para continuar.', 401));
    }
    try {
      req.sesion = await authService.verificarSesion(token);
      return next();
    } catch (err) {
      if (err instanceof ErrorNegocio && err.codigo === 'SESION_EXPIRADA') borrarCookieSesion(res);
      return next(err);
    }
  };
}

/** Debe ir después de requiereSesion. */
function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.sesion || !roles.includes(req.sesion.rol)) {
      return next(new ErrorNegocio('ROL_NO_AUTORIZADO', 'Tu usuario no tiene permiso para esta acción.', 403));
    }
    return next();
  };
}

module.exports = {
  NOMBRE_COOKIE,
  RUTA_COOKIE,
  leerCookie,
  guardarCookieSesion,
  borrarCookieSesion,
  requiereSesion,
  requiereRol,
};
