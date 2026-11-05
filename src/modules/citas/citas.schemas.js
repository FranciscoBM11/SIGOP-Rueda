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

module.exports = { crearCitaSchema, VERSION_CONSENTIMIENTO };
