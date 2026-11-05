'use strict';

// Expresiones regulares ER-01 a ER-10 (Fase 2, Tabla 34) y piezas de zod
// reutilizables por los esquemas de entrada de todos los módulos.
const { z } = require('zod');

const ER = Object.freeze({
  CEDULA: /^\d{3}-\d{6}-\d{4}[A-Z]$/, // ER-01
  NOMBRES: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,80}$/, // ER-02
  TELEFONO: /^[2578]\d{7}$/, // ER-03
  CORREO: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/, // ER-04
  CODIGO_CITA: /^CR-\d{5}$/, // ER-05
  USUARIO: /^[a-z0-9._]{4,30}$/, // ER-06
  CONTRASENA: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/, // ER-07
  NOMBRE_ARCHIVO: /^[\w. -]{1,96}\.[pP][dD][fF]$/, // ER-08 (la Fase 3 admite además el guion)
  FECHA: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, // ER-09
  HORA: /^([01]\d|2[0-3]):[0-5]\d$/, // ER-10
});

/** ER-09 más la comprobación de que el día exista (p. ej. rechaza 2026-02-30). */
function esFechaValida(texto) {
  if (typeof texto !== 'string' || !ER.FECHA.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

const recortar = (v) => (typeof v === 'string' ? v.trim() : v);

const esquemas = Object.freeze({
  cedula: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.string({ message: 'Ingresa tu cédula.' }).regex(ER.CEDULA, 'La cédula debe tener el formato 001-150390-0012K.'),
  ),
  nombres: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v),
    z.string({ message: 'Ingresa tus nombres y apellidos.' }).regex(ER.NOMBRES, 'Usa solo letras y espacios (de 3 a 80 caracteres).'),
  ),
  telefono: z.preprocess(
    recortar,
    z.string({ message: 'Ingresa tu teléfono.' }).regex(ER.TELEFONO, 'El teléfono debe tener 8 dígitos y empezar con 2, 5, 7 u 8.'),
  ),
  correo: z.preprocess(
    recortar,
    z
      .string({ message: 'Ingresa tu correo.' })
      .max(100, 'El correo no puede superar 100 caracteres.')
      .regex(ER.CORREO, 'Escribe un correo válido, por ejemplo nombre@gmail.com.'),
  ),
  codigoCita: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
    z.string({ message: 'Ingresa el código de la cita.' }).regex(ER.CODIGO_CITA, 'El código tiene el formato CR-12345.'),
  ),
  fecha: z
    .string({ message: 'Indica una fecha.' })
    .refine(esFechaValida, 'La fecha debe tener el formato AAAA-MM-DD y existir en el calendario.'),
  hora: z.string({ message: 'Indica una hora.' }).regex(ER.HORA, 'La hora debe tener el formato HH:MM (24 horas).'),
  id: z.coerce
    .number({ message: 'Debe ser un número.' })
    .int('Debe ser un número entero.')
    .positive('Debe ser un número positivo.')
    .max(2147483647, 'Número fuera de rango.'),
});

module.exports = { ER, esFechaValida, esquemas };
