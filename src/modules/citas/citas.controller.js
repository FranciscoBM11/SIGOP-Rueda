'use strict';

const { crearCitaSchema, accesoCitaSchema, reprogramarCitaSchema } = require('./citas.schemas');

function crearCitasController({ citasService, accesoPublicoService }) {
  return {
    async agendar(req, res) {
      const datos = crearCitaSchema.parse(req.body ?? {});
      const comprobante = await citasService.agendar(datos);
      res.set('Cache-Control', 'no-store');
      res.status(201).json(comprobante);
    },

    // CU-08
    async acceso(req, res) {
      const { cedula, codigo } = accesoCitaSchema.parse(req.body ?? {});
      const resultado = await accesoPublicoService.validarAccesoCita({ cedula, codigo, ip: req.ip });
      res.set('Cache-Control', 'no-store');
      res.status(200).json(resultado);
    },

    // CU-06 (requiereTokenCita ya dejó req.tokenCita)
    async cancelar(req, res) {
      const resultado = await citasService.cancelar(req.tokenCita.citaId);
      res.set('Cache-Control', 'no-store');
      res.status(200).json(resultado);
    },

    // CU-07
    async reprogramar(req, res) {
      const { turnoId } = reprogramarCitaSchema.parse(req.body ?? {});
      const resultado = await citasService.reprogramar(req.tokenCita.citaId, turnoId);
      res.set('Cache-Control', 'no-store');
      res.status(200).json(resultado);
    },
  };
}

module.exports = { crearCitasController };
