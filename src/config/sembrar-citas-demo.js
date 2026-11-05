'use strict';

// npm run db:citas-demo — crea citas FICTICIAS para probar el panel
// (Iteración 3). Solo para desarrollo y demos: nunca en producción.
//
// - Pacientes inventadas, marcadas con cédula 000-... y correo @ejemplo.com.
// - Día 1: hoy (o el próximo día hábil): 7 citas con estados variados. Las de
//   horas que ya pasaron quedan Atendida, No asistió o En espera; las demás,
//   Confirmada; una Cancelada y una sin ficha de triaje.
// - Día 2: el siguiente día hábil, 3 citas Confirmadas.
// - Triaje cifrado con AES-256-GCM usando CLAVE_CIFRADO del .env, igual que la app.
// - Si ya hay citas demo en el día 1, no hace nada (se puede correr varias veces).
const { obtenerPool, transaccion, cerrarPool, sql } = require('./base-datos');
const { obtenerConfig } = require('./config');
const { cifrar } = require('../common/cifrado');
const { ahoraManagua, sumarDias } = require('../common/fechas');
const { generarCodigoCita } = require('../modules/citas/generar-codigo-cita');

const PACIENTES = [
  { cedula: '000-010190-0001A', nombres: 'Ana Demo Pérez', telefono: '88000001' },
  { cedula: '000-020291-0002B', nombres: 'Karla Demo Méndez', telefono: '88000002' },
  { cedula: '000-030392-0003C', nombres: 'Rosa Demo Ruiz', telefono: '88000003' },
  { cedula: '000-040493-0004D', nombres: 'Gabriela Demo Torres', telefono: '88000004' },
  { cedula: '000-050594-0005E', nombres: 'Sofía Demo Herrera', telefono: '88000005' },
  { cedula: '000-060695-0006F', nombres: 'Patricia Demo Gómez', telefono: '88000006' },
  { cedula: '000-070796-0007G', nombres: 'Valeria Demo Castillo', telefono: '88000007' },
  { cedula: '000-080897-0008H', nombres: 'Lucía Demo Navarro', telefono: '88000008' },
  { cedula: '000-090998-0009J', nombres: 'Elena Demo Vargas', telefono: '88000009' },
  { cedula: '000-101099-0010K', nombres: 'Marta Demo Solís', telefono: '88000010' },
].map((p, i) => ({ ...p, correo: `paciente.demo${i + 1}@ejemplo.com` }));

const aFechaSql = (iso) => new Date(`${iso}T00:00:00Z`);

