'use strict';

// Esquemas de entrada (DTO) del módulo citas. z.strictObject rechaza campos no declarados.
const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

/** Versión de la política de privacidad vigente (public/privacidad.html). */
const VERSION_CONSENTIMIENTO = 'v1.0';

const crearCitaSchema = z.strictObject({
  servicioId: esquemas.id,
  turnoId: esquemas.id,
  paciente: z.strictObject(
    {
      cedula: esquemas.cedula,
      nombres: esquemas.nombres,
      telefono: esquemas.telefono,
      correo: esquemas.correo,
    },
    { message: 'Faltan los datos de la paciente.' },
  ),
  // RN-05: sin consentimiento aceptado no se guarda ningún dato.
  consentimiento: z.literal(true, { message: 'Debes aceptar el consentimiento informado para agendar.' }),
  respuestas: z
    .array(
      z.strictObject({
        preguntaId: esquemas.id,
        valor: z.string({ message: 'La respuesta debe ser texto.' }).max(500, 'Usa como máximo 500 caracteres.'),
      }),
    )
    .max(50, 'Demasiadas respuestas.')
    .default([]),
});

// CU-08: cédula (ER-01) y código (ER-05), normalizados a mayúsculas.
const accesoCitaSchema = z.strictObject({
  cedula: esquemas.cedula,
  codigo: esquemas.codigoCita,
});

// CU-07: solo el turno nuevo; el servicio y el código no cambian.
const reprogramarCitaSchema = z.strictObject({
  turnoId: esquemas.id,
});

// ---- Panel del personal ------------------------------------------------------

// :codigo de las rutas /admin/citas/:codigo (ER-05).
const codigoRutaSchema = z.strictObject({ codigo: esquemas.codigoCita });

// CU-11: GET /admin/citas/agenda?fecha=AAAA-MM-DD (por defecto, hoy en Managua).
const agendaSchema = z.strictObject({ fecha: esquemas.fecha.optional() });

// CU-12: estado al que se lleva la cita. Confirmada no es destino de un cambio
// del personal (reprogramar la mantiene Confirmada, RN-06).
const cambiarEstadoSchema = z.strictObject({
  estado: z.enum(['EN_ESPERA', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA'], {
    message: 'El estado debe ser EN_ESPERA, ATENDIDA, NO_ASISTIO o CANCELADA.',
  }),
});

module.exports = {
  crearCitaSchema,
  accesoCitaSchema,
  reprogramarCitaSchema,
  codigoRutaSchema,
  agendaSchema,
  cambiarEstadoSchema,
  VERSION_CONSENTIMIENTO,
};
