'use strict';

// NotificacionesService (CU-05): compone el mensaje, lo envía por el canal y
// registra el resultado. Un fallo de envío nunca anula la cita (CU-03, E4).
//
// Reintentos (RF-07, RF-15): hasta MAX_INTENTOS en total. El primer intento se
// espera (la respuesta HTTP informa correoEnviado, igual que antes); si falla,
// los siguientes siguen en segundo plano, con ESPERAS_MS entre uno y otro, sin
// retrasar la respuesta. Cada intento suma 1 a notificaciones.intentos.
const registro = require('../../common/registro');
const { plantillaConfirmacion } = require('./plantillas/confirmacion');
const { plantillaReprogramacion } = require('./plantillas/reprogramacion');

const PLANTILLAS = { CONFIRMACION: plantillaConfirmacion, REPROGRAMACION: plantillaReprogramacion };

const MAX_INTENTOS = 3;
/** Espera antes del 2.º y del 3.er intento. */
const ESPERAS_MS = [1000, 3000];

/**
 * Detalle técnico del fallo sin datos personales: los mensajes de SMTP pueden
 * citar la dirección del destinatario, así que solo se guardan los códigos.
 */
function detalleSinDatosPersonales(err) {
  const partes = [err?.code, err?.responseCode, err?.command].filter((p) => p != null && p !== '');
  return (partes.length > 0 ? partes.join(' ') : 'ERROR_ENVIO').slice(0, 300);
}

/** Espera que no mantiene vivo el proceso (no bloquea el cierre del servidor ni de Jest). */
function esperarPorDefecto(ms) {
  return new Promise((resolver) => {
    const t = setTimeout(resolver, ms);
    t.unref?.();
  });
}

function crearNotificacionesService({ notificacionesRepo, canal, esperar = esperarPorDefecto, esperasMs = ESPERAS_MS }) {
  /** Reintentos en curso (para pruebas y para un cierre ordenado). */
  const enCurso = new Set();

  /** Guarda el resultado de un intento; si la BD falla, solo se registra en el log. */
  async function anotar(notificacionId, accion) {
    try {
      await accion();
    } catch (err) {
      registro.error('notificacion_sin_registrar', { notificacionId, error: registro.resumirError(err) });
    }
  }

  /** Un intento de envío. Nunca lanza. @returns {Promise<boolean>} */
  async function intentar(notificacionId, tipo, destinatario, mensaje, numero) {
    try {
      await canal.enviar({ destinatario, ...mensaje });
    } catch (err) {
      const detalle = detalleSinDatosPersonales(err);
      const definitivo = numero >= MAX_INTENTOS;
      registro.warn('notificacion_fallida', { notificacionId, tipo, intento: numero, definitivo, detalle });
      await anotar(notificacionId, () => notificacionesRepo.marcarFallida(notificacionId, detalle, { definitivo }));
      return false;
    }
    if (numero > 1) registro.info('notificacion_reintento_exitoso', { notificacionId, tipo, intento: numero });
    await anotar(notificacionId, () => notificacionesRepo.marcarEnviada(notificacionId));
    return true;
  }

  /** Intentos 2..MAX_INTENTOS en segundo plano. Nunca lanza. */
  async function reintentar(notificacionId, tipo, destinatario, mensaje) {
    for (let numero = 2; numero <= MAX_INTENTOS; numero += 1) {
      await esperar(esperasMs[numero - 2] ?? esperasMs[esperasMs.length - 1]);
      if (await intentar(notificacionId, tipo, destinatario, mensaje, numero)) return true;
    }
    return false;
  }

  return {
    /** Dentro de la transacción de agendar: deja la notificación en PENDIENTE. */
    async registrarPendiente(tx, citaId, tipo) {
      return notificacionesRepo.registrarPendiente(tx, { citaId, tipo, canal: canal.canal });
    },

    /**
     * Después del commit: primer intento (esperado) y, si falla, reintentos en
     * segundo plano. Nunca lanza.
     * @returns {Promise<boolean>} true si el proveedor aceptó el mensaje al primer intento
     */
    async enviar(notificacionId, tipo, destinatario, datos) {
      let mensaje;
      try {
        mensaje = PLANTILLAS[tipo](datos);
      } catch (err) {
        // Un error al componer el mensaje no se arregla reintentando.
        const detalle = detalleSinDatosPersonales(err);
        registro.warn('notificacion_fallida', { notificacionId, tipo, intento: 1, definitivo: true, detalle });
        await anotar(notificacionId, () => notificacionesRepo.marcarFallida(notificacionId, detalle, { definitivo: true }));
        return false;
      }

      if (await intentar(notificacionId, tipo, destinatario, mensaje, 1)) return true;

      const tarea = reintentar(notificacionId, tipo, destinatario, mensaje)
        .catch((err) => registro.error('notificacion_reintento_error', { notificacionId, error: registro.resumirError(err) }))
        .finally(() => enCurso.delete(tarea));
      enCurso.add(tarea);
      return false;
    },

    /** Espera a que terminen los reintentos en curso. */
    async esperarReintentos() {
      await Promise.all([...enCurso]);
    },
  };
}

module.exports = { crearNotificacionesService, detalleSinDatosPersonales, MAX_INTENTOS, ESPERAS_MS };
