'use strict';

// Integración de punta a punta de la Iteración 1 contra SQL Server (base SIGOP
// con 02_datos_demo.sql). Crea pacientes y citas ficticias y las borra al final.
// Ejecutar con: npm run test:bd
const request = require('supertest');
const { crearApp } = require('../../src/app');
const { obtenerPool, cerrarPool, sql } = require('../../src/config/base-datos');
const { descifrarTexto } = require('../../src/common/cifrado');
const { ahoraManagua, sumarDias } = require('../../src/common/fechas');

// Cédulas ficticias reservadas para estas pruebas (no son personas reales).
const CEDULAS = ['999-010100-0001Z', '999-010100-0002Z', '999-010100-0003Z'];

const app = crearApp();
let pool;
let papanicolaou;

async function limpiar() {
  const r = pool.request();
  CEDULAS.forEach((c, i) => r.input(`c${i}`, sql.VarChar(16), c));
  const lista = CEDULAS.map((_, i) => `@c${i}`).join(',');
  await r.query(
    `DELETE FROM dbo.citas WHERE paciente_id IN (SELECT id FROM dbo.pacientes WHERE cedula IN (${lista}));
     DELETE FROM dbo.pacientes WHERE cedula IN (${lista});`,
  );
}

/** Turnos libres desde mañana (evita depender de la hora actual). */
async function turnosLibres() {
  const manana = sumarDias(ahoraManagua().fecha, 1);
  const res = await request(app).get(`/api/v1/turnos?servicioId=${papanicolaou.id}&desde=${manana}&hasta=${sumarDias(manana, 20)}`);
  expect(res.status).toBe(200);
  return res.body.filter((t) => t.disponible);
}

async function preguntas() {
  const res = await request(app).get(`/api/v1/servicios/${papanicolaou.id}/preguntas`);
  return res.body;
}

function cuerpo(turnoId, cedula, extra = {}) {
  return {
    servicioId: papanicolaou.id,
    turnoId,
    paciente: { cedula, nombres: 'Paciente De Prueba', telefono: '88000000', correo: 'prueba@ejemplo.com' },
    consentimiento: true,
    respuestas: [],
    ...extra,
  };
}

beforeAll(async () => {
  pool = await obtenerPool();
  await limpiar();
  const res = await request(app).get('/api/v1/servicios');
  papanicolaou = res.body.find((s) => s.nombre === 'Papanicolaou');
});

afterAll(async () => {
  await limpiar();
  await cerrarPool();
});

test('catálogo: 4 servicios de demostración con preguntas ordenadas (RN-08)', async () => {
  const res = await request(app).get('/api/v1/servicios');
  expect(res.body).toHaveLength(4);
  const p = await preguntas();
  expect(p.map((x) => x.tipo)).toEqual(['FECHA', 'SI_NO', 'SELECCION']);
  expect(p[2].opciones.map((o) => o.etiqueta)).toContain('Pastillas');
});

test('calculadora: devuelve estudios del trimestre desde la base', async () => {
  const fum = sumarDias(ahoraManagua().fecha, -100); // 14 semanas → 2.º trimestre
  const res = await request(app).post('/api/v1/calculadora/fpp').send({ fum });
  expect(res.status).toBe(200);
  expect(res.body.trimestre).toBe(2);
  expect(res.body.estudios.length).toBeGreaterThan(0);
});

