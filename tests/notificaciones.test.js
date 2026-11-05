'use strict';

// CU-05: envío del comprobante y registro del resultado.
const { crearNotificacionesService, detalleSinDatosPersonales } = require('../src/modules/notificaciones/notificaciones.service');
const { plantillaConfirmacion, fechaLarga } = require('../src/modules/notificaciones/plantillas/confirmacion');
const { CanalCorreo } = require('../src/modules/notificaciones/canal-correo');
const { CanalCorreoSimulado } = require('../src/modules/notificaciones/canal-correo-simulado');

const datos = {
  nombres: 'María <b>López</b>',
  codigo: 'CR-04821',
  servicio: 'Ecografía Pélvica',
  fecha: '2026-11-09',
  horaInicio: '08:00',
  horaFin: '08:40',
  indicaciones: 'Llegar con la vejiga llena.',
};

function repoSimulado() {
  return { registrarPendiente: jest.fn().mockResolvedValue(15), marcarEnviada: jest.fn(), marcarFallida: jest.fn() };
}

describe('plantillaConfirmacion', () => {
  test('incluye código, servicio, fecha, hora e indicaciones', () => {
    const m = plantillaConfirmacion(datos);
    expect(m.asunto).toContain('CR-04821');
    for (const parte of ['CR-04821', 'Ecografía Pélvica', 'lunes, 9 de noviembre de 2026', '08:00 a 08:40', 'vejiga llena']) {
      expect(m.texto).toContain(parte);
      expect(m.html).toContain(parte);
    }
  });

  test('escapa el HTML de los datos de la paciente', () => {
    const { html } = plantillaConfirmacion(datos);
    expect(html).not.toContain('<b>López</b>');
    expect(html).toContain('&lt;b&gt;López&lt;/b&gt;');
  });

  test('fechaLarga no depende de la zona del servidor', () => {
    expect(fechaLarga('2026-11-01')).toBe('domingo, 1 de noviembre de 2026');
  });
});

describe('NotificacionesService', () => {
  test('registra la notificación PENDIENTE con el canal del Strategy', async () => {
    const repo = repoSimulado();
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal: new CanalCorreoSimulado() });
    const tx = {};
    expect(await servicio.registrarPendiente(tx, 7, 'CONFIRMACION')).toBe(15);
    expect(repo.registrarPendiente).toHaveBeenCalledWith(tx, { citaId: 7, tipo: 'CONFIRMACION', canal: 'CORREO' });
  });

  test('envío aceptado → ENVIADA y devuelve true', async () => {
    const repo = repoSimulado();
    const canal = { canal: 'CORREO', enviar: jest.fn().mockResolvedValue() };
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal });
    expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(true);
    expect(canal.enviar).toHaveBeenCalledWith(expect.objectContaining({ destinatario: 'maria@ejemplo.com', asunto: expect.any(String) }));
    expect(repo.marcarEnviada).toHaveBeenCalledWith(15);
  });

  test('E1: el proveedor rechaza → FALLIDA sin datos personales y no lanza', async () => {
    const repo = repoSimulado();
    const err = Object.assign(new Error('Recipient maria@ejemplo.com rejected'), { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
    const canal = { canal: 'CORREO', enviar: jest.fn().mockRejectedValue(err) };
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal });
    expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(false);
    expect(repo.marcarFallida).toHaveBeenCalledWith(15, 'EENVELOPE 550 RCPT TO');
  });

  test('si tampoco se puede registrar el resultado, no lanza', async () => {
    const repo = { ...repoSimulado(), marcarEnviada: jest.fn().mockRejectedValue(new Error('bd caída')) };
    const canal = { canal: 'CORREO', enviar: jest.fn().mockResolvedValue() };
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal });
    await expect(servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).resolves.toBe(true);
  });

  test('detalleSinDatosPersonales nunca usa el mensaje del error', () => {
    expect(detalleSinDatosPersonales(new Error('maria@ejemplo.com'))).toBe('ERROR_ENVIO');
    expect(detalleSinDatosPersonales({ code: 'ETIMEDOUT' })).toBe('ETIMEDOUT');
  });
});

describe('CanalCorreo', () => {
  test('envía con Nodemailer usando el remitente configurado', async () => {
    const transporte = { sendMail: jest.fn().mockResolvedValue({}) };
    const canal = new CanalCorreo({ remitente: 'Clínica Rueda <no-responder@ejemplo.com>' }, transporte);
    await canal.enviar({ destinatario: 'maria@ejemplo.com', asunto: 'A', texto: 'T', html: '<p>H</p>' });
    expect(canal.canal).toBe('CORREO');
    expect(transporte.sendMail).toHaveBeenCalledWith({
      from: 'Clínica Rueda <no-responder@ejemplo.com>',
      to: 'maria@ejemplo.com',
      subject: 'A',
      text: 'T',
      html: '<p>H</p>',
    });
  });
});
