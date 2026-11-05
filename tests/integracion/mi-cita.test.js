'use strict';

// Integración de la Iteración 2 contra SQL Server (base SIGOP con 02_datos_demo.sql):
// CU-08 (acceso y bloqueo RN-15), CU-06 (cancelar, RN-06/RN-07) y CU-07
// (reprogramar, RN-01/RN-07). Crea pacientes, citas e intentos ficticios y
// los borra al final. Ejecutar con: npm run test:bd
const request = require('supertest');
const { crearApp } = require('../../src/app');
const { obtenerPool, cerrarPool, sql } = require('../../src/config/base-datos');
const { ahoraManagua, sumarDias } = require('../../src/common/fechas');

// Cédulas ficticias reservadas para estas pruebas (no son personas reales).
const CEDULAS = ['999-020200-0001Z', '999-020200-0002Z', '999-020200-0003Z', '999-020200-0004Z'];

const app = crearApp();
let pool;
let papanicolaou;

async function limpiar() {
  const r = pool.request();
  CEDULAS.forEach((c, i) => r.input(`c${i}`, sql.VarChar(16), c));
  const lista = CEDULAS.map((_, i) => `@c${i}`).join(',');
  await r.query(
    `DELETE FROM dbo.citas WHERE paciente_id IN (SELECT id FROM dbo.pacientes WHERE cedula IN (${lista}));
     DELETE FROM dbo.pacientes WHERE cedula IN (${lista});
     DELETE FROM dbo.intentos_acceso WHERE cedula_ingresada IN (${lista});`,
  );
}

async function turnosLibres() {
  const manana = sumarDias(ahoraManagua().fecha, 1);
  const res = await request(app).get(`/api/v1/turnos?servicioId=${papanicolaou.id}&desde=${manana}&hasta=${sumarDias(manana, 20)}`);
  expect(res.status).toBe(200);
  return res.body.filter((t) => t.disponible);
}

async function agendar(cedula, turnoId) {
  const res = await request(app)
    .post('/api/v1/citas')
    .send({
      servicioId: papanicolaou.id,
      turnoId,
      paciente: { cedula, nombres: 'Paciente De Prueba', telefono: '88000000', correo: 'prueba@ejemplo.com' },
      consentimiento: true,
      respuestas: await respuestasMinimas(),
    });
  expect(res.status).toBe(201);
  return res.body.codigo;
}

/** Respuestas válidas para las preguntas obligatorias del servicio. */
async function respuestasMinimas() {
  const res = await request(app).get(`/api/v1/servicios/${papanicolaou.id}/preguntas`);
  const valorPorTipo = { TEXTO: 'Ninguno', SI_NO: 'NO', NUMERO: '1', FECHA: sumarDias(ahoraManagua().fecha, -20) };
  return res.body
    .filter((p) => p.obligatoria)
    .map((p) => ({ preguntaId: p.id, valor: p.tipo === 'SELECCION' ? p.opciones[0].etiqueta : valorPorTipo[p.tipo] }));
}

const acceso = (cedula, codigo) => request(app).post('/api/v1/citas/acceso').send({ cedula, codigo });

async function filaCita(codigo) {
  const r = await pool
    .request()
    .input('codigo', sql.Char(8), codigo)
    .query('SELECT id, estado, turno_id, reprogramaciones FROM dbo.citas WHERE codigo = @codigo');
  return r.recordset[0];
}

