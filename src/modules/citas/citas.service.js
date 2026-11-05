'use strict';

// CitasService.agendar() (CU-03): unidad de trabajo. Paciente, cita, cambio de
// estado, ficha de triaje y notificación se guardan todos o ninguno.
// El correo se envía después del commit (CU-05); si falla, la cita se mantiene.
const { ErrorNegocio } = require('../../common/errores');
const { generarCodigoCita: generarPorDefecto } = require('./generar-codigo-cita');
const { presentarComprobante } = require('./cita.presentador');
const { VERSION_CONSENTIMIENTO } = require('./citas.schemas');

const ESTADO_INICIAL = 'CONFIRMADA';

/** ¿El error es la violación del índice único que impide dos citas activas en un turno (RN-01)? */
function esTurnoDuplicado(err) {
  const numero = err?.number ?? err?.originalError?.info?.number;
  return (numero === 2601 || numero === 2627) && /uq_cita_turno_activa/i.test(err?.message ?? '');
}

function crearCitasService({
  transaccion,
  citasRepo,
  cambiosEstadoRepo,
  serviciosService,
  turnosService,
  pacientesService,
  triajeService,
  notificacionesService,
  generarCodigoCita = generarPorDefecto,
}) {
  return {
    /**
     * @param {object} datos salida de crearCitaSchema (ya validada; consentimiento === true)
     * @returns comprobante { codigo, servicio, fecha, horaInicio, horaFin, indicaciones, correoEnviado }
     */
    async agendar(datos) {
      // RN-05: defensa en profundidad además del esquema.
      if (datos.consentimiento !== true) {
        throw new ErrorNegocio('CONSENTIMIENTO_REQUERIDO', 'Debes aceptar el consentimiento informado para agendar.', 400);
      }

      // Validaciones que no necesitan la transacción.
      const servicio = await serviciosService.obtenerActivo(datos.servicioId);
      const respuestas = await triajeService.validar(datos.servicioId, datos.respuestas);

      let resultado;
      try {
        resultado = await transaccion(async (tx) => {
          const turno = await turnosService.reservar(tx, datos.turnoId);
          const pacienteId = await pacientesService.registrarOActualizar(tx, datos.paciente);
          const codigo = await generarCodigoCita((c) => citasRepo.codigoExiste(tx, c));
          const citaId = await citasRepo.insertar(tx, {
            codigo,
            pacienteId,
            turnoId: datos.turnoId,
            servicioId: datos.servicioId,
            consentimientoVersion: VERSION_CONSENTIMIENTO,
          });
          await cambiosEstadoRepo.registrar(tx, { citaId, estadoAnterior: null, estadoNuevo: ESTADO_INICIAL, origen: 'PACIENTE' });
          await triajeService.guardarFicha(tx, citaId, respuestas);
          const notificacionId = await notificacionesService.registrarPendiente(tx, citaId, 'CONFIRMACION');
          return { codigo, turno, notificacionId };
        });
      } catch (err) {
        if (esTurnoDuplicado(err)) {
          throw new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409);
        }
        throw err;
      }

      const { codigo, turno, notificacionId } = resultado;
      const correoEnviado = await notificacionesService.enviar(notificacionId, 'CONFIRMACION', datos.paciente.correo, {
        nombres: datos.paciente.nombres,
        codigo,
        servicio: servicio.nombre,
        fecha: turno.fecha,
        horaInicio: turno.horaInicio,
        horaFin: turno.horaFin,
        indicaciones: servicio.indicaciones,
      });

      return presentarComprobante({ codigo, servicio, turno, correoEnviado });
    },
  };
}

module.exports = { crearCitasService, esTurnoDuplicado, ESTADO_INICIAL };
