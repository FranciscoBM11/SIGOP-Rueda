'use strict';

// Rutas de la Iteración 4 con servicios simulados, sin base de datos:
// resultados públicos (CU-08/CU-09), subir informe (CU-15, solo recepción) y
// disponibilidad (CU-16, solo la médica). Comprueba roles, token, multipart y
// formato de error.
const request = require('supertest');
const { crearApp } = require('../src/app');
const { ErrorNegocio } = require('../src/common/errores');
const { crearTokenCita } = require('../src/modules/seguridad/token-cita');

const SESIONES = {
  medica: { sesionId: 'A', usuarioId: 1, nombre: 'Dra. Rueda', rol: 'MEDICO' },
  recepcion: { sesionId: 'B', usuarioId: 2, nombre: 'José Lira', rol: 'RECEPCIONISTA' },
};
const COOKIE = { medica: 'sigop_sesion=medica', recepcion: 'sigop_sesion=recepcion' };
const PDF = Buffer.from('%PDF-1.4\nContenido ficticio\n%%EOF\n', 'latin1');
const tokenCita = crearTokenCita({ secreto: process.env.SECRETO_SESION });

const SEMANA = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  diaSemana: d,
  atiende: d <= 5,
  apertura: d <= 5 ? '08:00' : null,
  cierre: d <= 5 ? '16:00' : null,
  duracion: d <= 5 ? 40 : null,
}));

function serviciosSimulados() {
  return {
    tokenCita,
    authService: {
      verificarSesion: jest.fn(async (token) => {
        if (SESIONES[token]) return SESIONES[token];
        throw new ErrorNegocio('SESION_EXPIRADA', 'Tu sesión expiró. Inicia sesión de nuevo.', 401);
      }),
    },
    informesService: {
      consultar: jest.fn().mockResolvedValue({
        tokenCita: 'a.b.c',
        cita: { codigo: 'CR-04801', servicio: 'Ecografía Pélvica', fecha: '2026-11-04' },
        informes: [{ id: 31, nombre: 'informe.pdf', tamanoBytes: 1200, fechaCarga: '2026-11-04T16:00:00Z' }],
      }),
      descargar: jest.fn().mockResolvedValue({ nombre: 'eco_pelvica_CR-04801.pdf', contenido: PDF }),
      buscarPaciente: jest.fn().mockResolvedValue({ paciente: { nombres: 'Paciente Demo', cedula: '000-010190-0001A' }, citas: [] }),
      subir: jest.fn(async (codigo, archivo) => ({ id: 31, nombre: archivo.nombreOriginal, tamanoBytes: archivo.contenido.length, fechaCarga: '2026-11-04T16:00:00Z', cita: codigo })),
    },
    horariosService: {
      obtener: jest.fn().mockResolvedValue({ horarios: SEMANA, citasFueraDeHorario: [] }),
      guardar: jest.fn().mockResolvedValue({ horarios: SEMANA, citasFueraDeHorario: [] }),
    },
  };
}

function esErrorEstandar(body, codigo) {
  expect(Object.keys(body).sort()).toEqual(['codigo', 'detalles', 'mensaje']);
  expect(body.codigo).toBe(codigo);
}

// ---------------------------------------------------------------------------
describe('POST /api/v1/resultados/consulta (CU-08, CU-09)', () => {
  test('200 con token e informes; normaliza cédula y código; pasa la IP', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/resultados/consulta')
      .send({ cedula: ' 000-010190-0001a ', codigo: 'cr-04801' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.tokenCita).toBe('a.b.c');
    expect(s.informesService.consultar).toHaveBeenCalledWith({ cedula: '000-010190-0001A', codigo: 'CR-04801', ip: expect.any(String) });
  });

  test('400 DATOS_INVALIDOS con formato incorrecto o campos extra', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const r1 = await request(app).post('/api/v1/resultados/consulta').send({ cedula: '123', codigo: 'CR-1' });
    expect(r1.status).toBe(400);
    esErrorEstandar(r1.body, 'DATOS_INVALIDOS');
    const r2 = await request(app).post('/api/v1/resultados/consulta').send({ cedula: '000-010190-0001A', codigo: 'CR-04801', extra: 1 });
    expect(r2.status).toBe(400);
  });

  test('propaga ACCESO_DENEGADO (401) y ACCESO_BLOQUEADO (429)', async () => {
    for (const [codigo, http] of [['ACCESO_DENEGADO', 401], ['ACCESO_BLOQUEADO', 429]]) {
      const s = serviciosSimulados();
      s.informesService.consultar.mockRejectedValue(new ErrorNegocio(codigo, 'x', http));
      const res = await request(crearApp({ servicios: s })).post('/api/v1/resultados/consulta').send({ cedula: '000-010190-0001A', codigo: 'CR-04801' });
      expect(res.status).toBe(http);
      esErrorEstandar(res.body, codigo);
    }
  });
});

