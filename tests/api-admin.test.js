'use strict';

// Rutas del panel (Iteración 3) con servicios simulados, sin base de datos:
// sesión (CU-10), agenda (CU-11), estados (CU-12), gestión desde recepción
// (CU-13) y triaje (CU-14). Comprueba cookie, roles y formato de error.
const request = require('supertest');
const { crearApp } = require('../src/app');
const { ErrorNegocio } = require('../src/common/errores');

const SESIONES = {
  medica: { sesionId: 'A', usuarioId: 1, nombre: 'Dra. Rueda', rol: 'MEDICO' },
  recepcion: { sesionId: 'B', usuarioId: 2, nombre: 'José Lira', rol: 'RECEPCIONISTA' },
};
const COOKIE = { medica: 'sigop_sesion=medica', recepcion: 'sigop_sesion=recepcion' };

const item = {
  codigo: 'CR-04821',
  estado: 'CONFIRMADA',
  fecha: '2026-11-09',
  horaInicio: '11:00',
  horaFin: '11:40',
  paciente: 'María José López',
  cedula: '001-150390-0012K',
  servicioId: 2,
  servicio: 'Control Prenatal',
  transiciones: ['EN_ESPERA', 'CANCELADA'],
  puedeReprogramar: true,
};

function serviciosSimulados() {
  return {
    authService: {
      iniciarSesion: jest.fn().mockResolvedValue({ token: 'tok.en.firmado', nombre: 'Dra. Rueda', rol: 'MEDICO' }),
      verificarSesion: jest.fn(async (token) => {
        if (SESIONES[token]) return SESIONES[token];
        throw new ErrorNegocio('SESION_EXPIRADA', 'Tu sesión expiró. Inicia sesión de nuevo.', 401);
      }),
      cerrarSesion: jest.fn(),
    },
    citasService: {
      agenda: jest.fn().mockResolvedValue([item]),
      transiciones: jest.fn().mockResolvedValue(['EN_ESPERA', 'CANCELADA']),
      cambiarEstado: jest.fn().mockResolvedValue({ cita: { ...item, estado: 'EN_ESPERA' } }),
      cancelarPorPersonal: jest.fn().mockResolvedValue({ cita: { ...item, estado: 'CANCELADA' } }),
      reprogramarPorPersonal: jest.fn().mockResolvedValue({ cita: { ...item, fecha: '2026-11-12' }, correoEnviado: true }),
      obtenerItemAgenda: jest.fn().mockResolvedValue({ id: 7, item }),
    },
    triajeService: {
      consultarFicha: jest.fn().mockResolvedValue({
        fechaRegistro: '2026-11-05T15:00:00Z',
        respuestas: [{ pregunta: '¿Presenta sangrado?', tipo: 'SI_NO', valor: 'NO' }],
      }),
    },
  };
}

function esErrorEstandar(body, codigo) {
  expect(Object.keys(body).sort()).toEqual(['codigo', 'detalles', 'mensaje']);
  expect(body.codigo).toBe(codigo);
}

describe('POST /api/v1/admin/sesion (CU-10)', () => {
  test('200 { nombre, rol } y cookie HttpOnly, SameSite=Strict, limitada a /api/v1/admin', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/admin/sesion')
      .send({ usuario: '  Dra.Rueda ', contrasena: 'Clinica2026' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nombre: 'Dra. Rueda', rol: 'MEDICO' });
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^sigop_sesion=tok\.en\.firmado;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/admin/);
    // El usuario se normaliza a minúsculas (ER-06) y se pasa la IP.
    expect(s.authService.iniciarSesion).toHaveBeenCalledWith({ usuario: 'dra.rueda', contrasena: 'Clinica2026', ip: expect.any(String) });
  });

  test('la respuesta nunca incluye la contraseña ni el token', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/admin/sesion')
      .send({ usuario: 'dra.rueda', contrasena: 'Clinica2026' });
    expect(JSON.stringify(res.body)).not.toMatch(/Clinica2026|tok\.en/);
  });

  test('400 DATOS_INVALIDOS si faltan datos o hay campos extra; no llama al servicio', async () => {
    const s = serviciosSimulados();
    const app = crearApp({ servicios: s });
    const r1 = await request(app).post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda' });
    esErrorEstandar(r1.body, 'DATOS_INVALIDOS');
    const r2 = await request(app).post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda', contrasena: 'x', rol: 'MEDICO' });
    expect(r2.status).toBe(400);
    const r3 = await request(app).post('/api/v1/admin/sesion').send({ usuario: "a' OR 1=1 --", contrasena: 'x' });
    expect(r3.status).toBe(400);
    expect(s.authService.iniciarSesion).not.toHaveBeenCalled();
  });

  test.each([
    ['CREDENCIALES_INVALIDAS', 401],
    ['CUENTA_BLOQUEADA', 423],
  ])('%s → %i sin cookie', async (codigo, http) => {
    const s = serviciosSimulados();
    s.authService.iniciarSesion.mockRejectedValue(new ErrorNegocio(codigo, 'mensaje', http));
    const res = await request(crearApp({ servicios: s })).post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda', contrasena: 'mala' });
    expect(res.status).toBe(http);
    esErrorEstandar(res.body, codigo);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('límite de 20 peticiones por minuto por IP → 429', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    for (let i = 0; i < 20; i += 1) {
      await request(app).post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda', contrasena: 'x' });
    }
    const res = await request(app).post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda', contrasena: 'x' });
    expect(res.status).toBe(429);
    esErrorEstandar(res.body, 'DEMASIADAS_PETICIONES');
  });
});

