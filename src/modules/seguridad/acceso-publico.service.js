'use strict';

// AccesoPublicoService (CU-08): valida cédula + código (RN-04) con límite de
// intentos por cédula (RN-15) y entrega un token de cita de 15 minutos.
// El formato (E1) ya lo validó el esquema zod: aquí no se registra intento.
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua } = require('../../common/fechas');
const { motivoNoModificablePorPaciente } = require('../citas/maquina-estados-cita');
const { presentarCita } = require('../citas/cita.presentador');

const MAX_FALLIDOS = 5;
const VENTANA_MINUTOS = 15;

function errorBloqueado(segundosRestantes) {
  const minutos = Math.max(1, Math.ceil(segundosRestantes / 60));
  return new ErrorNegocio(
    'ACCESO_BLOQUEADO',
    `Por tu seguridad bloqueamos el acceso con esta cédula después de ${MAX_FALLIDOS} intentos fallidos. ` +
      `Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
    429,
  );
}

// E2: mensaje genérico, sin indicar si falló la cédula o el código.
function errorNoCoincide() {
  return new ErrorNegocio(
    'ACCESO_DENEGADO',
    'La cédula y el código no corresponden a ninguna cita. Revisa los datos e intenta de nuevo.',
    401,
  );
}

function crearAccesoPublicoService({ intentosRepo, citasRepo, tokenCita, hashIp, reloj = ahoraManagua }) {
  return {
    /**
     * @param {{ cedula: string, codigo: string, ip?: string }} datos ya normalizados (mayúsculas)
     * @returns {Promise<{ cita: object, tokenCita: string }>}
     */
    async validarAccesoCita({ cedula, codigo, ip }) {
      // Pasos 3-4 y E3: con 5 fallidos consecutivos en 15 minutos, ni se busca la cita.
      const recientes = await intentosRepo.fallidosRecientes(cedula, {
        ventanaMinutos: VENTANA_MINUTOS,
        limite: MAX_FALLIDOS,
      });
      if (recientes.length >= MAX_FALLIDOS) {
        // Se desbloquea cuando el 5.º fallido más reciente sale de la ventana.
        throw errorBloqueado(recientes[MAX_FALLIDOS - 1].segundosRestantes);
      }

      const cita = await citasRepo.buscarPorCedulaYCodigo(cedula, codigo);
      const ipHash = hashIp(ip);

      if (!cita) {
        await intentosRepo.registrar({ cedula, exitoso: false, ipHash });
        // El fallido que acaba de registrarse completa los 5: se avisa del bloqueo ya.
        if (recientes.length + 1 >= MAX_FALLIDOS) {
          throw errorBloqueado(recientes[MAX_FALLIDOS - 2].segundosRestantes);
        }
        throw errorNoCoincide();
      }

      // Paso 5: ambos datos coinciden; el éxito reinicia el conteo de fallidos.
      await intentosRepo.registrar({ cedula, exitoso: true, ipHash });

      // CU-06/CU-07 E2: solo una cita Confirmada y por venir se gestiona en línea.
      const motivo = motivoNoModificablePorPaciente(cita, reloj());
      if (motivo) throw new ErrorNegocio('CITA_NO_MODIFICABLE', motivo, 409);

      return {
        cita: presentarCita(cita),
        tokenCita: tokenCita.firmar({ citaId: cita.id, codigo: cita.codigo }),
      };
    },
  };
}

module.exports = { crearAccesoPublicoService, MAX_FALLIDOS, VENTANA_MINUTOS };
