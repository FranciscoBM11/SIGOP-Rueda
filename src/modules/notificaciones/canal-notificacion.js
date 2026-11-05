'use strict';

// Strategy CanalNotificacion (Fase 3, Tabla 49): cada canal (correo, WhatsApp
// en el futuro) implementa enviar(). Agregar un canal no modifica los existentes.

class CanalNotificacion {
  /** @param {'CORREO'|'WHATSAPP'} canal valor de notificaciones.canal */
  constructor(canal) {
    this.canal = canal;
  }

  /**
   * Envía el mensaje. Debe lanzar un error si el proveedor no lo acepta.
   * @param {{ destinatario: string, asunto: string, texto: string, html: string }} mensaje
   */
  // eslint-disable-next-line no-unused-vars
  async enviar(mensaje) {
    throw new Error('enviar() no implementado');
  }
}

module.exports = { CanalNotificacion };
