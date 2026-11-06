'use strict';

// Integración de la Iteración 4 contra SQL Server (base SIGOP con 02_datos_demo.sql):
// CU-15 subir informe (RN-09, RN-14: cifrado y SHA-256 en la base), CU-08 + CU-09
// consultar y descargar (RN-15), y CU-16 disponibilidad (RN-10, E2, turnos
// desde mañana y sin solapes). Crea datos ficticios y los borra al final; el
// horario de la médica se restaura al terminar. Ejecutar con: npm run test:bd
const crypto = require('node:crypto');
const request = require('supertest');
const { crearApp } = require('../../src/app');
const { obtenerPool, cerrarPool, sql } = require('../../src/config/base-datos');
const { ahoraManagua, sumarDias } = require('../../src/common/fechas');

// Datos reservados para estas pruebas (no son personas reales).
const CEDULA = '999-040400-0001Z';
const PDF = Buffer.from('%PDF-1.4\n% Informe ficticio de prueba (Iteración 4)\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');

const app = crearApp();
let pool;
let papanicolaou;
let horarioOriginal;
let diasNuevos = []; // días que la prueba creó en horarios_laborales y deben borrarse

async function limpiar() {
  await pool
    .request()
    .input('cedula', sql.VarChar(16), CEDULA)
    .query(
      `DELETE FROM dbo.informes_resultado WHERE cita_id IN
         (SELECT c.id FROM dbo.citas c JOIN dbo.pacientes p ON p.id = c.paciente_id WHERE p.cedula = @cedula);
       DELETE FROM dbo.citas WHERE paciente_id IN (SELECT id FROM dbo.pacientes WHERE cedula = @cedula);
       DELETE FROM dbo.pacientes WHERE cedula = @cedula;
       DELETE FROM dbo.intentos_acceso WHERE cedula_ingresada = @cedula;`,
    );
}

async function entrar(usuario, contrasena) {
  const agente = request.agent(app);
  const res = await agente.post('/api/v1/admin/sesion').send({ usuario, contrasena });
  expect(res.status).toBe(200);
  return agente;
}

async function turnos(desde, hasta = desde) {
  const res = await request(app).get(`/api/v1/turnos?servicioId=${papanicolaou.id}&desde=${desde}&hasta=${hasta}`);
  expect(res.status).toBe(200);
  return res.body;
}

async function agendar(turnoId) {
  const preguntas = await request(app).get(`/api/v1/servicios/${papanicolaou.id}/preguntas`);
  const valorPorTipo = { TEXTO: 'Ninguno', SI_NO: 'NO', NUMERO: '1', FECHA: sumarDias(ahoraManagua().fecha, -20) };
  const respuestas = preguntas.body
    .filter((p) => p.obligatoria)
    .map((p) => ({ preguntaId: p.id, valor: p.tipo === 'SELECCION' ? p.opciones[0].etiqueta : valorPorTipo[p.tipo] }));
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
  return res.body.codigo;
}

/** Primer día hábil (lunes a viernes) a partir de `desde`. */
function diaHabil(desde) {
  let dia = desde;
  for (;;) {
    const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 domingo
    if (semana >= 1 && semana <= 5) return dia;
    dia = sumarDias(dia, 1);
  }
}

