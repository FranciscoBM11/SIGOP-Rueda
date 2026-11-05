'use strict';

// Esquemas de entrada del módulo resultados. z.strictObject rechaza campos no declarados.
const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

// CU-08/CU-09: cédula (ER-01) y código (ER-05), normalizados a mayúsculas.
const consultaResultadosSchema = z.strictObject({
  cedula: esquemas.cedula,
  codigo: esquemas.codigoCita,
});

// GET /resultados/:id/archivo
const informeRutaSchema = z.strictObject({ id: esquemas.id });

// CU-15 paso 1: la cédula va en el cuerpo, nunca en la URL.
const busquedaPacienteSchema = z.strictObject({ cedula: esquemas.cedula });

module.exports = { consultaResultadosSchema, informeRutaSchema, busquedaPacienteSchema };