async function cambios(citaId) {
  const r = await pool
    .request()
    .input('id', sql.Int, citaId)
    .query('SELECT estado_anterior, estado_nuevo, origen FROM dbo.cambios_estado_cita WHERE cita_id = @id ORDER BY id');
  return r.recordset;
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

describe('CU-08 acceso con cédula y código', () => {
  test('datos correctos → 200 con la cita y un token; queda un intento exitoso con IP en hash', async () => {
    const [turno] = await turnosLibres();
    const codigo = await agendar(CEDULAS[0], turno.id);

    const res = await acceso(CEDULAS[0].toLowerCase(), codigo.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.cita).toMatchObject({ codigo, estado: 'CONFIRMADA', servicioId: papanicolaou.id, fecha: turno.fecha, horaInicio: turno.horaInicio });
    expect(typeof res.body.tokenCita).toBe('string');

    const r = await pool
      .request()
      .input('c', sql.VarChar(16), CEDULAS[0])
      .query('SELECT exitoso, ip_hash FROM dbo.intentos_acceso WHERE cedula_ingresada = @c');
    expect(r.recordset).toHaveLength(1);
    expect(r.recordset[0].exitoso).toBe(true);
    expect(r.recordset[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('RN-04: cédula de otra persona con un código válido → 401 genérico', async () => {
    const [turno] = await turnosLibres();
    const codigo = await agendar(CEDULAS[1], turno.id);
    const res = await acceso(CEDULAS[2], codigo);
    expect(res.status).toBe(401);
    expect(res.body.codigo).toBe('ACCESO_DENEGADO');
  });

  test('RN-15: el 5.º fallo bloquea y luego ni los datos correctos entran', async () => {
    const [turno] = await turnosLibres();
    const codigo = await agendar(CEDULAS[3], turno.id);
    for (let i = 1; i <= 4; i += 1) {
      const r = await acceso(CEDULAS[3], 'CR-00000');
      expect(r.body.codigo).toBe('ACCESO_DENEGADO');
    }
    const quinto = await acceso(CEDULAS[3], 'CR-00000');
    expect(quinto.status).toBe(429);
    expect(quinto.body.codigo).toBe('ACCESO_BLOQUEADO');

    const correcto = await acceso(CEDULAS[3], codigo);
    expect(correcto.status).toBe(429);
    expect(correcto.body.mensaje).toMatch(/1[45] minutos/);
  });
});

describe('CU-06 cancelar y CU-07 reprogramar', () => {
  test('reprogramar: mismo código, turno nuevo ocupado, anterior libre (RN-07), cambio registrado', async () => {
    await limpiar();
    const [t1, t2] = await turnosLibres();
    const codigo = await agendar(CEDULAS[0], t1.id);
    const { body } = await acceso(CEDULAS[0], codigo);

    const res = await request(app).patch(`/api/v1/citas/${codigo}`).set('Authorization', `Bearer ${body.tokenCita}`).send({ turnoId: t2.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ codigo, nuevoHorario: { fecha: t2.fecha, horaInicio: t2.horaInicio }, correoEnviado: true });

    const fila = await filaCita(codigo);
    expect(fila).toMatchObject({ estado: 'CONFIRMADA', turno_id: t2.id, reprogramaciones: 1 });
    expect((await cambios(fila.id)).at(-1)).toEqual({ estado_anterior: 'CONFIRMADA', estado_nuevo: 'CONFIRMADA', origen: 'PACIENTE' });

    const libres = await turnosLibres();
    expect(libres.some((t) => t.id === t1.id)).toBe(true);
    expect(libres.some((t) => t.id === t2.id)).toBe(false);

    const n = await pool.request().input('id', sql.Int, fila.id)
      .query("SELECT COUNT(*) AS n FROM dbo.notificaciones WHERE cita_id = @id AND tipo = 'REPROGRAMACION' AND estado_envio = 'ENVIADA'");
    expect(n.recordset[0].n).toBe(1);
  });

  test('RN-01: no se puede reprogramar a un turno con cita activa', async () => {
    const [t1, t2] = await turnosLibres();
    const codigoA = await agendar(CEDULAS[1], t1.id);
    await agendar(CEDULAS[2], t2.id);
    const { body } = await acceso(CEDULAS[1], codigoA);
    const res = await request(app).patch(`/api/v1/citas/${codigoA}`).set('Authorization', `Bearer ${body.tokenCita}`).send({ turnoId: t2.id });
    expect(res.status).toBe(409);
    expect(res.body.codigo).toBe('TURNO_OCUPADO');
    expect((await filaCita(codigoA)).turno_id).toBe(t1.id);
  });

  test('cancelar: Confirmada → Cancelada, turno libre; no se puede volver a cancelar ni acceder (409)', async () => {
    await limpiar();
    const [turno] = await turnosLibres();
    const codigo = await agendar(CEDULAS[0], turno.id);
    const { body } = await acceso(CEDULAS[0], codigo);
    const auth = `Bearer ${body.tokenCita}`;

    const res = await request(app).post(`/api/v1/citas/${codigo}/cancelacion`).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.cita.estado).toBe('CANCELADA');

    const fila = await filaCita(codigo);
    expect(fila.estado).toBe('CANCELADA');
    expect((await cambios(fila.id)).at(-1)).toEqual({ estado_anterior: 'CONFIRMADA', estado_nuevo: 'CANCELADA', origen: 'PACIENTE' });
    expect((await turnosLibres()).some((t) => t.id === turno.id)).toBe(true);

    const otraVez = await request(app).post(`/api/v1/citas/${codigo}/cancelacion`).set('Authorization', auth);
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.codigo).toBe('CITA_NO_MODIFICABLE');

    const reacceso = await acceso(CEDULAS[0], codigo);
    expect(reacceso.status).toBe(409);
    expect(reacceso.body.codigo).toBe('CITA_NO_MODIFICABLE');
  });

  test('el token de una cita no sirve para otra (403)', async () => {
    const [t1, t2] = await turnosLibres();
    const codigoA = await agendar(CEDULAS[1], t1.id);
    const codigoB = await agendar(CEDULAS[2], t2.id);
    const { body } = await acceso(CEDULAS[1], codigoA);
    const res = await request(app).post(`/api/v1/citas/${codigoB}/cancelacion`).set('Authorization', `Bearer ${body.tokenCita}`);
    expect(res.status).toBe(403);
    expect((await filaCita(codigoB)).estado).toBe('CONFIRMADA');
  });
});