const diaSemanaIso = (fecha) => ((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

beforeAll(async () => {
  pool = await obtenerPool();
  await limpiar();
  const servicios = await request(app).get('/api/v1/servicios');
  papanicolaou = servicios.body.find((s) => s.nombre === 'Papanicolaou');
  const medica = await entrar('dra.rueda', 'Clinica2026');
  horarioOriginal = (await medica.get('/api/v1/admin/disponibilidad')).body.horarios;
  const existentes = await pool.request().query(
    "SELECT h.dia_semana FROM dbo.horarios_laborales h JOIN dbo.usuarios u ON u.id = h.medico_id WHERE u.usuario = 'dra.rueda'",
  );
  diasNuevos = [1, 2, 3, 4, 5, 6, 7].filter((d) => !existentes.recordset.some((f) => f.dia_semana === d));
});

afterAll(async () => {
  // Restaura el horario de la médica y regenera sus turnos futuros.
  const medica = await entrar('dra.rueda', 'Clinica2026');
  const cuerpo = horarioOriginal.map(({ diaSemana, atiende, apertura, cierre, duracion }) => ({ diaSemana, atiende, apertura, cierre, duracion }));
  await medica.put('/api/v1/admin/disponibilidad').send({ horarios: cuerpo });
  await limpiar();
  if (diasNuevos.length) {
    // Días que la prueba agregó (p. ej. sábado): sin citas, se pueden borrar.
    const lista = diasNuevos.join(',');
    await pool.request().query(
      `DELETE t FROM dbo.turnos t JOIN dbo.horarios_laborales h ON h.id = t.horario_id
        WHERE h.dia_semana IN (${lista}) AND NOT EXISTS (SELECT 1 FROM dbo.citas c WHERE c.turno_id = t.id);
       DELETE h FROM dbo.horarios_laborales h
        WHERE h.dia_semana IN (${lista}) AND NOT EXISTS (SELECT 1 FROM dbo.turnos t WHERE t.horario_id = h.id);`,
    );
  }

  // La prueba no deja la base alterada: la disponibilidad de cada día (el sábado incluido,
  // si estaba activo) queda como antes y las contraseñas de demostración siguen sirviendo.
  try {
    const resumen = (hs) => hs.map(({ diaSemana, atiende, apertura, cierre, duracion }) => ({ diaSemana, atiende, apertura, cierre, duracion }));
    const final = (await (await entrar('dra.rueda', 'Clinica2026')).get('/api/v1/admin/disponibilidad')).body.horarios;
    expect(resumen(final)).toEqual(resumen(horarioOriginal));
    await entrar('recepcion.lira', 'Recepcion2026');
  } finally {
    await cerrarPool();
  }
});

describe('CU-15, CU-08 y CU-09: subir, consultar y descargar un informe', () => {
  let codigo;

  test('recepción busca a la paciente y sube un PDF a una cita de hoy o pasada', async () => {
    // Cita futura por la API y luego movida a un turno libre de hoy o anterior
    // (la API no agenda en el pasado).
    const manana = sumarDias(ahoraManagua().fecha, 1);
    const libres = (await turnos(manana, sumarDias(manana, 13))).filter((t) => t.disponible);
    codigo = await agendar(libres[0].id);
    const pasado = await pool
      .request()
      .input('hoy', sql.Date, new Date(`${ahoraManagua().fecha}T00:00:00Z`))
      .query(
        `SELECT TOP 1 t.id FROM dbo.turnos t
          WHERE t.fecha <= @hoy
            AND NOT EXISTS (SELECT 1 FROM dbo.citas c WHERE c.turno_id = t.id AND c.estado <> 'CANCELADA')
          ORDER BY t.fecha DESC, t.hora_inicio DESC`,
      );
    expect(pasado.recordset.length).toBe(1);
    await pool.request().input('codigo', sql.Char(8), codigo).input('turno', sql.Int, pasado.recordset[0].id)
      .query("UPDATE dbo.citas SET turno_id = @turno, estado = 'ATENDIDA' WHERE codigo = @codigo");

    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const busqueda = await recepcion.post('/api/v1/admin/pacientes/busqueda').send({ cedula: CEDULA });
    expect(busqueda.status).toBe(200);
    expect(busqueda.body.citas).toEqual([expect.objectContaining({ codigo, admiteInforme: true, informes: 0 })]);

    const subida = await recepcion
      .post(`/api/v1/admin/citas/${codigo}/informes`)
      .attach('archivo', PDF, { filename: 'Ecografía pélvica.pdf', contentType: 'application/pdf' });
    expect(subida.status).toBe(201);
    expect(subida.body.informe).toMatchObject({ nombre: 'Ecografia pelvica.pdf', tamanoBytes: PDF.length, cita: codigo });

    // RN-14: en la base el archivo está cifrado y con su SHA-256; quien lo cargó queda registrado.
    const fila = await pool.request().input('id', sql.Int, subida.body.informe.id)
      .query('SELECT archivo_cifrado, hash_sha256, cargado_por FROM dbo.informes_resultado WHERE id = @id');
    const { archivo_cifrado: cifrado, hash_sha256: hash, cargado_por: cargadoPor } = fila.recordset[0];
    expect(cifrado.includes(PDF)).toBe(false);
    expect(hash).toBe(crypto.createHash('sha256').update(PDF).digest('hex'));
    const recep = await pool.request().query("SELECT id FROM dbo.usuarios WHERE usuario = 'recepcion.lira'");
    expect(cargadoPor).toBe(recep.recordset[0].id);
  });

  test('rechaza un archivo que no es PDF (E1) y la médica no puede subir (403)', async () => {
    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const falso = await recepcion
      .post(`/api/v1/admin/citas/${codigo}/informes`)
      .attach('archivo', Buffer.from('MZ ejecutable'), { filename: 'informe.pdf', contentType: 'application/pdf' });
    expect(falso.status).toBe(422);
    expect(falso.body.codigo).toBe('ARCHIVO_NO_PDF');

    const medica = await entrar('dra.rueda', 'Clinica2026');
    const r = await medica.post(`/api/v1/admin/citas/${codigo}/informes`).attach('archivo', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(403);
  });

  test('la paciente consulta con cédula y código y descarga el mismo PDF', async () => {
    const consulta = await request(app).post('/api/v1/resultados/consulta').send({ cedula: CEDULA, codigo });
    expect(consulta.status).toBe(200);
    expect(consulta.body.informes).toHaveLength(1);
    const [informe] = consulta.body.informes;

    const descarga = await request(app)
      .get(`/api/v1/resultados/${informe.id}/archivo`)
      .set('Authorization', `Bearer ${consulta.body.tokenCita}`)
      .buffer(true)
      .parse((r, cb) => {
        const partes = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toBe('application/pdf');
    expect(descarga.body.equals(PDF)).toBe(true);
  });

  test('el token de otra cita no descarga el informe (404) y el código incorrecto da 401 genérico', async () => {
    const consulta = await request(app).post('/api/v1/resultados/consulta').send({ cedula: CEDULA, codigo });
    const [informe] = consulta.body.informes;
    const { crearTokenCita } = require('../../src/modules/seguridad/token-cita');
    const { obtenerConfig } = require('../../src/config/config');
    const otro = crearTokenCita({ secreto: obtenerConfig().secretoSesion }).firmar({ citaId: 1, codigo: 'CR-00001' });
    const r = await request(app).get(`/api/v1/resultados/${informe.id}/archivo`).set('Authorization', `Bearer ${otro}`);
    expect(r.status).toBe(404);

    const mal = await request(app).post('/api/v1/resultados/consulta').send({ cedula: CEDULA, codigo: 'CR-00000' });
    expect(mal.status).toBe(401);
    expect(mal.body.codigo).toBe('ACCESO_DENEGADO');
  });
});

describe('CU-16 disponibilidad', () => {
  test('recepción no puede ver ni cambiar la disponibilidad (403)', async () => {
    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    expect((await recepcion.get('/api/v1/admin/disponibilidad')).status).toBe(403);
  });

  test('E2: acortar la jornada deja la cita fuera de horario, la conserva y la marca en la agenda; restaurar la reincorpora', async () => {
    // Un día hábil dentro de dos días (los turnos de hoy y mañana no se usan).
    const dia = diaHabil(sumarDias(ahoraManagua().fecha, 2));
    const libres = (await turnos(dia)).filter((t) => t.disponible && t.horaInicio >= '14:00');
    if (libres.length === 0) {
      console.warn(`El ${dia} no tiene turnos libres después de las 14:00: se omite esta prueba.`);
      return;
    }
    const codigo = await agendar(libres[0].id);
    const medica = await entrar('dra.rueda', 'Clinica2026');
    const semana = horarioOriginal.map(({ diaSemana, atiende, apertura, cierre, duracion }) =>
      diaSemana === diaSemanaIso(dia) ? { diaSemana, atiende, apertura, cierre: '14:00', duracion } : { diaSemana, atiende, apertura, cierre, duracion });

    const r = await medica.put('/api/v1/admin/disponibilidad').send({ horarios: semana });
    expect(r.status).toBe(200);
    expect(r.body.citasFueraDeHorario).toEqual(expect.arrayContaining([expect.objectContaining({ codigo, fecha: dia })]));
    // RN-10: ya no se ofrecen turnos que terminen después de las 14:00.
    expect((await turnos(dia)).every((t) => t.horaFin <= '14:00')).toBe(true);
    // La cita sigue Confirmada y la agenda la marca para recepción.
    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const agenda = await recepcion.get(`/api/v1/admin/citas/agenda?fecha=${dia}`);
    expect(agenda.body.find((c) => c.codigo === codigo)).toMatchObject({ estado: 'CONFIRMADA', fueraDeHorario: true });

    const original = horarioOriginal.map(({ diaSemana, atiende, apertura, cierre, duracion }) => ({ diaSemana, atiende, apertura, cierre, duracion }));
    const restaurado = await medica.put('/api/v1/admin/disponibilidad').send({ horarios: original });
    expect(restaurado.body.citasFueraDeHorario.some((c) => c.codigo === codigo)).toBe(false);
  });

  test('cambiar la duración crea la nueva cuadrícula sin solaparse con una cita conservada (RN-01)', async () => {
    const dia = diaHabil(sumarDias(ahoraManagua().fecha, 3));
    const libres = (await turnos(dia)).filter((t) => t.disponible);
    if (libres.length < 2) {
      console.warn(`El ${dia} no tiene turnos libres: se omite esta prueba.`);
      return;
    }
    const elegido = libres[1];
    const codigo = await agendar(elegido.id);
    const medica = await entrar('dra.rueda', 'Clinica2026');
    const original = horarioOriginal.find((h) => h.diaSemana === diaSemanaIso(dia));
    const nuevaDuracion = original.duracion === 30 ? 45 : 30;
    const semana = horarioOriginal.map(({ diaSemana, atiende, apertura, cierre, duracion }) =>
      diaSemana === diaSemanaIso(dia) ? { diaSemana, atiende, apertura, cierre, duracion: nuevaDuracion } : { diaSemana, atiende, apertura, cierre, duracion });
    expect((await medica.put('/api/v1/admin/disponibilidad').send({ horarios: semana })).status).toBe(200);

    const lista = await turnos(dia);
    const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    expect(lista.length).toBeGreaterThan(0);
    for (const t of lista) {
      expect(minutos(t.horaFin) - minutos(t.horaInicio)).toBe(nuevaDuracion);
      const cruza = t.horaInicio < elegido.horaFin && t.horaFin > elegido.horaInicio;
      if (cruza) expect(t.disponible).toBe(false); // no se puede reservar encima de la cita conservada
    }
    const recepcion = await entrar('recepcion.lira', 'Recepcion2026');
    const agenda = await recepcion.get(`/api/v1/admin/citas/agenda?fecha=${dia}`);
    expect(agenda.body.find((c) => c.codigo === codigo)).toMatchObject({ estado: 'CONFIRMADA' });
  });

  test('los turnos de hoy no cambian («solo desde mañana»)', async () => {
    const hoy = ahoraManagua().fecha;
    const antes = await pool.request().input('hoy', sql.Date, new Date(`${hoy}T00:00:00Z`))
      .query('SELECT id, habilitado FROM dbo.turnos WHERE fecha = @hoy ORDER BY id');
    const medica = await entrar('dra.rueda', 'Clinica2026');
    const semana = horarioOriginal.map(({ diaSemana, atiende, apertura, cierre, duracion }) =>
      diaSemana === diaSemanaIso(hoy) && atiende ? { diaSemana, atiende, apertura, cierre: sumarMinutos(apertura, 2 * duracion), duracion } : { diaSemana, atiende, apertura, cierre, duracion });
    expect((await medica.put('/api/v1/admin/disponibilidad').send({ horarios: semana })).status).toBe(200);
    const despues = await pool.request().input('hoy', sql.Date, new Date(`${hoy}T00:00:00Z`))
      .query('SELECT id, habilitado FROM dbo.turnos WHERE fecha = @hoy ORDER BY id');
    expect(despues.recordset).toEqual(antes.recordset);
  });
});

function sumarMinutos(hora, minutos) {
  const total = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3)) + minutos;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
