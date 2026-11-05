// Validación en el navegador con las mismas expresiones ER-01 a ER-04 del
// servidor (src/common/validadores.js). Solo da retroalimentación inmediata:
// el servidor vuelve a validar siempre.

export const reglas = {
  cedula: {
    normalizar: (v) => v.trim().toUpperCase(),
    er: /^\d{3}-\d{6}-\d{4}[A-Z]$/,
    vacio: 'Ingresa tu cédula.',
    mensaje: 'La cédula debe tener el formato 001-150390-0012K.',
  },
  nombres: {
    normalizar: (v) => v.trim().replace(/\s+/g, ' '),
    er: /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,80}$/,
    vacio: 'Ingresa tus nombres y apellidos.',
    mensaje: 'Usa solo letras y espacios (de 3 a 80 caracteres).',
  },
  telefono: {
    normalizar: (v) => v.trim(),
    er: /^[2578]\d{7}$/,
    vacio: 'Ingresa tu teléfono.',
    mensaje: 'El teléfono debe tener 8 dígitos y empezar con 2, 5, 7 u 8.',
  },
  correo: {
    normalizar: (v) => v.trim(),
    er: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
    vacio: 'Ingresa tu correo.',
    mensaje: 'Escribe un correo válido, por ejemplo nombre@gmail.com.',
    maximo: 100,
  },
};

/** Devuelve { valor, error } para un campo de la paciente. */
export function validarCampo(nombre, bruto) {
  const regla = reglas[nombre];
  const valor = regla.normalizar(bruto);
  if (valor === '') return { valor, error: regla.vacio };
  if (regla.maximo && valor.length > regla.maximo) return { valor, error: `Usa como máximo ${regla.maximo} caracteres.` };
  if (!regla.er.test(valor)) return { valor, error: regla.mensaje };
  return { valor, error: null };
}
