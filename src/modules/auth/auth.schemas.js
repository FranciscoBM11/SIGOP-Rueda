'use strict';

const { z } = require('zod');
const { ER } = require('../../common/validadores');

// CU-10. El usuario sigue ER-06 (se normaliza a minúsculas). A la contraseña
// no se le aplica ER-07 al iniciar sesión: solo se limita el largo
// (bcrypt usa como máximo 72 bytes).
const iniciarSesionSchema = z.strictObject({
  usuario: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
    z.string({ message: 'Ingresa tu usuario.' }).regex(ER.USUARIO, 'Revisa el usuario: de 4 a 30 letras minúsculas, dígitos, punto o guion bajo.'),
  ),
  contrasena: z
    .string({ message: 'Ingresa tu contraseña.' })
    .min(1, 'Ingresa tu contraseña.')
    .max(64, 'La contraseña tiene como máximo 64 caracteres.'),
});

module.exports = { iniciarSesionSchema };
