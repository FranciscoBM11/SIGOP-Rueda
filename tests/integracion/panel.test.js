'use strict';

// Integración de la Iteración 3 contra SQL Server (base SIGOP con 02_datos_demo.sql):
// CU-10 (sesión real con bcrypt, cookie y revocación; bloqueo RN-12 con un
// usuario temporal), CU-11 agenda, CU-12 estados (RN-06, RN-11, RF-17),
// CU-13 gestión desde recepción (RN-07) y CU-14 triaje (RN-14, RN-16).
// Crea datos ficticios y los borra al final. Ejecutar con: npm run test:bd
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { crearApp } = require('../../src/app');
const { obtenerPool, cerrarPool, sql } = require('../../src/config/base-datos');
const { ahoraManagua, sumarDias } = require('../../src/common/fechas');

// Datos reservados para estas pruebas (no son personas reales).
const CEDULA = '999-030300-0001Z';
const USUARIO_TEMPORAL = 'prueba.bloqueo';
const CLAVE_TEMPORAL = 'Prueba2026';

const app = crearApp();
let pool;
let papanicolaou;
let ids;

async function limpiar() {
  await pool
    .request()
    .input('cedula', sql.VarChar(16), CEDULA)
    .input('usuario', sql.VarChar(30), USUARIO_TEMPORAL)
    .query(
      `DELETE FROM dbo.citas WHERE paciente_id IN (SELECT id FROM dbo.pacientes WHERE cedula = @cedula);
       DELETE FROM dbo.pacientes WHERE cedula = @cedula;
       DELETE FROM dbo.sesiones WHERE usuario_id IN (SELECT id FROM dbo.usuarios WHERE usuario = @usuario);
       DELETE FROM dbo.usuarios WHERE usuario = @usuario;`,
    );
}

async function entrar(usuario, contrasena) {
  const agente = request.agent(app);
  const res = await agente.post('/api/v1/admin/sesion').send({ usuario, contrasena });
  expect(res.status).toBe(200);
  return agente;
}

async function respuestasMinimas() {
  const res = await request(app).get(`/api/v1/servicios/${papanicolaou.id}/preguntas`);
  const valorPorTipo = { TEXTO: 'Ninguno', SI_NO: 'NO', NUMERO: '1', FECHA: sumarDias(ahoraManagua().fecha, -20) };
  return res.body
    .filter((p) => p.obligatoria)
    .map((p) => ({ preguntaId: p.id, valor: p.tipo === 'SELECCION' ? p.opciones[0].etiqueta : valorPorTipo[p.tipo] }));
}

async function turnosLibres(desde) {
  const res = await request(app).get(`/api/v1/turnos?servicioId=${papanicolaou.id}&desde=${desde}&hasta=${sumarDias(desde, 20)}`);
  return res.body.filter((t) => t.disponible);
}

async function agendar(turnoId, respuestas) {
  const res = await request(app)
    .post('/api/v1/citas')
    .send({
      servicioId: papanicolaou.id,
      turnoId,
      paciente: { cedula: CEDULA, nombres: 'Paciente De Prueba', telefono: '88000000', correo: 'prueba@ejemplo.com' },
      consentimiento: true,
      respuestas,
    });
  expect(res.status).toBe(201);
  return res.body;
}

async function cambios(codigo) {
  const r = await pool
    .request()
    .input('codigo', sql.Char(8), codigo)
    .query(
      `SELECT ce.estado_anterior, ce.estado_nuevo, ce.origen, ce.usuario_id
         FROM dbo.cambios_estado_cita ce JOIN dbo.citas c ON c.id = ce.cita_id
        WHERE c.codigo = @codigo ORDER BY ce.id`,
    );
  return r.recordset;
}

beforeAll(async () => {
  pool = await obtenerPool();
  await limpiar();
  const servicios = await request(app).get('/api/v1/servicios');
  papanicolaou = servicios.body.find((s) => s.nombre === 'Papanicolaou');
  const u = await pool.request().query("SELECT id, usuario FROM dbo.usuarios WHERE usuario IN ('dra.rueda', 'recepcion.lira')");
  ids = Object.fromEntries(u.recordset.map((f) => [f.usuario, f.id]));
});

afterAll(async () => {
  await limpiar();
  await cerrarPool();
});

