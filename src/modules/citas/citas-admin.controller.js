'use strict';

// Controlador del panel (CU-11, CU-12, CU-13). requiereSesion ya dejó
// req.sesion = { sesionId, usuarioId, nombre, rol }.
const { ahoraManagua } = require('../../common/fechas');
const { agendaSchema, codigoRutaSchema, cambiarEstadoSchema, reprogramarCitaSchema } = require('./citas.schemas');

function crearCitasAdminController({ citasService, reloj = ahoraManagua }) {
  return {
    // CU-11
    async agenda(req, res) {
      const { fecha } = agendaSchema.parse(req.query ?? {});
      const citas = await citasService.agenda(fecha ?? reloj().fecha, req.sesion.rol);
      res.status(200).json(citas);
    },

    // CU-12 paso 2
    async transiciones(req, res) {
      const { codigo } = codigoRutaSchema.parse(req.params);
      res.status(200).json(await citasService.transiciones(codigo, req.sesion.rol));
    },

    // CU-12
    async cambiarEstado(req, res) {
      const { codigo } = codigoRutaSchema.parse(req.params);
      const { estado } = cambiarEstadoSchema.parse(req.body ?? {});
      res.status(200).json(await citasService.cambiarEstado(codigo, estado, req.sesion));
    },

    // CU-13 (solo recepción)
    async cancelar(req, res) {
      const { codigo } = codigoRutaSchema.parse(req.params);
      res.status(200).json(await citasService.cancelarPorPersonal(codigo, req.sesion));
    },

    // CU-13 (solo recepción)
    async reprogramar(req, res) {
      const { codigo } = codigoRutaSchema.parse(req.params);
      const { turnoId } = reprogramarCitaSchema.parse(req.body ?? {});
      res.status(200).json(await citasService.reprogramarPorPersonal(codigo, turnoId, req.sesion));
    },
  };
}

module.exports = { crearCitasAdminController };
