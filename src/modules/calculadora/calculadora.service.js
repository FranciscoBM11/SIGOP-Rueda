'use strict';

// CalculadoraService (CU-01): Fecha Probable de Parto, semanas de gestación,
// trimestre y estudios sugeridos. El cálculo no guarda ningún dato.
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua, sumarDias, sumarMeses, diferenciaDias } = require('../../common/fechas');

const MAX_DIAS_GESTACION = 294; // 42 semanas (CU-01, paso 4)

/**
 * RN-13 – Regla de Naegele: FUM + 7 días − 3 meses + 1 año
 * (equivale a FUM + 7 días + 9 meses).
 */
function calcularFpp(fum) {
  return sumarMeses(sumarDias(fum, 7), 9);
}

/** Trimestre según semanas cumplidas: 1 (0–13), 2 (14–27), 3 (28 o más). */
function trimestreDe(semanas) {
  if (semanas < 14) return 1;
  if (semanas < 28) return 2;
  return 3;
}

/** Cálculo puro (sin base de datos). Lanza ErrorNegocio si la FUM no es aceptable. */
function calcularGestacion(fum, hoy) {
  const dias = diferenciaDias(fum, hoy);
  if (dias < 0) {
    throw new ErrorNegocio('FUM_FUTURA', 'La fecha de tu última menstruación no puede ser posterior a hoy.', 400, [
      { campo: 'fum', mensaje: 'La fecha no puede ser futura.' },
    ]);
  }
  if (dias > MAX_DIAS_GESTACION) {
    throw new ErrorNegocio(
      'FUM_FUERA_DE_RANGO',
      'La fecha indicada supera la duración de un embarazo (42 semanas). Verifícala o consulta en la clínica.',
      400,
      [{ campo: 'fum', mensaje: 'La fecha es anterior a 294 días.' }],
    );
  }
  const semanas = Math.floor(dias / 7);
  return { fpp: calcularFpp(fum), semanas, dias: dias % 7, trimestre: trimestreDe(semanas) };
}

function crearCalculadoraService({ estudiosRepo, reloj = ahoraManagua }) {
  return {
    async calcular(fum) {
      const resultado = calcularGestacion(fum, reloj().fecha);
      const estudios = await estudiosRepo.listarPorTrimestre(resultado.trimestre);
      return { ...resultado, estudios: estudios.map((e) => ({ nombre: e.nombre, descripcion: e.descripcion })) };
    },
  };
}

module.exports = { crearCalculadoraService, calcularFpp, calcularGestacion, trimestreDe, MAX_DIAS_GESTACION };