describe('CU-10 sesión con los usuarios de demostración', () => {
  test('inicia sesión, consulta la sesión y al cerrarla queda revocada', async () => {
    const agente = request.agent(app);
    const ok = await agente.post('/api/v1/admin/sesion').send({ usuario: 'dra.rueda', contrasena: 'Clinica2026' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ nombre: 'Dra. Rueda', rol: 'MEDICO' });
    expect((await agente.get('/api/v1/admin/sesion')).body.rol).toBe('MEDICO');

    const cookie = ok.headers['set-cookie'][0].split(';')[0];
    expect((await agente.delete('/api/v1/admin/sesion')).status).toBe(204);
    // La misma cookie ya no sirve aunque el JWT no haya vencido.
    const despues = await request(app).get('/api/v1/admin/sesion').set('Cookie', cookie);
    expect(despues.status).toBe(401);
    expect(despues.body.codigo).toBe('SESION_EXPIRADA');
  });

  test('RN-12: 5 fallos consecutivos bloquean 15 minutos; al vencer, el ingreso correcto reinicia el contador', async () => {
    await pool
      .request()
      .input('usuario', sql.VarChar(30), USUARIO_TEMPORAL)
      .input('hash', sql.VarChar(100), bcrypt.hashSync(CLAVE_TEMPORAL, 4))
      .query(`INSERT INTO dbo.usuarios (usuario, contrasena_hash, nombre_completo, rol) VALUES (@usuario, @hash, N'Usuario De Prueba', 'RECEPCIONISTA')`);
    const intentar = (contrasena) => request(app).post('/api/v1/admin/sesion').send({ usuario: USUARIO_TEMPORAL, contrasena });

    for (let i = 0; i < 4; i += 1) {
      const r = await intentar('Mala2026');
      expect(r.status).toBe(401);
      expect(r.body.mensaje).toBe('Usuario o contraseña incorrectos.');
    }
    const quinto = await intentar('Mala2026');
    expect(quinto.status).toBe(423);
    expect(quinto.body.codigo).toBe('CUENTA_BLOQUEADA');
    expect(quinto.body.mensaje).toMatch(/15 minutos/);

    // E3: bloqueada, ni con la contraseña correcta.
    expect((await intentar(CLAVE_TEMPORAL)).status).toBe(423);

    // Simula que pasaron los 15 minutos.
    await pool.request().input('usuario', sql.VarChar(30), USUARIO_TEMPORAL)
      .query('UPDATE dbo.usuarios SET bloqueado_hasta = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE usuario = @usuario');
    expect((await intentar(CLAVE_TEMPORAL)).status).toBe(200);
    const fila = await pool.request().input('usuario', sql.VarChar(30), USUARIO_TEMPORAL)
      .query('SELECT intentos_fallidos, bloqueado_hasta FROM dbo.usuarios WHERE usuario = @usuario');
    expect(fila.recordset[0]).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
  });

  test('usuario inexistente → 401 con el mismo mensaje genérico', async () => {
    const r = await request(app).post('/api/v1/admin/sesion').send({ usuario: 'no.existe', contrasena: 'Clinica2026' });
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe('Usuario o contraseña incorrectos.');
  });
});

describe('Panel: agenda, triaje y gestión de una cita futura', () => {
  test('CU-11, CU-12, CU-13 y CU-14 de punta a punta', async () => {
    const manana = sumarDias(ahoraManagua().fecha, 1);
    const libres = await turnosLibres(manana);
    expect(libres.length).toBeGreaterThanOrEqual(2);
    const respuestas = await respuestasMinimas();
    const { codigo, fecha } = await agendar(libres[0].id, respuestas);

    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const medica = await entrar('dra.rueda', 'Clinica2026');

    // CU-11: la cita aparece en la agenda de su fecha, sin triaje para recepción.
    const agenda = await recepcion.get(`/api/v1/admin/citas/agenda?fecha=${fecha}`);
    expect(agenda.status).toBe(200);
    const item = agenda.body.find((c) => c.codigo === codigo);
    expect(item).toMatchObject({ estado: 'CONFIRMADA', cedula: CEDULA, puedeReprogramar: true });
    expect(item).not.toHaveProperty('tieneTriaje');
    if (fecha !== ahoraManagua().fecha) {
      // Llegada solo el día de la cita.
      const llegada = await recepcion.patch(`/api/v1/admin/citas/${codigo}/estado`).send({ estado: 'EN_ESPERA' });
      expect(llegada.status).toBe(403);
      expect(llegada.body.codigo).toBe('TRANSICION_NO_PERMITIDA');
    }

    // CU-14 / RN-16: la médica ve el triaje descifrado; la recepción no.
    const triaje = await medica.get(`/api/v1/admin/citas/${codigo}/triaje`);
    expect(triaje.status).toBe(200);
    expect(triaje.body.respuestas.length).toBe(respuestas.length);
    expect(triaje.body.respuestas.map((r) => r.valor)).toEqual(expect.arrayContaining(respuestas.map((r) => r.valor)));
    expect((await recepcion.get(`/api/v1/admin/citas/${codigo}/triaje`)).status).toBe(403);

    // CU-13: la médica no gestiona; la recepción reprograma (mismo código, correo, usuario registrado).
    expect((await medica.post(`/api/v1/admin/citas/${codigo}/cancelacion`)).status).toBe(403);
    const repro = await recepcion.patch(`/api/v1/admin/citas/${codigo}`).send({ turnoId: libres[1].id });
    expect(repro.status).toBe(200);
    expect(repro.body.cita).toMatchObject({ codigo, fecha: libres[1].fecha, horaInicio: libres[1].horaInicio });
    expect(repro.body.correoEnviado).toBe(true);

    // RN-07: el turno anterior quedó libre.
    expect((await turnosLibres(manana)).some((t) => t.id === libres[0].id)).toBe(true);

    // CU-13: cancelar y comprobar el historial (RF-17).
    const cancel = await recepcion.post(`/api/v1/admin/citas/${codigo}/cancelacion`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.cita.estado).toBe('CANCELADA');
    expect(await cambios(codigo)).toEqual([
      { estado_anterior: null, estado_nuevo: 'CONFIRMADA', origen: 'PACIENTE', usuario_id: null },
      { estado_anterior: 'CONFIRMADA', estado_nuevo: 'CONFIRMADA', origen: 'PERSONAL', usuario_id: ids['recepcion.lira'] },
      { estado_anterior: 'CONFIRMADA', estado_nuevo: 'CANCELADA', origen: 'PERSONAL', usuario_id: ids['recepcion.lira'] },
    ]);

    // RN-06: una cita cancelada ya no cambia.
    const otra = await recepcion.post(`/api/v1/admin/citas/${codigo}/cancelacion`);
    expect(otra.status).toBe(409);

    await recepcion.delete('/api/v1/admin/sesion');
    await medica.delete('/api/v1/admin/sesion');
  });
});