describe('GET /api/v1/resultados/:id/archivo (CU-09)', () => {
  const token = tokenCita.firmar({ citaId: 7, codigo: 'CR-04801' });

  test('200 application/pdf como descarga, sin caché; usa la cita del token', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .get('/api/v1/resultados/31/archivo')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const partes = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="eco_pelvica_CR-04801.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.equals(PDF)).toBe(true);
    expect(s.informesService.descargar).toHaveBeenCalledWith(31, 7);
  });

  test('401 sin token o con token inválido; el token nunca va en la URL', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const r1 = await request(app).get('/api/v1/resultados/31/archivo');
    expect(r1.status).toBe(401);
    esErrorEstandar(r1.body, 'TOKEN_REQUERIDO');
    const r2 = await request(app).get('/api/v1/resultados/31/archivo').set('Authorization', 'Bearer a.b.c');
    expect(r2.status).toBe(401);
    esErrorEstandar(r2.body, 'TOKEN_INVALIDO');
    const r3 = await request(app).get(`/api/v1/resultados/31/archivo?token=${token}`);
    expect(r3.status).toBe(401);
  });

  test('400 si el id no es un número', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .get('/api/v1/resultados/abc/archivo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('404 INFORME_NO_ENCONTRADO de otra cita', async () => {
    const s = serviciosSimulados();
    s.informesService.descargar.mockRejectedValue(new ErrorNegocio('INFORME_NO_ENCONTRADO', 'x', 404));
    const res = await request(crearApp({ servicios: s })).get('/api/v1/resultados/99/archivo').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    esErrorEstandar(res.body, 'INFORME_NO_ENCONTRADO');
  });
});

// ---------------------------------------------------------------------------
describe('POST /api/v1/admin/pacientes/busqueda (CU-15)', () => {
  test('200 para recepción; la cédula va en el cuerpo', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/admin/pacientes/busqueda')
      .set('Cookie', COOKIE.recepcion)
      .send({ cedula: '000-010190-0001a' });
    expect(res.status).toBe(200);
    expect(s.informesService.buscarPaciente).toHaveBeenCalledWith('000-010190-0001A');
  });

  test('403 para la médica y 401 sin sesión', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const r1 = await request(app).post('/api/v1/admin/pacientes/busqueda').set('Cookie', COOKIE.medica).send({ cedula: '000-010190-0001A' });
    expect(r1.status).toBe(403);
    esErrorEstandar(r1.body, 'ROL_NO_AUTORIZADO');
    const r2 = await request(app).post('/api/v1/admin/pacientes/busqueda').send({ cedula: '000-010190-0001A' });
    expect(r2.status).toBe(401);
  });
});

