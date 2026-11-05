'use strict';

// CitasService.agendar() (CU-03): unidad de trabajo. Paciente, cita, cambio de
// estado, ficha de triaje y notificación se guardan todos o ninguno.
// El correo se envía después del commit (CU-05); si falla, la cita se mantiene.
//
// cancelar() (CU-06) y reprogramar() (CU-07): la paciente ya se identificó con
// cédula y código (CU-08) y el token de cita indica el id de su cita.
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua } = require('../../common/fechas');
const { generarCodigoCita: generarPorDefecto } = require('./generar-codigo-cita');
const { presentarComprobante, presentarCita } = require('./cita.presentador');
const { VERSION_CONSENTIMIENTO } = require('./citas.schemas');
const { puedeTransicionar, motivoNoModificablePorPaciente } = require('./maquina-estados-cita');

const ESTADO_INICIAL = 'CONFIRMADA';

function errorCitaNoEncontrada() {
  return new ErrorNegocio('CITA_NO_ENCONTRADA', 'No encontramos la cita. Vuelve a ingresar tu cédula y código.', 404);
}

/** Bloquea la cita y comprueba que la paciente pueda modificarla (CU-06/CU-07, E2). */
async function bloquearModificable(citasRepo, tx, citaId, reloj) {
  const cita = await citasRepo.bloquearPorId(tx, citaId);
  if (!cita) throw errorCitaNoEncontrada();
  const motivo = motivoNoModificablePorPaciente(cita, reloj());
  if (motivo) throw new ErrorNegocio('CITA_NO_MODIFICABLE', motivo, 409);
  return cita;
}

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
  reloj = ahoraManagua,
}) {
  return {
    /**
     * CU-06: Confirmada → Cancelada (RN-06). El turno queda libre (RN-07)
     * porque la disponibilidad solo cuenta citas no canceladas.
     * @returns {Promise<{ cita: object }>}
     */
    async cancelar(citaId) {
      const cita = await transaccion(async (tx) => {
        const actual = await bloquearModificable(citasRepo, tx, citaId, reloj);
        if (!puedeTransicionar(actual.estado, 'CANCELADA')) {
          throw new ErrorNegocio('CITA_NO_MODIFICABLE', 'Esta cita no puede cancelarse.', 409);
        }
        await citasRepo.actualizarEstado(tx, actual.id, 'CANCELADA');
        await cambiosEstadoRepo.registrar(tx, {
          citaId: actual.id,
          estadoAnterior: actual.estado,
          estadoNuevo: 'CANCELADA',
          origen: 'PACIENTE',
          detalle: 'Cancelada por la paciente',
        });
        return { ...actual, estado: 'CANCELADA' };
      });
      return { cita: presentarCita(cita) };
    },

    /**
     * CU-07: mueve la cita a otro turno libre conservando el código. La cita
     * sigue Confirmada (RN-06), el turno anterior queda libre (RN-07) y el
     * nuevo no puede tener otra cita activa (RN-01). Después del commit se
     * envía el nuevo horario por correo (CU-05).
     * @returns {Promise<{ codigo, servicio, nuevoHorario: { fecha, horaInicio, horaFin }, correoEnviado }>}
     */
    async reprogramar(citaId, turnoId) {
      let resultado;
      try {
        resultado = await transaccion(async (tx) => {
          const actual = await bloquearModificable(citasRepo, tx, citaId, reloj);
          if (actual.turnoId === turnoId) {
            throw new ErrorNegocio('MISMO_TURNO', 'Ese ya es el horario de tu cita. Elige otro.', 409);
          }
          const turno = await turnosService.reservar(tx, turnoId);
          await citasRepo.cambiarTurno(tx, actual.id, turnoId);
          await cambiosEstadoRepo.registrar(tx, {
            citaId: actual.id,
            estadoAnterior: actual.estado,
            estadoNuevo: actual.estado,
            origen: 'PACIENTE',
            detalle: `Reprogramada por la paciente: ${actual.fecha} ${actual.horaInicio} -> ${turno.fecha} ${turno.horaInicio}`,
          });
          const notificacionId = await notificacionesService.registrarPendiente(tx, actual.id, 'REPROGRAMACION');
          return { cita: actual, turno, notificacionId };
        });
      } catch (err) {
        if (esTurnoDuplicado(err)) {
          throw new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409);
        }
        throw err;
      }

      const { cita, turno, notificacionId } = resultado;
      const correoEnviado = await notificacionesService.enviar(notificacionId, 'REPROGRAMACION', cita.correo, {
        nombres: cita.nombres,
        codigo: cita.codigo,
        servicio: cita.servicio,
        fecha: turno.fecha,
        horaInicio: turno.horaInicio,
        horaFin: turno.horaFin,
        indicaciones: cita.indicaciones,
        anterior: { fecha: cita.fecha, horaInicio: cita.horaInicio },
      });

      return {
        codigo: cita.codigo,
        servicio: cita.servicio,
        nuevoHorario: { fecha: turno.fecha, horaInicio: turno.horaInicio, horaFin: turno.horaFin },
        indicaciones: cita.indicaciones,
        correoEnviado,
      };
    },

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