describe('GET y DELETE /api/v1/admin/sesion', () => {
  test('GET con sesión → { nombre, rol }', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/admin/sesion').set('Cookie', COOKIE.recepcion);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nombre: 'José Lira', rol: 'RECEPCIONISTA' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('GET sin cookie → 401 SESION_REQUERIDA', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/admin/sesion');
    expect(res.status).toBe(401);
    esErrorEstandar(res.body, 'SESION_REQUERIDA');
  });

  test('GET con sesión vencida → 401 SESION_EXPIRADA y borra la cookie (CU-10 A2)', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/admin/sesion').set('Cookie', 'otra=1; sigop_sesion=vencida');
    expect(res.status).toBe(401);
    esErrorEstandar(res.body, 'SESION_EXPIRADA');
    expect(res.headers['set-cookie'][0]).toMatch(/^sigop_sesion=;.*Expires=Thu, 01 Jan 1970/);
  });

  test('DELETE revoca la sesión y borra la cookie (CU-10 A1) → 204', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).delete('/api/v1/admin/sesion').set('Cookie', COOKIE.medica);
    expect(res.status).toBe(204);
    expect(s.authService.cerrarSesion).toHaveBeenCalledWith('medica');
    expect(res.headers['set-cookie'][0]).toMatch(/^sigop_sesion=;/);
  });

  test('DELETE sin cookie también responde 204', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).delete('/api/v1/admin/sesion');
    expect(res.status).toBe(204);
    expect(s.authService.cerrarSesion).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/admin/citas/agenda (CU-11)', () => {
  test('sin fecha usa hoy (Managua) y pasa el rol', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/agenda').set('Cookie', COOKIE.recepcion);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([item]);
    expect(s.citasService.agenda).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 'RECEPCIONISTA');
  });

  test('con fecha', async () => {
    const s = serviciosSimulados();
    await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/agenda?fecha=2026-11-10').set('Cookie', COOKIE.medica);
    expect(s.citasService.agenda).toHaveBeenCalledWith('2026-11-10', 'MEDICO');
  });

  test('fecha inválida o parámetros extra → 400', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const r1 = await request(app).get('/api/v1/admin/citas/agenda?fecha=2026-02-30').set('Cookie', COOKIE.medica);
    esErrorEstandar(r1.body, 'DATOS_INVALIDOS');
    const r2 = await request(app).get('/api/v1/admin/citas/agenda?fecha=2026-11-10&cedula=x').set('Cookie', COOKIE.medica);
    expect(r2.status).toBe(400);
  });

  test('E2: sin sesión → 401 y no consulta', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/agenda');
    expect(res.status).toBe(401);
    expect(s.citasService.agenda).not.toHaveBeenCalled();
  });
});

describe('CU-12 transiciones y estado', () => {
  test('GET transiciones → lista de estados', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/cr-04821/transiciones').set('Cookie', COOKIE.recepcion);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['EN_ESPERA', 'CANCELADA']);
    expect(s.citasService.transiciones).toHaveBeenCalledWith('CR-04821', 'RECEPCIONISTA');
  });

  test('PATCH estado → 200 con la cita; pasa la sesión completa (usuario para RF-17)', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .patch('/api/v1/admin/citas/CR-04821/estado')
      .set('Cookie', COOKIE.recepcion)
      .send({ estado: 'EN_ESPERA' });
    expect(res.status).toBe(200);
    expect(res.body.cita.estado).toBe('EN_ESPERA');
    expect(s.citasService.cambiarEstado).toHaveBeenCalledWith('CR-04821', 'EN_ESPERA', SESIONES.recepcion);
  });

  test('PATCH estado CONFIRMADA o desconocido → 400', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    for (const estado of ['CONFIRMADA', 'PERDIDA', '']) {
      const res = await request(app).patch('/api/v1/admin/citas/CR-04821/estado').set('Cookie', COOKIE.medica).send({ estado });
      expect(res.status).toBe(400);
    }
  });

  test('código con formato inválido → 400 sin llamar al servicio', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).patch('/api/v1/admin/citas/CR-1/estado').set('Cookie', COOKIE.medica).send({ estado: 'ATENDIDA' });
    expect(res.status).toBe(400);
    expect(s.citasService.cambiarEstado).not.toHaveBeenCalled();
  });

  test.each([
    ['ROL_NO_AUTORIZADO', 403],
    ['TRANSICION_NO_PERMITIDA', 403],
    ['CITA_NO_ENCONTRADA', 404],
  ])('%s del servicio → %i', async (codigo, http) => {
    const s = serviciosSimulados();
    s.citasService.cambiarEstado.mockRejectedValue(new ErrorNegocio(codigo, 'm', http));
    const res = await request(crearApp({ servicios: s })).patch('/api/v1/admin/citas/CR-04821/estado').set('Cookie', COOKIE.recepcion).send({ estado: 'ATENDIDA' });
    expect(res.status).toBe(http);
    esErrorEstandar(res.body, codigo);
  });
});