describe('POST /api/v1/admin/citas/:codigo/informes (CU-15)', () => {
  test('201 { informe } con multipart; pasa nombre, tipo, contenido y la sesión', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/admin/citas/cr-04801/informes')
      .set('Cookie', COOKIE.recepcion)
      .attach('archivo', PDF, { filename: 'ecografía.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.informe).toMatchObject({ id: 31, cita: 'CR-04801' });
    const [codigo, archivo, sesion] = s.informesService.subir.mock.calls[0];
    expect(codigo).toBe('CR-04801');
    expect(archivo).toEqual({ nombreOriginal: 'ecografía.pdf', tipo: 'application/pdf', contenido: PDF });
    expect(sesion).toMatchObject({ usuarioId: 2, rol: 'RECEPCIONISTA' });
  });

  test('403 para la médica: no recibe el archivo', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/admin/citas/CR-04801/informes')
      .set('Cookie', COOKIE.medica)
      .attach('archivo', PDF, { filename: 'informe.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(403);
    expect(s.informesService.subir).not.toHaveBeenCalled();
  });

  test('401 sin sesión', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/admin/citas/CR-04801/informes')
      .attach('archivo', PDF, { filename: 'informe.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(401);
  });

  test('400 ARCHIVO_REQUERIDO sin archivo; 400 ARCHIVO_INVALIDO con otro campo o dos archivos', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    const r1 = await request(app).post('/api/v1/admin/citas/CR-04801/informes').set('Cookie', COOKIE.recepcion);
    expect(r1.status).toBe(400);
    esErrorEstandar(r1.body, 'ARCHIVO_REQUERIDO');
    const r2 = await request(app)
      .post('/api/v1/admin/citas/CR-04801/informes')
      .set('Cookie', COOKIE.recepcion)
      .attach('otro', PDF, { filename: 'informe.pdf', contentType: 'application/pdf' });
    expect(r2.status).toBe(400);
    esErrorEstandar(r2.body, 'ARCHIVO_INVALIDO');
    const r3 = await request(app)
      .post('/api/v1/admin/citas/CR-04801/informes')
      .set('Cookie', COOKIE.recepcion)
      .attach('archivo', PDF, { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('archivo', PDF, { filename: 'b.pdf', contentType: 'application/pdf' });
    expect(r3.status).toBe(400);
  });

  test('422 ARCHIVO_DEMASIADO_GRANDE al pasar de 10 MB (RN-09), sin llegar al servicio', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s }))
      .post('/api/v1/admin/citas/CR-04801/informes')
      .set('Cookie', COOKIE.recepcion)
      .attach('archivo', Buffer.alloc(10 * 1024 * 1024 + 1, 0x20), { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    esErrorEstandar(res.body, 'ARCHIVO_DEMASIADO_GRANDE');
    expect(s.informesService.subir).not.toHaveBeenCalled();
  });

  test('400 si el código de la ruta no cumple ER-05', async () => {
    const res = await request(crearApp({ servicios: serviciosSimulados() }))
      .post('/api/v1/admin/citas/XX-1/informes')
      .set('Cookie', COOKIE.recepcion)
      .attach('archivo', PDF, { filename: 'informe.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('GET y PUT /api/v1/admin/disponibilidad (CU-16)', () => {
  test('GET 200 para la médica, con su id de usuario como médico', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).get('/api/v1/admin/disponibilidad').set('Cookie', COOKIE.medica);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ horarios: SEMANA, citasFueraDeHorario: [] });
    expect(s.horariosService.obtener).toHaveBeenCalledWith(1);
  });

  test('PUT 200 con los 7 días validados', async () => {
    const s = serviciosSimulados();
    const res = await request(crearApp({ servicios: s })).put('/api/v1/admin/disponibilidad').set('Cookie', COOKIE.medica).send({ horarios: SEMANA });
    expect(res.status).toBe(200);
    expect(s.horariosService.guardar).toHaveBeenCalledWith(1, SEMANA);
  });

  test('PUT 400 con valores inválidos (E1, RN-10) sin llamar al servicio', async () => {
    const s = serviciosSimulados();
    const malo = SEMANA.map((d) => (d.diaSemana === 1 ? { ...d, duracion: 60 } : d));
    const res = await request(crearApp({ servicios: s })).put('/api/v1/admin/disponibilidad').set('Cookie', COOKIE.medica).send({ horarios: malo });
    expect(res.status).toBe(400);
    esErrorEstandar(res.body, 'DATOS_INVALIDOS');
    expect(res.body.detalles[0].campo).toBe('horarios.0.duracion');
    expect(s.horariosService.guardar).not.toHaveBeenCalled();
  });

  test('403 para recepción (GET y PUT) y 401 sin sesión', async () => {
    const app = crearApp({ servicios: serviciosSimulados() });
    expect((await request(app).get('/api/v1/admin/disponibilidad').set('Cookie', COOKIE.recepcion)).status).toBe(403);
    expect((await request(app).put('/api/v1/admin/disponibilidad').set('Cookie', COOKIE.recepcion).send({ horarios: SEMANA })).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/disponibilidad')).status).toBe(401);
  });
});
