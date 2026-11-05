'use strict';

// Errores de negocio y manejador global (Fase 3, secciones 2.4 y 2.7).
// Toda respuesta de error tiene la forma { codigo, mensaje, detalles }.
const { ZodError } = require('zod');
const registro = require('./registro');

class ErrorNegocio extends Error {
  /**
   * @param {string} codigo  Código estable en MAYUSCULAS_CON_GUION_BAJO (p. ej. TURNO_OCUPADO).
   * @param {string} mensaje Mensaje claro para la persona usuaria.
   * @param {number} http    Código HTTP de la respuesta.
   * @param {Array}  detalles Información adicional sin datos personales.
   */
  constructor(codigo, mensaje, http = 400, detalles = []) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigo = codigo;
    this.http = http;
    this.detalles = detalles;
  }
}

const MENSAJE_INTERNO = 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.';

function convertirError(err) {
  if (err instanceof ErrorNegocio) {
    return { http: err.http, codigo: err.codigo, mensaje: err.message, detalles: err.detalles };
  }
  if (err instanceof ZodError) {
    return {
      http: 400,
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'Revisa los datos ingresados.',
      detalles: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    };
  }
  // Errores del lector de JSON de Express (body-parser).
  if (err && err.type === 'entity.parse.failed') {
    return { http: 400, codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es un JSON válido.', detalles: [] };
  }
  if (err && err.type === 'entity.too.large') {
    return { http: 413, codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'La petición es demasiado grande.', detalles: [] };
  }
  return { http: 500, codigo: 'ERROR_INTERNO', mensaje: MENSAJE_INTERNO, detalles: [] };
}

/** 404 en JSON para rutas de la API que no existen. */
function rutaNoEncontrada(req, res, next) {
  next(new ErrorNegocio('RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.', 404));
}

/** Middleware global: debe registrarse al final de app.js. */
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
  const respuesta = convertirError(err);
  if (respuesta.http >= 500) {
    registro.error('error_peticion', {
      idPeticion: req.idPeticion,
      metodo: req.method,
      ruta: req.originalUrl.split('?')[0],
      codigo: respuesta.codigo,
      error: registro.resumirError(err),
    });
  }
  if (res.headersSent) return next(err);
  res.status(respuesta.http).json({
    codigo: respuesta.codigo,
    mensaje: respuesta.mensaje,
    detalles: respuesta.detalles,
  });
}

module.exports = { ErrorNegocio, rutaNoEncontrada, manejadorErrores, convertirError };
