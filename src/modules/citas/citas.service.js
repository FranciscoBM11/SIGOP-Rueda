'use strict';

// CitasService.agendar() (CU-03): unidad de trabajo. Paciente, cita, cambio de
// estado, ficha de triaje y notificación se guardan todos o ninguno.
// El correo se envía después del commit (CU-05); si falla, la cita se mantiene.
//
// cancelar() (CU-06) y reprogramar() (CU-07): la paciente ya se identificó con
// cédula y código (CU-08) y el token de cita indica el id de su cita.
//
// Panel del personal (Iteración 3): agenda() (CU-11), transiciones() y
// cambiarEstado() (CU-12), cancelarPorPersonal() y reprogramarPorPersonal()
// (CU-13). Cada cambio queda en cambios_estado_cita con el usuario (RF-17).
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua } = require('../../common/fechas');
const { generarCodigoCita: generarPorDefecto } = require('./generar-codigo-cita');
const { presentarComprobante, presentarCita, presentarItemAgenda } = require('./cita.presentador');
const { VERSION_CONSENTIMIENTO } = require('./citas.schemas');
const {
  puedeTransicionar,
  motivoNoModificablePorPaciente,
  motivoNoModificablePorPersonal,
  transicionesPermitidas,
  validarCambioPersonal,
} = require('./maquina-estados-cita');

const ESTADO_INICIAL = 'CONFIRMADA';

const DETALLE_POR_ESTADO = Object.freeze({
  EN_ESPERA: 'Llegada registrada',
  ATENDIDA: 'Atendida por la médica',
  NO_ASISTIO: 'La paciente no asistió',
  CANCELADA: 'Cancelada por recepción',
});

function errorCitaNoEncontrada() {
  return new ErrorNegocio('CITA_NO_ENCONTRADA', 'No encontramos la cita. Vuelve a ingresar tu cédula y código.', 404);
}

function errorCitaNoEncontradaPanel() {
  return new ErrorNegocio('CITA_NO_ENCONTRADA', 'No existe una cita con ese código. Actualiza la agenda.', 404);
}

/**
 * Quién hace el cambio. La paciente (token de cita) o el personal (sesión).
 * Define cómo se busca la cita, qué reglas aplican y cómo se registra.
 */
const ACTOR_PACIENTE = Object.freeze({
  origen: 'PACIENTE',
  usuarioId: null,
  errorNoEncontrada: errorCitaNoEncontrada,
  motivoNoModificable: motivoNoModificablePorPaciente,
  mensajeMismoTurno: 'Ese ya es el horario de tu cita. Elige otro.',
  detalleCancelacion: 'Cancelada por la paciente',
  prefijoReprogramacion: 'Reprogramada por la paciente',
});

function actorPersonal(sesion) {
  return {
    origen: 'PERSONAL',
    usuarioId: sesion.usuarioId,
    errorNoEncontrada: errorCitaNoEncontradaPanel,
    motivoNoModificable: motivoNoModificablePorPersonal,
    mensajeMismoTurno: 'Ese ya es el horario de la cita. Elige otro.',
    detalleCancelacion: DETALLE_POR_ESTADO.CANCELADA,
    prefijoReprogramacion: 'Reprogramada por recepción',
  };
}