describe('CU-13 cancelar y reprogramar (solo recepción)', () => {
  test('POST cancelacion → 200', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).post('/api/v1/admin/citas/CR-04821/cancelacion').set('Cookie', COOKIE.recepcion);
    expect(res.status).toBe(200);
    expect(res.body.cita.estado).toBe('CANCELADA');
    expect(s.citasService.cancelarPorPersonal).toHaveBeenCalledWith('CR-04821', SESIONES.recepcion);
  });

  test('PATCH reprogramar → 200 con correoEnviado', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).patch('/api/v1/admin/citas/CR-04821').set('Cookie', COOKIE.recepcion).send({ turnoId: 41 });
    expect(res.status).toBe(200);
    expect(res.body.correoEnviado).toBe(true);
    expect(s.citasService.reprogramarPorPersonal).toHaveBeenCalledWith('CR-04821', 41, SESIONES.recepcion);
  });

  test('PATCH reprogramar sin turnoId → 400', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).patch('/api/v1/admin/citas/CR-04821').set('Cookie', COOKIE.recepcion).send({});
    expect(res.status).toBe(400);
  });

  test('la médica no puede cancelar ni reprogramar → 403 ROL_NO_AUTORIZADO', async () => {
    const s = serviciosSimulados();
    const app = crearApp({ servicios: s });
    const r1 = await request(app).post('/api/v1/admin/citas/CR-04821/cancelacion').set('Cookie', COOKIE.medica);
    esErrorEstandar(r1.body, 'ROL_NO_AUTORIZADO');
    expect(r1.status).toBe(403);
    const r2 = await request(app).patch('/api/v1/admin/citas/CR-04821').set('Cookie', COOKIE.medica).send({ turnoId: 41 });
    expect(r2.status).toBe(403);
    expect(s.citasService.cancelarPorPersonal).not.toHaveBeenCalled();
    expect(s.citasService.reprogramarPorPersonal).not.toHaveBeenCalled();
  });

  test('sin sesión → 401', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).post('/api/v1/admin/citas/CR-04821/cancelacion');
    expect(res.status).toBe(401);
  });

  test('el token de cita de la paciente no sirve en el panel', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/admin/citas/CR-04821/cancelacion')
      .set('Authorization', 'Bearer a.b.c');
    expect(res.status).toBe(401);
    esErrorEstandar(res.body, 'SESION_REQUERIDA');
  });
});

describe('GET /api/v1/admin/citas/:codigo/triaje (CU-14, RN-16)', () => {
  test('médica → 200 con la cita y las respuestas', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/CR-04821/triaje').set('Cookie', COOKIE.medica);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      cita: item,
      fechaRegistro: '2026-11-05T15:00:00Z',
      respuestas: [{ pregunta: '¿Presenta sangrado?', tipo: 'SI_NO', valor: 'NO' }],
    });
    expect(s.citasService.obtenerItemAgenda).toHaveBeenCalledWith('CR-04821', 'MEDICO');
    expect(s.triajeService.consultarFicha).toHaveBeenCalledWith(7);
  });

  test('E2 (RN-16): la recepción → 403 y no se descifra nada', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/CR-04821/triaje').set('Cookie', COOKIE.recepcion);
    expect(res.status).toBe(403);
    esErrorEstandar(res.body, 'ROL_NO_AUTORIZADO');
    expect(s.triajeService.consultarFicha).not.toHaveBeenCalled();
  });

  test('E1: sin ficha → 404 FICHA_NO_ENCONTRADA', async () => {
    const s = serviciosSimulados();
    s.triajeService.consultarFicha.mockResolvedValue(null);
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/CR-04821/triaje').set('Cookie', COOKIE.medica);
    expect(res.status).toBe(404);
    esErrorEstandar(res.body, 'FICHA_NO_ENCONTRADA');
  });

  test('cita inexistente → 404 CITA_NO_ENCONTRADA', async () => {
    const s = serviciosSimulados();
    s.citasService.obtenerItemAgenda.mockRejectedValue(new ErrorNegocio('CITA_NO_ENCONTRADA', 'm', 404));
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/citas/CR-99999/triaje').set('Cookie', COOKIE.medica);
    expect(res.status).toBe(404);
    esErrorEstandar(res.body, 'CITA_NO_ENCONTRADA');
  });

  test('E3: sin sesión → 401', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/admin/citas/CR-04821/triaje');
    expect(res.status).toBe(401);
  });
});

test('una ruta /admin inexistente → 404 RUTA_NO_ENCONTRADA', async () => {
  const res = await request(crearApp({ servicios: serviciosSimulados() })).get('/api/v1/admin/usuarios').set('Cookie', COOKIE.medica);
  expect(res.status).toBe(404);
  esErrorEstandar(res.body, 'RUTA_NO_ENCONTRADA');
});
