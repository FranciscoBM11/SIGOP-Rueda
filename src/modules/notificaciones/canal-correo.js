'use strict';

// CanalCorreo: envío real por SMTP con Nodemailer.
const nodemailer = require('nodemailer');
const { CanalNotificacion } = require('./canal-notificacion');

class CanalCorreo extends CanalNotificacion {
  /**
   * @param {object} smtp configuración (config.smtp)
   * @param {object} [transporte] transporte de Nodemailer (se inyecta en pruebas)
   */
  constructor(smtp, transporte) {
    super('CORREO');
    this.remitente = smtp.remitente;
    this.transporte =
      transporte ??
      nodemailer.createTransport({
        host: smtp.host,
        port: smtp.puerto,
        secure: smtp.seguro,
        auth: { user: smtp.usuario, pass: smtp.clave },
        // Tiempos cortos: la paciente espera la respuesta de "Agendar".
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
  }

  async enviar({ destinatario, asunto, texto, html }) {
    await this.transporte.sendMail({ from: this.remitente, to: destinatario, subject: asunto, text: texto, html });
  }
}

module.exports = { CanalCorreo };
