'use strict';

// TurnosService (CU-02): turnos de un rango con su disponibilidad, y
// verificación del turno al momento de agendar (RN-01, RN-10).
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua, sumarDias, diferenciaDias } = require('../../common/fechas');
const registro = require('../../common/registro');

const MAX_DIAS_RANGO = 31; // días por consulta (inclusive)
const MAX_DIAS_ADELANTE = 90; // hasta dónde se puede consultar y agendar

function errorRango(mensaje) {
  return new ErrorNegocio('RANGO_INVALIDO', mensaje, 400);
}

/** ¿El turno ya empezó o pasó, según la hora de Managua? */
function yaPaso(turno, ahora) {
  return turno.fecha < ahora.fecha || (turno.fecha === ahora.fecha && turno.hora_inicio <= ahora.hora);
}

/** Agrupa en rangos [desde, hasta] consecutivos los días que no están en `conTurnos`. */
function rangosSinTurnos(desde, hasta, conTurnos) {
  const rangos = [];
  let inicio = null;
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    if (!conTurnos.has(dia)) {
      inicio ??= dia;
    } else if (inicio) {
      rangos.push([inicio, sumarDias(dia, -1)]);
      inicio = null;
    }
  }
  if (inicio) rangos.push([inicio, hasta]);
  return rangos;
}

function presentar(fila) {
  return { id: fila.id, fecha: fila.fecha, horaInicio: fila.hora_inicio, horaFin: fila.hora_fin };
}

function crearTurnosService({ turnosRepo, serviciosService, reloj = ahoraManagua }) {
  return {
    /**
     * Turnos del rango (sin los ya pasados) con disponible = false si tienen
     * una cita activa. Genera antes los turnos que falten en el rango.
     */
    async consultar({ servicioId, desde, hasta }) {
      await serviciosService.obtenerActivo(servicioId);
      const ahora = reloj();
      if (hasta < desde) throw errorRango('La fecha final debe ser igual o posterior a la inicial.');
      if (diferenciaDias(desde, hasta) + 1 > MAX_DIAS_RANGO) {
        throw errorRango(`Consulta como máximo ${MAX_DIAS_RANGO} días a la vez.`);
      }
      const limite = sumarDias(ahora.fecha, MAX_DIAS_ADELANTE);
      if (hasta > limite) throw errorRango(`Solo se puede agendar hasta ${MAX_DIAS_ADELANTE} días en adelante.`);

      const inicio = desde < ahora.fecha ? ahora.fecha : desde;
      if (inicio > hasta) return [];

      try {
        // Solo se generan los días que aún no tienen turnos: así un cambio de
        // horario (CU-16, que rige desde mañana) no mezcla turnos de dos
        // horarios en un día ya generado.
        const conTurnos = await turnosRepo.fechasConTurnos(inicio, hasta);
        for (const [a, b] of rangosSinTurnos(inicio, hasta, conTurnos)) {
          await turnosRepo.generar(a, b);
        }
      } catch (err) {
        // Si falla la generación (p. ej. falta GRANT EXECUTE) se muestran los turnos existentes.
        registro.warn('turnos_generacion_fallida', { error: registro.resumirError(err) });
      }

      const filas = await turnosRepo.listar(inicio, hasta);
      return filas
        .filter((f) => !yaPaso(f, ahora))
        .map((f) => ({ ...presentar(f), disponible: !f.ocupado }));
    },

    /**
     * Dentro de la transacción de agendar: bloquea el turno y comprueba que
     * exista, esté habilitado, no haya pasado y no tenga cita activa.
     */
    async reservar(tx, turnoId) {
      const turno = await turnosRepo.bloquearParaReserva(tx, turnoId);
      if (!turno) {
        throw new ErrorNegocio('TURNO_NO_ENCONTRADO', 'El turno elegido no existe. Elige otro horario.', 404);
      }
      const ahora = reloj();
      if (!turno.habilitado || yaPaso(turno, ahora) || turno.fecha > sumarDias(ahora.fecha, MAX_DIAS_ADELANTE)) {
        throw new ErrorNegocio('TURNO_NO_DISPONIBLE', 'El turno elegido ya no está disponible. Elige otro horario.', 409);
      }
      if (turno.ocupado) {
        throw new ErrorNegocio('TURNO_OCUPADO', 'El turno ya fue reservado. Elige otro.', 409);
      }
      return presentar(turno);
    },
  };
}

module.exports = { crearTurnosService, rangosSinTurnos, yaPaso, MAX_DIAS_RANGO, MAX_DIAS_ADELANTE };