/** Bloquea la cita y comprueba que el actor pueda cancelarla o reprogramarla. */
async function bloquearModificable(citasRepo, tx, clave, actor, reloj) {
  const cita = await citasRepo.bloquear(tx, clave);
  if (!cita) throw actor.errorNoEncontrada();
  const motivo = actor.motivoNoModificable(cita, reloj());
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
  /** CU-06 / CU-13: Confirmada → Cancelada (RN-06). El turno queda libre (RN-07). */
  async function cancelarCita(clave, actor) {
    return transaccion(async (tx) => {
      const actual = await bloquearModificable(citasRepo, tx, clave, actor, reloj);
      if (!puedeTransicionar(actual.estado, 'CANCELADA')) {
        throw new ErrorNegocio('CITA_NO_MODIFICABLE', 'Esta cita no puede cancelarse.', 409);
      }
      await citasRepo.actualizarEstado(tx, actual.id, 'CANCELADA');
      await cambiosEstadoRepo.registrar(tx, {
        citaId: actual.id,
        estadoAnterior: actual.estado,
        estadoNuevo: 'CANCELADA',
        origen: actor.origen,
        usuarioId: actor.usuarioId,
        detalle: actor.detalleCancelacion,
      });
      return { ...actual, estado: 'CANCELADA' };
    });
  }

  /**
   * CU-07 / CU-13: mueve la cita a otro turno libre conservando el código. La
   * cita sigue Confirmada (RN-06), el turno anterior queda libre (RN-07) y el
   * nuevo no puede tener otra cita activa (RN-01). Después del commit se envía
   * el nuevo horario por correo (CU-05).
   */
  async function reprogramarCita(clave, turnoId, actor) {
    let resultado;
    try {
      resultado = await transaccion(async (tx) => {
        const actual = await bloquearModificable(citasRepo, tx, clave, actor, reloj);
        if (actual.turnoId === turnoId) {
          throw new ErrorNegocio('MISMO_TURNO', actor.mensajeMismoTurno, 409);
        }
        const turno = await turnosService.reservar(tx, turnoId);
        await citasRepo.cambiarTurno(tx, actual.id, turnoId);
        await cambiosEstadoRepo.registrar(tx, {
          citaId: actual.id,
          estadoAnterior: actual.estado,
          estadoNuevo: actual.estado,
          origen: actor.origen,
          usuarioId: actor.usuarioId,
          detalle: `${actor.prefijoReprogramacion}: ${actual.fecha} ${actual.horaInicio} -> ${turno.fecha} ${turno.horaInicio}`,
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
    const citaNueva = {
      ...cita,
      turnoId: turno.id,
      fecha: turno.fecha,
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
    };
    return { cita: citaNueva, correoEnviado };
  }

  async function buscarParaPanel(codigo) {
    const cita = await citasRepo.buscarPorCodigo(codigo);
    if (!cita) throw errorCitaNoEncontradaPanel();
    return cita;
  }

  return {
    /**
     * CU-06 (paciente).
     * @returns {Promise<{ cita: object }>}
     */
    async cancelar(citaId) {
      const cita = await cancelarCita({ id: citaId }, ACTOR_PACIENTE);
      return { cita: presentarCita(cita) };
    },

    /**
     * CU-07 (paciente).
     * @returns {Promise<{ codigo, servicio, nuevoHorario: { fecha, horaInicio, horaFin }, indicaciones, correoEnviado }>}
     */
    async reprogramar(citaId, turnoId) {
      const { cita, correoEnviado } = await reprogramarCita({ id: citaId }, turnoId, ACTOR_PACIENTE);
      return {
        codigo: cita.codigo,
        servicio: cita.servicio,
        nuevoHorario: { fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin },
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

    // ---- Panel del personal -------------------------------------------------

    /**
     * CU-11: citas de la fecha ordenadas por hora, con las acciones que el rol
     * puede hacer en cada una. Nunca incluye respuestas del triaje (RN-16).
     */
    async agenda(fecha, rol) {
      const ahora = reloj();
      const citas = await citasRepo.listarAgenda(fecha);
      return citas.map((c) => presentarItemAgenda(c, rol, ahora));
    },

    /** CU-12 paso 2: estados a los que el rol puede llevar la cita (RN-06, RN-11). */
    async transiciones(codigo, rol) {
      const cita = await buscarParaPanel(codigo);
      return transicionesPermitidas(cita, rol, reloj());
    },

    /** Cita de la agenda (para el encabezado de la ficha de triaje). */
    async obtenerItemAgenda(codigo, rol) {
      const cita = await buscarParaPanel(codigo);
      return { id: cita.id, item: presentarItemAgenda(cita, rol, reloj()) };
    },

    /**
     * CU-12: valida la transición y el rol, actualiza el estado y registra el
     * cambio con fecha, hora y usuario (RF-17).
     * @returns {Promise<{ cita: object }>} la cita como ítem de la agenda
     */
    async cambiarEstado(codigo, estadoNuevo, sesion) {
      const cita = await transaccion(async (tx) => {
        const actual = await citasRepo.bloquear(tx, { codigo });
        if (!actual) throw errorCitaNoEncontradaPanel();
        const problema = validarCambioPersonal(actual, estadoNuevo, sesion.rol, reloj());
        if (problema) throw new ErrorNegocio(problema.codigo, problema.mensaje, problema.http);
        await citasRepo.actualizarEstado(tx, actual.id, estadoNuevo);
        await cambiosEstadoRepo.registrar(tx, {
          citaId: actual.id,
          estadoAnterior: actual.estado,
          estadoNuevo,
          origen: 'PERSONAL',
          usuarioId: sesion.usuarioId,
          detalle: DETALLE_POR_ESTADO[estadoNuevo] ?? null,
        });
        return { ...actual, estado: estadoNuevo };
      });
      return { cita: presentarItemAgenda(cita, sesion.rol, reloj()) };
    },

    /** CU-13: recepción cancela a pedido de la paciente. */
    async cancelarPorPersonal(codigo, sesion) {
      const cita = await cancelarCita({ codigo }, actorPersonal(sesion));
      return { cita: presentarItemAgenda(cita, sesion.rol, reloj()) };
    },

    /** CU-13: recepción reprograma a pedido de la paciente; se envía el correo. */
    async reprogramarPorPersonal(codigo, turnoId, sesion) {
      const { cita, correoEnviado } = await reprogramarCita({ codigo }, turnoId, actorPersonal(sesion));
      return { cita: presentarItemAgenda(cita, sesion.rol, reloj()), correoEnviado };
    },
  };
}

module.exports = { crearCitasService, esTurnoDuplicado, ESTADO_INICIAL };
