'use strict';

// ServiciosService: servicios que se pueden agendar.
const { ErrorNegocio } = require('../../common/errores');

function errorServicioNoDisponible() {
  return new ErrorNegocio(
    'SERVICIO_NO_DISPONIBLE',
    'El servicio elegido no existe o ya no se ofrece. Elige otro servicio.',
    404,
  );
}

function presentar(fila) {
  return { id: fila.id, nombre: fila.nombre, indicaciones: fila.indicaciones_previas };
}

function crearServiciosService({ serviciosRepo }) {
  return {
    async listar() {
      const filas = await serviciosRepo.listarActivos();
      return filas.map(presentar);
    },

    /** Devuelve el servicio si existe y está activo; si no, SERVICIO_NO_DISPONIBLE. */
    async obtenerActivo(id) {
      const fila = await serviciosRepo.obtenerPorId(id);
      if (!fila || !fila.activo) throw errorServicioNoDisponible();
      return presentar(fila);
    },
  };
}

module.exports = { crearServiciosService, errorServicioNoDisponible };