describe('Panel: estados del día (CU-12)', () => {
  test('llegada por recepción y atención por la médica, con el usuario de cada cambio', async () => {
    const hoy = ahoraManagua().fecha;
    // Turno libre de hoy (cualquier hora): se asigna directo en la base para
    // poder probar aunque ya haya pasado (la API no agenda turnos pasados).
    const t = await pool
      .request()
      .input('hoy', sql.Date, new Date(`${hoy}T00:00:00Z`))
      .query(
        `SELECT TOP 1 t.id FROM dbo.turnos t
          WHERE t.fecha = @hoy AND t.habilitado = 1
            AND NOT EXISTS (SELECT 1 FROM dbo.citas c WHERE c.turno_id = t.id AND c.estado <> 'CANCELADA')
          ORDER BY t.hora_inicio`,
      );
    if (t.recordset.length === 0) {
      console.warn('Hoy no hay turnos libres (fin de semana o agenda llena): se omite esta prueba.');
      return;
    }
    const manana = sumarDias(hoy, 1);
    const libres = await turnosLibres(manana);
    const { codigo } = await agendar(libres[0].id, await respuestasMinimas());
    await pool.request().input('codigo', sql.Char(8), codigo).input('turno', sql.Int, t.recordset[0].id)
      .query('UPDATE dbo.citas SET turno_id = @turno WHERE codigo = @codigo');

    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const medica = await entrar('dra.rueda', 'Clinica2026');

    // RN-11: la médica no registra llegadas; la recepción no marca Atendida.
    expect((await medica.patch(`/api/v1/admin/citas/${codigo}/estado`).send({ estado: 'EN_ESPERA' })).body.codigo).toBe('ROL_NO_AUTORIZADO');
    expect((await recepcion.patch(`/api/v1/admin/citas/${codigo}/estado`).send({ estado: 'EN_ESPERA' })).status).toBe(200);
    expect((await recepcion.patch(`/api/v1/admin/citas/${codigo}/estado`).send({ estado: 'ATENDIDA' })).body.codigo).toBe('ROL_NO_AUTORIZADO');

    const transiciones = await medica.get(`/api/v1/admin/citas/${codigo}/transiciones`);
    expect(transiciones.body).toEqual(['ATENDIDA']);
    const atendida = await medica.patch(`/api/v1/admin/citas/${codigo}/estado`).send({ estado: 'ATENDIDA' });
    expect(atendida.status).toBe(200);
    expect(atendida.body.cita.estado).toBe('ATENDIDA');

    const historial = await cambios(codigo);
    expect(historial.slice(-2)).toEqual([
      { estado_anterior: 'CONFIRMADA', estado_nuevo: 'EN_ESPERA', origen: 'PERSONAL', usuario_id: ids['recepcion.lira'] },
      { estado_anterior: 'EN_ESPERA', estado_nuevo: 'ATENDIDA', origen: 'PERSONAL', usuario_id: ids['dra.rueda'] },
    ]);

    await recepcion.delete('/api/v1/admin/sesion');
    await medica.delete('/api/v1/admin/sesion');
  });
});
