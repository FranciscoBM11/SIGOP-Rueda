'use strict';

// Middleware tokenCita (Fase 3, sección 4.6): exige 'Authorization: Bearer <token>'
// emitido por POST /citas/acceso y comprueba que corresponda a la cita de la
// ruta (:codigo). Deja en req.tokenCita = { citaId, codigo }.
const { ErrorNegocio } = require('../errores');

const PATRON_BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/** @param {{ verificar(token: string): { citaId: number, codigo: string } }} tokenCita */
function requiereTokenCita(tokenCita) {
  return (req, res, next) => {
    const cabecera = req.get('authorization') ?? '';
    const coincidencia = PATRON_BEARER.exec(cabecera);
    if (!coincidencia) {
      return next(
        new ErrorNegocio('TOKEN_REQUERIDO', 'Primero ingresa tu cédula y el código de tu cita.', 401),
      );
    }
    let datos;
    try {
      datos = tokenCita.verificar(coincidencia[1]);
    } catch (err) {
      return next(err);
    }
    const codigoRuta = String(req.params.codigo ?? '').trim().toUpperCase();
    if (codigoRuta !== datos.codigo) {
      return next(new ErrorNegocio('TOKEN_NO_CORRESPONDE', 'Tu acceso no corresponde a esta cita.', 403));
    }
    req.tokenCita = datos;
    return next();
  };
}

module.exports = { requiereTokenCita };
