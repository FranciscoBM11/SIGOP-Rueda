'use strict';

// Rutas del panel para informes (CU-15), solo recepción (Fase 3, Tabla 58):
//   POST /admin/pacientes/busqueda        { cedula } → { paciente, citas[] }
//   POST /admin/citas/:codigo/informes    multipart, campo «archivo» → 201 { informe }
// La sesión y el rol se comprueban ANTES de leer el archivo, para no recibir
// archivos de quien no puede subirlos.
const { Router } = require('express');
const multer = require('multer');
const { ErrorNegocio } = require('../../common/errores');
const { requiereSesion, requiereRol } = require('../../common/middlewares/sesion');
const { codigoRutaSchema } = require('../citas/citas.schemas');
const { busquedaPacienteSchema } = require('./resultados.schemas');
const { MAX_BYTES } = require('./validar-pdf');

const CAMPO_ARCHIVO = 'archivo';

// multer en memoria (Fase 3, Tabla 56): el PDF nunca toca el disco sin cifrar.
const recibirPdf = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // los navegadores envían el nombre en UTF-8 («ecografía.pdf»)
  limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1 },
}).single(CAMPO_ARCHIVO);

function errorArchivoRequerido() {
  return new ErrorNegocio('ARCHIVO_REQUERIDO', 'Elige el archivo PDF del informe.', 400);
}

/** Convierte los errores de multer al formato de la API. */
function recibirArchivo(req, res, next) {
  recibirPdf(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErrorNegocio('ARCHIVO_DEMASIADO_GRANDE', 'El archivo supera el límite de 10 MB.', 422));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
        return next(new ErrorNegocio('ARCHIVO_INVALIDO', 'Envía un solo archivo PDF en el campo «archivo».', 400));
      }
      return next(new ErrorNegocio('ARCHIVO_INVALIDO', 'La carga del archivo no es válida. Intenta de nuevo.', 400));
    }
    // Cuerpo multipart mal formado (busboy).
    return next(new ErrorNegocio('ARCHIVO_INVALIDO', 'La carga del archivo no es válida. Intenta de nuevo.', 400));
  });
}

function crearInformesAdminRoutes({ authService, informesService }) {
  const sesion = requiereSesion(authService);
  const recepcion = requiereRol('RECEPCIONISTA');
  const router = Router();

  router.post('/admin/pacientes/busqueda', sesion, recepcion, async (req, res) => {
    const { cedula } = busquedaPacienteSchema.parse(req.body ?? {});
    res.status(200).json(await informesService.buscarPaciente(cedula));
  });

  router.post('/admin/citas/:codigo/informes', sesion, recepcion, recibirArchivo, async (req, res) => {
    const { codigo } = codigoRutaSchema.parse(req.params);
    if (!req.file) throw errorArchivoRequerido();
    const informe = await informesService.subir(
      codigo,
      { nombreOriginal: req.file.originalname, tipo: req.file.mimetype, contenido: req.file.buffer },
      req.sesion,
    );
    res.status(201).json({ informe });
  });

  return router;
}

module.exports = { crearInformesAdminRoutes, CAMPO_ARCHIVO };