/** 0 = domingo … 6 = sábado */
function diaSemana(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function proximoHabil(iso) {
  let f = iso;
  while ([0, 6].includes(diaSemana(f))) f = sumarDias(f, 1);
  return f;
}

function respuestaDemo(pregunta, fechaCita) {
  switch (pregunta.tipo_respuesta) {
    case 'FECHA':
      return sumarDias(fechaCita, -100); // FUM: unas 14 semanas antes de la cita
    case 'SI_NO':
      return 'NO';
    case 'NUMERO':
      return '1';
    case 'SELECCION':
      return pregunta.opciones[1] ?? pregunta.opciones[0] ?? null;
    default:
      return /alergia/i.test(pregunta.texto) ? 'Ninguna conocida' : 'Control de rutina (dato de demostración)';
  }
}

async function main() {
  const config = obtenerConfig();
  if (config.esProduccion) {
    console.error('Este script es solo para desarrollo y demos. No se ejecuta en producción.');
    process.exitCode = 1;
    return;
  }

  const pool = await obtenerPool();
  const ahora = ahoraManagua();
  const dia1 = proximoHabil(ahora.fecha);
  const dia2 = proximoHabil(sumarDias(dia1, 1));

  // Usuarios de 02_datos_demo.sql (para registrar quién hizo cada cambio).
  const usuarios = (await pool.request().query(
    "SELECT id, usuario FROM dbo.usuarios WHERE usuario IN ('dra.rueda', 'recepcion.lira')",
  )).recordset;
  const medicaId = usuarios.find((u) => u.usuario === 'dra.rueda')?.id;
  const recepcionId = usuarios.find((u) => u.usuario === 'recepcion.lira')?.id;
  if (!medicaId || !recepcionId) throw new Error('Faltan los usuarios de 02_datos_demo.sql.');

  const ya = await pool
    .request()
    .input('fecha', sql.Date, aFechaSql(dia1))
    .query(
      `SELECT COUNT(*) AS total FROM dbo.citas c
         JOIN dbo.pacientes p ON p.id = c.paciente_id
         JOIN dbo.turnos t ON t.id = c.turno_id
        WHERE t.fecha = @fecha AND p.cedula LIKE '000-%'`,
    );
  if (ya.recordset[0].total > 0) {
    console.log(`Ya hay citas de demostración el ${dia1}. No se creó nada.`);
    return;
  }

  await pool
    .request()
    .input('desde', sql.Date, aFechaSql(ahora.fecha))
    .input('hasta', sql.Date, aFechaSql(sumarDias(dia2, 1)))
    .execute('dbo.sp_generar_turnos');

  const servicios = (await pool.request().query('SELECT id, nombre FROM dbo.servicios WHERE activo = 1 ORDER BY id')).recordset;
  const filasPreguntas = (await pool.request().query(
    `SELECT p.id, p.servicio_id, p.texto, p.tipo_respuesta, o.etiqueta
       FROM dbo.preguntas_triaje p
       LEFT JOIN dbo.opciones_pregunta o ON o.pregunta_id = p.id
      WHERE p.activa = 1 ORDER BY p.orden, o.orden`,
  )).recordset;
  const preguntas = new Map();
  for (const f of filasPreguntas) {
    if (!preguntas.has(f.id)) preguntas.set(f.id, { ...f, opciones: [] });
    if (f.etiqueta) preguntas.get(f.id).opciones.push(f.etiqueta);
  }

  async function turnosLibres(fecha) {
    const r = await pool
      .request()
      .input('fecha', sql.Date, aFechaSql(fecha))
      .query(
        `SELECT t.id, CONVERT(char(5), t.hora_inicio, 108) AS hora_inicio
           FROM dbo.turnos t
          WHERE t.fecha = @fecha AND t.habilitado = 1
            AND NOT EXISTS (SELECT 1 FROM dbo.citas c WHERE c.turno_id = t.id AND c.estado <> 'CANCELADA')
          ORDER BY t.hora_inicio`,
      );
    return r.recordset;
  }

  // Estado final según si la hora ya pasó (solo tiene sentido si el día 1 es hoy).
  const planDia1 = (turno, i) => {
    const paso = dia1 === ahora.fecha && turno.hora_inicio <= ahora.hora;
    if (i === 5) return 'CANCELADA';
    if (paso) return ['ATENDIDA', 'NO_ASISTIO', 'EN_ESPERA'][i % 3];
    return 'CONFIRMADA';
  };

  const libres1 = await turnosLibres(dia1);
  const libres2 = await turnosLibres(dia2);
  const plan = [
    ...libres1.filter((_, i) => i % 2 === 0).slice(0, 7).map((t, i) => ({ fecha: dia1, turno: t, estado: planDia1(t, i), conTriaje: i !== 6 })),
    ...libres2.slice(0, 3).map((t) => ({ fecha: dia2, turno: t, estado: 'CONFIRMADA', conTriaje: true })),
  ];
  if (plan.length === 0) {
    console.log(`No hay turnos libres el ${dia1} ni el ${dia2}. Revisa horarios_laborales.`);
    return;
  }

  const creadas = [];
  for (const [i, item] of plan.entries()) {
    const paciente = PACIENTES[i % PACIENTES.length];
    const servicio = servicios[i % servicios.length];
    const resultado = await transaccion(async (tx) => {
      const pac = await tx
        .request()
        .input('cedula', sql.VarChar(16), paciente.cedula)
        .input('nombres', sql.NVarChar(80), paciente.nombres)
        .input('telefono', sql.VarChar(8), paciente.telefono)
        .input('correo', sql.VarChar(100), paciente.correo)
        .query(
          `MERGE dbo.pacientes WITH (HOLDLOCK) AS d
           USING (SELECT @cedula AS cedula) AS o ON d.cedula = o.cedula
           WHEN NOT MATCHED THEN INSERT (cedula, nombres, telefono, correo) VALUES (@cedula, @nombres, @telefono, @correo)
           WHEN MATCHED THEN UPDATE SET nombres = @nombres
           OUTPUT inserted.id;`,
        );
      const pacienteId = pac.recordset[0].id;

      const codigo = await generarCodigoCita(async (c) => {
        const r = await tx.request().input('c', sql.Char(8), c).query('SELECT 1 AS x FROM dbo.citas WHERE codigo = @c');
        return r.recordset.length > 0;
      });
      const cita = await tx
        .request()
        .input('codigo', sql.Char(8), codigo)
        .input('pacienteId', sql.Int, pacienteId)
        .input('turnoId', sql.Int, item.turno.id)
        .input('servicioId', sql.Int, servicio.id)
        .input('estado', sql.VarChar(12), item.estado)
        .query(
          `INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, estado, consentimiento_aceptado, consentimiento_version)
           OUTPUT INSERTED.id VALUES (@codigo, @pacienteId, @turnoId, @servicioId, @estado, 1, 'v1.0')`,
        );
      const citaId = cita.recordset[0].id;

      // Historial de estados (RF-17), con el usuario que hizo cada cambio.
      const pasos = [{ anterior: null, nuevo: 'CONFIRMADA', origen: 'PACIENTE', usuarioId: null, detalle: 'Cita de demostración' }];
      if (item.estado === 'EN_ESPERA' || item.estado === 'ATENDIDA') {
        pasos.push({ anterior: 'CONFIRMADA', nuevo: 'EN_ESPERA', origen: 'PERSONAL', usuarioId: recepcionId, detalle: 'Llegada registrada' });
      }
      if (item.estado === 'ATENDIDA') {
        pasos.push({ anterior: 'EN_ESPERA', nuevo: 'ATENDIDA', origen: 'PERSONAL', usuarioId: medicaId, detalle: 'Atendida por la médica' });
      }
      if (item.estado === 'NO_ASISTIO' || item.estado === 'CANCELADA') {
        const detalle = item.estado === 'CANCELADA' ? 'Cancelada por recepción' : 'La paciente no asistió';
        pasos.push({ anterior: 'CONFIRMADA', nuevo: item.estado, origen: 'PERSONAL', usuarioId: recepcionId, detalle });
      }
      for (const p of pasos) {
        await tx
          .request()
          .input('citaId', sql.Int, citaId)
          .input('anterior', sql.VarChar(12), p.anterior)
          .input('nuevo', sql.VarChar(12), p.nuevo)
          .input('origen', sql.VarChar(10), p.origen)
          .input('usuarioId', sql.Int, p.usuarioId)
          .input('detalle', sql.NVarChar(200), p.detalle)
          .query(
            `INSERT INTO dbo.cambios_estado_cita (cita_id, estado_anterior, estado_nuevo, origen, usuario_id, detalle)
             VALUES (@citaId, @anterior, @nuevo, @origen, @usuarioId, @detalle)`,
          );
      }

      // Ficha de triaje cifrada (RN-14).
      const delServicio = [...preguntas.values()].filter((p) => p.servicio_id === servicio.id);
      if (item.conTriaje && delServicio.length > 0) {
        const ficha = await tx.request().input('citaId', sql.Int, citaId).query('INSERT INTO dbo.fichas_triaje (cita_id) OUTPUT INSERTED.id VALUES (@citaId)');
        const fichaId = ficha.recordset[0].id;
        for (const p of delServicio) {
          const valor = respuestaDemo(p, item.fecha);
          if (valor == null) continue;
          await tx
            .request()
            .input('fichaId', sql.Int, fichaId)
            .input('preguntaId', sql.Int, p.id)
            .input('valor', sql.VarBinary(2100), cifrar(valor, config.claveCifrado))
            .query('INSERT INTO dbo.respuestas_triaje (ficha_id, pregunta_id, valor_cifrado) VALUES (@fichaId, @preguntaId, @valor)');
        }
      }
      return codigo;
    });
    creadas.push({ codigo: resultado, fecha: item.fecha, hora: item.turno.hora_inicio, servicio: servicio.nombre, estado: item.estado, triaje: item.conTriaje ? 'sí' : 'no' });
  }

  console.log(`Citas de demostración creadas (${creadas.length}):`);
  console.table(creadas);
  console.log('Pacientes ficticias: cédulas 000-..., correos @ejemplo.com.');
}

main()
  .catch((err) => {
    process.exitCode = 1;
    console.error(`Error: [${err.codigo ?? err.code ?? err.name}] ${err.message}`);
    if (err.cause) console.error(`Causa: [${err.cause.code ?? err.cause.name}] ${err.cause.message}`);
  })
  .finally(() => cerrarPool());
