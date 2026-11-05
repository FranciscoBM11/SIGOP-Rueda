'use strict';

// PreguntasService: cuestionario de pre-triaje de cada servicio (RN-08).

/** Agrupa las filas (pregunta × opción) en preguntas con su lista de opciones. */
function agrupar(filas) {
  const porId = new Map();
  for (const f of filas) {
    if (!porId.has(f.id)) {
      porId.set(f.id, {
        id: f.id,
        texto: f.texto,
        tipo: f.tipo_respuesta,
        obligatoria: Boolean(f.obligatoria),
        opciones: [],
      });
    }
    if (f.opcion_id != null) porId.get(f.id).opciones.push({ id: f.opcion_id, etiqueta: f.opcion_etiqueta });
  }
  return [...porId.values()]; // el repositorio ya las entrega en orden
}

function crearPreguntasService({ preguntasRepo, serviciosService }) {
  return {
    /** Preguntas activas del servicio (que debe estar activo), en su orden. */
    async listarPorServicio(servicioId) {
      await serviciosService.obtenerActivo(servicioId);
      return agrupar(await preguntasRepo.listarActivasPorServicio(servicioId));
    },
  };
}

module.exports = { crearPreguntasService, agrupar };
