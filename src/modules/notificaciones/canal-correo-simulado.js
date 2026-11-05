'use strict';

// Canal de correo simulado para desarrollo y pruebas cuando no hay SMTP
// configurado. No envía nada; registra el evento sin datos personales.
const { CanalNotificacion } = require('./canal-notificacion');
const registro = require('../../common/registro');

class CanalCorreoSimulado extends CanalNotificacion {
  constructor() {
    super('CORREO');
  }

  async enviar() {
    registro.info('correo_simulado', { aviso: 'SMTP no configurado: el correo no se envió realmente.' });
  }
}

module.exports = { CanalCorreoSimulado };
