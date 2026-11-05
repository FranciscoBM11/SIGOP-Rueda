'use strict';

// NotificacionesService (CU-05): compone el mensaje, lo envía por el canal y
// registra el resultado. Un fallo de envío nunca anula la cita (CU-03, E4).
const registro = require('../../common/registro');
const { plantillaConfirmacion } = require('./plantillas/confirmacion');
const { plantillaReprogramacion } = require('./plantillas/reprogramacion');

const PLANTILLAS = { CONFIRMACION: plantillaConfirmacion, REPROGRAMACION: plantillaReprogramacion };

/**
 * Detalle técnico del fallo sin datos personales: los mensajes de SMTP pueden
 * citar la dirección del destinatario, así que solo se guardan los códigos.
 */
function detalleSinDatosPersonales(err) {
  const partes = [err?.code, err?.responseCode, err?.command].filter((p) => p != null && p !== '');
  return (partes.length > 0 ? partes.join(' ') : 'ERROR_ENVIO').slice(0, 300);
}

function crearNotificacionesService({ notificacionesRepo, canal }) {
  return {
    /** Dentro de la transacción de agendar: deja la notificación en PENDIENTE. */
    async registrarPendiente(tx, citaId, tipo) {
      return notificacionesRepo.registrarPendiente(tx, { citaId, tipo, canal: canal.canal });
    },

    /**
     * Después del commit: envía y marca ENVIADA o FALLIDA. Nunca lanza.
     * @returns {Promise<boolean>} true si el proveedor aceptó el mensaje
     */
    async enviar(notificacionId, tipo, destinatario, datos) {
      let enviado = false;
      let detalle = null;
      try {
        const mensaje = PLANTILLAS[tipo](datos);
        await canal.enviar({ destinatario, ...mensaje });
        enviado = true;
      } catch (err) {
        detalle = detalleSinDatosPersonales(err);
        registro.warn('notificacion_fallida', { notificacionId, tipo, detalle });
      }
      try {
        if (enviado) await notificacionesRepo.marcarEnviada(notificacionId);
        else await notificacionesRepo.marcarFallida(notificacionId, detalle);
      } catch (err) {
        registro.error('notificacion_sin_registrar', { notificacionId, error: registro.resumirError(err) });
      }
      return enviado;
    },
  };
}

module.exports = { crearNotificacionesService, detalleSinDatosPersonales };
