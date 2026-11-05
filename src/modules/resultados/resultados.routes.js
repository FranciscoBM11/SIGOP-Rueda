'use strict';

// Rutas públicas de resultados (P5), con límite de 20 peticiones/min por IP:
//   POST /resultados/consulta     CU-08, CU-09 (pública, límite de intentos por cédula)
//   GET  /resultados/:id/archivo  CU-09 (token de cita)
const { Router } = require('express');
const { limitePeticiones } = require('../../common/middlewares/limite-peticiones');
const { requiereTokenCita } = require('../../common/middlewares/token-cita');
const { consultaResultadosSchema, informeRutaSchema } = require('./resultados.schemas');

function crearResultadosRoutes({ informesService, tokenCita }) {
  const router = Router();

  router.post('/resultados/consulta', limitePeticiones(), async (req, res) => {
    const { cedula, codigo } = consultaResultadosSchema.parse(req.body ?? {});
    const resultado = await informesService.consultar({ cedula, codigo, ip: req.ip });
    res.set('Cache-Control', 'no-store');
    res.status(200).json(resultado);
  });

  // El token va en la cabecera Authorization, nunca en la URL; por eso la
  // página descarga el archivo con fetch y no con un enlace directo.
  router.get(
    '/resultados/:id/archivo',
    limitePeticiones(),
    requiereTokenCita(tokenCita, { porCodigo: false }),
    async (req, res) => {
      const { id } = informeRutaSchema.parse(req.params);
      const { nombre, contenido } = await informesService.descargar(id, req.tokenCita.citaId);
      res.set({
        'Content-Type': 'application/pdf',
        // El nombre ya cumple ER-08 (solo ASCII, sin comillas ni rutas).
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Content-Length': String(contenido.length),
        'Cache-Control': 'no-store',
      });
      res.status(200).end(contenido);
    },
  );

  return router;
}

module.exports = { crearResultadosRoutes };
