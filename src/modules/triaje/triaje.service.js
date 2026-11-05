'use strict';

// TriajeService (CU-04): valida las respuestas contra el cuestionario del
// servicio (RN-08) y guarda la ficha cifrada con AES-256-GCM (RN-14).
const { ErrorNegocio } = require('../../common/errores');
const { esFechaValida } = require('../../common/validadores');
const { cifrar: cifrarPorDefecto } = require('../../common/cifrado');

const MAX_LARGO = 500;
const NUMERO = /^\d{1,6}([.,]\d{1,2})?$/;

/** Valida y normaliza un valor según el tipo de la pregunta; devuelve el texto a guardar o un error. */
function normalizarValor(pregunta, valor) {
  switch (pregunta.tipo) {
    case 'TEXTO':
      return valor.length <= MAX_LARGO ? { valor } : { error: `Usa como máximo ${MAX_LARGO} caracteres.` };
    case 'SI_NO': {
      const v = valor.toUpperCase().replace('SÍ', 'SI');
      return v === 'SI' || v === 'NO' ? { valor: v } : { error: 'Responde Sí o No.' };
    }
    case 'NUMERO':
      return NUMERO.test(valor) ? { valor: valor.replace(',', '.') } : { error: 'Escribe un número válido.' };
    case 'FECHA':
      return esFechaValida(valor) ? { valor } : { error: 'Escribe una fecha válida (AAAA-MM-DD).' };
    case 'SELECCION': {
      // Se guarda el texto de la opción elegida, no su id (decisión de la Iteración 1).
      const opcion = pregunta.opciones.find((o) => o.etiqueta === valor);
      return opcion ? { valor: opcion.etiqueta } : { error: 'Elige una de las opciones.' };
    }
    default:
      return { error: 'Tipo de pregunta no soportado.' };
  }
}

/**
 * Valida las respuestas de la paciente contra las preguntas activas del servicio.
 * - Toda pregunta obligatoria debe tener respuesta.
 * - Cada valor debe corresponder al tipo de su pregunta.
 * - No se aceptan preguntas de otro servicio ni repetidas.
 * Las preguntas opcionales sin respuesta se omiten (RN-08).
 * @returns {{ preguntaId: number, valor: string }[]}
 */
function validarRespuestas(preguntas, respuestas = []) {
  const porId = new Map(preguntas.map((p) => [p.id, p]));
  const recibidas = new Map();
  const detalles = [];

  for (const r of respuestas) {
    const campo = `respuestas.${r.preguntaId}`;
    if (!porId.has(r.preguntaId)) {
      detalles.push({ campo, mensaje: 'La pregunta no pertenece al servicio elegido.' });
    } else if (recibidas.has(r.preguntaId)) {
      detalles.push({ campo, mensaje: 'La pregunta se respondió más de una vez.' });
    } else {
      recibidas.set(r.preguntaId, r.valor.trim());
    }
  }

  const validas = [];
  for (const pregunta of preguntas) {
    const campo = `respuestas.${pregunta.id}`;
    const valor = recibidas.get(pregunta.id) ?? '';
    if (valor === '') {
      if (pregunta.obligatoria) detalles.push({ campo, mensaje: 'Esta pregunta es obligatoria.' });
      continue;
    }
    const resultado = normalizarValor(pregunta, valor);
    if (resultado.error) detalles.push({ campo, mensaje: resultado.error });
    else validas.push({ preguntaId: pregunta.id, valor: resultado.valor });
  }

  if (detalles.length > 0) {
    throw new ErrorNegocio('TRIAJE_INVALIDO', 'Revisa las respuestas del pre-triaje.', 400, detalles);
  }
  return validas;
}

function crearTriajeService({ fichasRepo, preguntasService, cifrar = cifrarPorDefecto }) {
  return {
    /** Obtiene el cuestionario del servicio y valida las respuestas (antes de la transacción). */
    async validar(servicioId, respuestas) {
      const preguntas = await preguntasService.listarPorServicio(servicioId);
      return validarRespuestas(preguntas, respuestas);
    },

    /**
     * Dentro de la transacción de agendar: guarda la ficha y sus respuestas cifradas.
     * Si no hay respuestas (servicio sin preguntas) no se crea ficha (CU-04, A2).
     */
    async guardarFicha(tx, citaId, respuestasValidas) {
      if (respuestasValidas.length === 0) return null;
      const fichaId = await fichasRepo.insertarFicha(tx, citaId);
      for (const r of respuestasValidas) {
        await fichasRepo.insertarRespuesta(tx, fichaId, r.preguntaId, cifrar(r.valor));
      }
      return fichaId;
    },
  };
}

module.exports = { crearTriajeService, validarRespuestas };
