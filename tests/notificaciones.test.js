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

  test('E1: el proveedor rechaza → registra el fallo sin datos personales y no lanza', async () => {
    const repo = repoSimulado();
    const err = Object.assign(new Error('Recipient maria@ejemplo.com rejected'), { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' });
    const canal = { canal: 'CORREO', enviar: jest.fn().mockRejectedValue(err) };
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal, esperar: () => Promise.resolve() });
    expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(false);
    await servicio.esperarReintentos();
    for (const llamada of repo.marcarFallida.mock.calls) {
      expect(llamada[1]).toBe('EENVELOPE 550 RCPT TO');
      expect(JSON.stringify(llamada)).not.toContain('maria@ejemplo.com');
    }
  });

  test('si tampoco se puede registrar el resultado, no lanza', async () => {
    const repo = { ...repoSimulado(), marcarEnviada: jest.fn().mockRejectedValue(new Error('bd caída')) };
    const canal = { canal: 'CORREO', enviar: jest.fn().mockResolvedValue() };
    const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal });
    await expect(servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).resolves.toBe(true);
  });

  describe('reintentos (RF-07, RF-15): hasta 3 intentos, en segundo plano', () => {
    const errSmtp = () => Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });

    function preparar(resultados) {
      const repo = repoSimulado();
      const canal = { canal: 'CORREO', enviar: jest.fn() };
      for (const r of resultados) {
        if (r === 'ok') canal.enviar.mockResolvedValueOnce();
        else canal.enviar.mockRejectedValueOnce(errSmtp());
      }
      const esperas = [];
      const esperar = jest.fn((ms) => {
        esperas.push(ms);
        return Promise.resolve();
      });
      const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal, esperar });
      return { repo, canal, servicio, esperas };
    }

    test('éxito al primer intento: ENVIADA, sin reintentos ni esperas', async () => {
      const { repo, canal, servicio, esperas } = preparar(['ok']);
      expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(true);
      await servicio.esperarReintentos();
      expect(canal.enviar).toHaveBeenCalledTimes(1);
      expect(repo.marcarEnviada).toHaveBeenCalledTimes(1);
      expect(repo.marcarFallida).not.toHaveBeenCalled();
      expect(esperas).toEqual([]);
    });

    test('éxito al segundo intento: el 1.º queda PENDIENTE y luego pasa a ENVIADA', async () => {
      const { repo, canal, servicio, esperas } = preparar(['falla', 'ok']);
      // La respuesta no espera el reintento: informa el resultado del primer intento.
      expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(false);
      await servicio.esperarReintentos();
      expect(canal.enviar).toHaveBeenCalledTimes(2);
      expect(repo.marcarFallida).toHaveBeenCalledTimes(1);
      expect(repo.marcarFallida).toHaveBeenCalledWith(15, 'ETIMEDOUT', { definitivo: false });
      expect(repo.marcarEnviada).toHaveBeenCalledTimes(1);
      expect(repo.marcarEnviada).toHaveBeenCalledWith(15);
      expect(esperas).toEqual([1000]);
    });

    test('fallo total: 3 intentos, cada uno anotado, y el último deja FALLIDA', async () => {
      const { repo, canal, servicio, esperas } = preparar(['falla', 'falla', 'falla']);
      expect(await servicio.enviar(15, 'REPROGRAMACION', 'maria@ejemplo.com', { ...datos, anterior: { fecha: '2026-11-02', horaInicio: '09:00' } })).toBe(false);
      await servicio.esperarReintentos();
      expect(canal.enviar).toHaveBeenCalledTimes(3);
      expect(repo.marcarFallida.mock.calls).toEqual([
        [15, 'ETIMEDOUT', { definitivo: false }],
        [15, 'ETIMEDOUT', { definitivo: false }],
        [15, 'ETIMEDOUT', { definitivo: true }],
      ]);
      expect(repo.marcarEnviada).not.toHaveBeenCalled();
      expect(esperas).toEqual([1000, 3000]);
    });

    test('la respuesta no espera los reintentos', async () => {
      const repo = repoSimulado();
      const canal = { canal: 'CORREO', enviar: jest.fn().mockRejectedValue(errSmtp()) };
      let soltar;
      const esperar = jest.fn(() => new Promise((r) => (soltar = r)));
      const servicio = crearNotificacionesService({ notificacionesRepo: repo, canal, esperar });
      expect(await servicio.enviar(15, 'CONFIRMACION', 'maria@ejemplo.com', datos)).toBe(false);
      // enviar() ya respondió aunque el reintento sigue esperando su turno.
      expect(canal.enviar).toHaveBeenCalledTimes(1);
      expect(esperar).toHaveBeenCalledWith(1000);
      soltar();
      esperar.mockResolvedValue();
      await servicio.esperarReintentos();
      expect(canal.enviar).toHaveBeenCalledTimes(3);
    });

    test('un error al componer el mensaje no se reintenta y queda FALLIDA', async () => {
      const { repo, canal, servicio } = preparar([]);
      expect(await servicio.enviar(15, 'TIPO_INEXISTENTE', 'maria@ejemplo.com', datos)).toBe(false);
      await servicio.esperarReintentos();
      expect(canal.enviar).not.toHaveBeenCalled();
      expect(repo.marcarFallida).toHaveBeenCalledWith(15, 'ERROR_ENVIO', { definitivo: true });
    });
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

describe('plantillaReprogramacion (CU-07 paso 8)', () => {
  const { plantillaReprogramacion } = require('../src/modules/notificaciones/plantillas/reprogramacion');
  const datos = {
    nombres: 'Ana <b>Ruiz</b>',
    codigo: 'CR-04821',
    servicio: 'Control Prenatal',
    fecha: '2026-11-12',
    horaInicio: '08:00',
    horaFin: '08:40',
    indicaciones: '',
    anterior: { fecha: '2026-11-10', horaInicio: '09:30' },
  };

  test('incluye el mismo código, el nuevo horario y el anterior', () => {
    const m = plantillaReprogramacion(datos);
    expect(m.asunto).toBe('Cita reprogramada CR-04821 – Clínica Rueda');
    expect(m.texto).toContain('Código de cita: CR-04821');
    expect(m.texto).toContain('jueves, 12 de noviembre de 2026');
    expect(m.texto).toContain('08:00 a 08:40');
    expect(m.texto).toContain('martes, 10 de noviembre de 2026, 09:30');
    expect(m.texto).toContain('No requiere preparación especial.');
  });

  test('escapa los valores en el HTML', () => {
    const m = plantillaReprogramacion(datos);
    expect(m.html).toContain('Ana &lt;b&gt;Ruiz&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Ruiz</b>');
  });

  test('NotificacionesService conoce el tipo REPROGRAMACION', async () => {
    const canal = { canal: 'CORREO', enviar: jest.fn().mockResolvedValue(undefined) };
    const repo = { marcarEnviada: jest.fn(), marcarFallida: jest.fn() };
    const s = crearNotificacionesService({ notificacionesRepo: repo, canal });
    await expect(s.enviar(3, 'REPROGRAMACION', 'ana@ejemplo.com', datos)).resolves.toBe(true);
    expect(canal.enviar).toHaveBeenCalledWith(expect.objectContaining({ asunto: 'Cita reprogramada CR-04821 – Clínica Rueda' }));
    expect(repo.marcarEnviada).toHaveBeenCalledWith(3);
  });
});
