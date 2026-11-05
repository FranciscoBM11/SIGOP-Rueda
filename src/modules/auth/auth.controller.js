'use strict';

const { iniciarSesionSchema } = require('./auth.schemas');
const { leerCookie, guardarCookieSesion, borrarCookieSesion } = require('../../common/middlewares/sesion');
const { DURACION_MAXIMA_SEGUNDOS } = require('./token-sesion');

function crearAuthController({ authService }) {
  return {
    // CU-10: POST /admin/sesion
    async iniciar(req, res) {
      const { usuario, contrasena } = iniciarSesionSchema.parse(req.body ?? {});
      const { token, nombre, rol } = await authService.iniciarSesion({ usuario, contrasena, ip: req.ip });
      guardarCookieSesion(res, token, DURACION_MAXIMA_SEGUNDOS);
      res.set('Cache-Control', 'no-store');
      res.status(200).json({ nombre, rol });
    },

    // GET /admin/sesion (requiereSesion ya dejó req.sesion)
    actual(req, res) {
      res.status(200).json({ nombre: req.sesion.nombre, rol: req.sesion.rol });
    },

    // CU-10 A1: DELETE /admin/sesion. Siempre borra la cookie.
    async cerrar(req, res) {
      const token = leerCookie(req);
      if (token) await authService.cerrarSesion(token);
      borrarCookieSesion(res);
      res.set('Cache-Control', 'no-store');
      res.status(204).end();
    },
  };
}

module.exports = { crearAuthController };