/** Día ISO de una fecha 'AAAA-MM-DD': 1 = lunes … 7 = domingo (igual que horarios_laborales.dia_semana). */
const diaSemanaIso = (fecha) => ((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

test('turnos: solo en los días laborales configurados, nunca en domingo ni en días no laborales (RN-10)', async () => {
  // Días laborales tal como están configurados AHORA en la disponibilidad (CU-16), no
  // días fijos: el seed trae lunes a viernes, pero la médica puede activar el sábado.
  const r = await pool.request().query('SELECT DISTINCT dia_semana FROM dbo.horarios_laborales WHERE activo = 1');
  const laborales = new Set(r.recordset.map((f) => f.dia_semana));
  expect(laborales.size).toBeGreaterThan(0);

  const libres = await turnosLibres();
  expect(libres.length).toBeGreaterThan(0);
  for (const t of libres) {
    const dia = diaSemanaIso(t.fecha);
    expect(dia).not.toBe(7); // la clínica no atiende domingo
    expect(laborales).toContain(dia); // nunca en un día no laboral (inactivo o sin horario)
  }
});

test('agendar de punta a punta: cita, historial, ficha cifrada y notificación (CU-03, CU-04, CU-05)', async () => {
  const [turno] = await turnosLibres();
  const p = await preguntas();
  const respuestas = [
    { preguntaId: p[0].id, valor: '2026-10-01' },
    { preguntaId: p[1].id, valor: 'NO' },
    { preguntaId: p[2].id, valor: 'Pastillas' },
  ];
  const res = await request(app).post('/api/v1/citas').send(cuerpo(turno.id, CEDULAS[0], { respuestas }));
  expect(res.status).toBe(201);
  expect(res.body.codigo).toMatch(/^CR-\d{5}$/);
  expect(res.body.correoEnviado).toBe(true); // canal simulado

  const r = await pool
    .request()
    .input('codigo', sql.Char(8), res.body.codigo)
    .query(
      `SELECT c.id, c.estado, c.consentimiento_aceptado, c.consentimiento_version,
              (SELECT COUNT(*) FROM dbo.cambios_estado_cita WHERE cita_id = c.id AND estado_nuevo = 'CONFIRMADA') AS cambios,
              (SELECT estado_envio FROM dbo.notificaciones WHERE cita_id = c.id) AS notificacion
         FROM dbo.citas c WHERE c.codigo = @codigo`,
    );
  const cita = r.recordset[0];
  expect(cita).toMatchObject({ estado: 'CONFIRMADA', consentimiento_aceptado: true, consentimiento_version: 'v1.0', cambios: 1, notificacion: 'ENVIADA' });

  const rr = await pool
    .request()
    .input('citaId', sql.Int, cita.id)
    .query(
      `SELECT r.pregunta_id, r.valor_cifrado FROM dbo.respuestas_triaje r
         JOIN dbo.fichas_triaje f ON f.id = r.ficha_id WHERE f.cita_id = @citaId ORDER BY r.pregunta_id`,
    );
  expect(rr.recordset.map((x) => descifrarTexto(x.valor_cifrado))).toEqual(['2026-10-01', 'NO', 'Pastillas']);

  // El turno ahora aparece ocupado.
  const despues = await request(app).get(`/api/v1/turnos?servicioId=${papanicolaou.id}&desde=${turno.fecha}&hasta=${turno.fecha}`);
  expect(despues.body.find((t) => t.id === turno.id).disponible).toBe(false);
});

test('RN-01: dos reservas simultáneas del mismo turno → una 201 y otra 409', async () => {
  const [turno] = await turnosLibres();
  const p = await preguntas();
  const respuestas = [
    { preguntaId: p[0].id, valor: '2026-10-01' },
    { preguntaId: p[1].id, valor: 'SI' },
  ];
  const [a, b] = await Promise.all([
    request(app).post('/api/v1/citas').send(cuerpo(turno.id, CEDULAS[1], { respuestas })),
    request(app).post('/api/v1/citas').send(cuerpo(turno.id, CEDULAS[2], { respuestas })),
  ]);
  expect([a.status, b.status].sort()).toEqual([201, 409]);
  expect([a.body.codigo, b.body.codigo]).toContain('TURNO_OCUPADO');
});

test('A2: misma cédula reutiliza la paciente y actualiza teléfono y correo', async () => {
  const [turno] = await turnosLibres();
  const p = await preguntas();
  const respuestas = [
    { preguntaId: p[0].id, valor: '2026-10-01' },
    { preguntaId: p[1].id, valor: 'SI' },
  ];
  const datos = cuerpo(turno.id, CEDULAS[0], { respuestas });
  datos.paciente.telefono = '77000000';
  datos.paciente.correo = 'nuevo@ejemplo.com';
  expect((await request(app).post('/api/v1/citas').send(datos)).status).toBe(201);

  const r = await pool.request().input('c', sql.VarChar(16), CEDULAS[0]).query('SELECT telefono, correo FROM dbo.pacientes WHERE cedula = @c');
  expect(r.recordset).toEqual([{ telefono: '77000000', correo: 'nuevo@ejemplo.com' }]);
});

test('RN-05 y CU-04 E1: sin consentimiento o con triaje incompleto no se guarda nada', async () => {
  const [turno] = await turnosLibres();
  const sinConsentimiento = await request(app).post('/api/v1/citas').send(cuerpo(turno.id, CEDULAS[2], { consentimiento: false }));
  expect(sinConsentimiento.status).toBe(400);
  const sinTriaje = await request(app).post('/api/v1/citas').send(cuerpo(turno.id, CEDULAS[2]));
  expect(sinTriaje.status).toBe(400);
  expect(sinTriaje.body.codigo).toBe('TRIAJE_INVALIDO');

  const r = await pool
    .request()
    .input('t', sql.Int, turno.id)
    .query(`SELECT COUNT(*) AS citas FROM dbo.citas WHERE turno_id = @t AND estado <> 'CANCELADA'`);
  expect(r.recordset[0].citas).toBe(0);
});
