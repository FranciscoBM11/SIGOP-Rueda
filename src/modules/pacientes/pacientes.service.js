'use strict';

// PacientesService: la paciente se identifica por su cédula (CU-03).

function crearPacientesService({ pacientesRepo }) {
  return {
    /**
     * Dentro de la transacción de agendar. Si la cédula ya existe se reutiliza
     * la paciente y se actualizan su teléfono y correo (CU-03, A2); si no, se crea.
     * @returns {Promise<number>} id de la paciente
     */
    async registrarOActualizar(tx, paciente) {
      const existente = await pacientesRepo.buscarPorCedulaParaActualizar(tx, paciente.cedula);
      if (existente) {
        await pacientesRepo.actualizarContacto(tx, existente.id, paciente);
        return existente.id;
      }
      return pacientesRepo.insertar(tx, paciente);
    },
  };
}

module.exports = { crearPacientesService };
