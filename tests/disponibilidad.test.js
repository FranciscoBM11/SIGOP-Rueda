'use strict';

// CU-16 sin base de datos: validación de horarios (RN-10), orquestación del
// guardado (turnos desde mañana, citas fuera de horario, E2) y generación de
// turnos solo en días que aún no los tienen.
const { guardarHorariosSchema } = require('../src/modules/disponibilidad/disponibilidad.schemas');
const { crearHorariosService, presentarSemana } = require('../src/modules/disponibilidad/horarios.service');
const { crearTurnosService, rangosSinTurnos } = require('../src/modules/disponibilidad/turnos.service');

const reloj = () => ({ fecha: '2026-11-05', hora: '09:00' }); // jueves

function semana(cambios = {}) {
  return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    diaSemana: d,
    atiende: d <= 5,
    apertura: d <= 5 ? '08:00' : null,
    cierre: d <= 5 ? '16:00' : null,
    duracion: d <= 5 ? 40 : null,
    ...(cambios[d] ?? {}),
  }));
}

function errores(cuerpo) {
  const r = guardarHorariosSchema.safeParse(cuerpo);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('guardarHorariosSchema (RN-10, CU-16 E1)', () => {
  test('acepta la semana de la demo y un sábado de 08:00 a 12:00 con turnos de 30', () => {
    expect(errores({ horarios: semana({ 6: { atiende: true, apertura: '08:00', cierre: '12:00', duracion: 30 } }) })).toEqual([]);
  });

  test.each([
    ['duración menor de 30', { 1: { duracion: 25 } }, 'horarios.0.duracion'],
    ['duración mayor de 45', { 2: { duracion: 50 } }, 'horarios.1.duracion'],
    ['cierre igual a la apertura', { 3: { cierre: '08:00' } }, 'horarios.2.cierre'],
    ['cierre antes de la apertura', { 4: { apertura: '16:00', cierre: '08:00' } }, 'horarios.3.cierre'],
    ['jornada más corta que un turno', { 5: { cierre: '08:30' } }, 'horarios.4.cierre'],
    ['hora fuera de formato (ER-10)', { 1: { apertura: '8:00' } }, 'horarios.0.apertura'],
    ['hora imposible', { 1: { cierre: '24:00' } }, 'horarios.0.cierre'],
    ['atiende sin horas', { 6: { atiende: true } }, 'horarios.5.apertura'],
  ])('rechaza %s', (_, cambios, campo) => {
    expect(errores({ horarios: semana(cambios) }).some((e) => e.startsWith(campo))).toBe(true);
  });

  test('exige los 7 días, sin repetir, y al menos uno de atención', () => {
    expect(errores({ horarios: semana().slice(0, 6) })).not.toEqual([]);
    const repetido = semana();
    repetido[6] = { ...repetido[0] };
    expect(errores({ horarios: repetido }).join()).toContain('una sola vez');
    const ninguno = semana(Object.fromEntries([1, 2, 3, 4, 5].map((d) => [d, { atiende: false }])));
    expect(errores({ horarios: ninguno }).join()).toContain('al menos un día');
  });

  test('rechaza campos no declarados', () => {
    expect(errores({ horarios: semana(), medicoId: 9 })).not.toEqual([]);
    expect(errores({ horarios: semana({ 1: { activo: true } }) })).not.toEqual([]);
  });

  test('un día que no atiende puede venir sin horas', () => {
    expect(errores({ horarios: semana({ 7: { atiende: false, apertura: undefined, cierre: undefined, duracion: undefined } }) })).toEqual([]);
  });
});

describe('presentarSemana', () => {
  test('devuelve los 7 días; los no configurados no atienden', () => {
    const r = presentarSemana([{ id: 1, diaSemana: 1, apertura: '08:00', cierre: '16:00', duracion: 40, activo: true }, { id: 6, diaSemana: 6, apertura: '08:00', cierre: '12:00', duracion: 30, activo: false }]);
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual({ diaSemana: 1, nombre: 'Lunes', atiende: true, apertura: '08:00', cierre: '16:00', duracion: 40 });
    expect(r[5]).toMatchObject({ nombre: 'Sábado', atiende: false, apertura: '08:00' });
    expect(r[6]).toEqual({ diaSemana: 7, nombre: 'Domingo', atiende: false, apertura: null, cierre: null, duracion: null });
  });
});

describe('HorariosService.guardar (CU-16)', () => {
  function crear({ actuales, ultima = '2026-11-18', fuera = [] } = {}) {
    const tx = { soy: 'tx' };
    const filas = actuales ?? [1, 2, 3, 4, 5].map((d) => ({ id: d * 10, diaSemana: d, apertura: '08:00', cierre: '16:00', duracion: 40, activo: true }));
    const repo = {
      bloquear: jest.fn().mockResolvedValue(filas),
      actualizar: jest.fn(),
      insertar: jest.fn(),
      desactivar: jest.fn(),
      reajustarTurnos: jest.fn(),
      ultimaFechaConTurnos: jest.fn().mockResolvedValue(ultima),
      generarTurnos: jest.fn(),
      citasFueraDeHorario: jest.fn().mockResolvedValue(fuera),
      listar: jest.fn().mockResolvedValue(filas),
    };
    const transaccion = jest.fn(async (fn) => fn(tx));
    return { servicio: crearHorariosService({ transaccion, horariosRepo: repo, reloj }), repo, tx, transaccion };
  }

  test('actualiza, inserta y desactiva días en una transacción y reajusta los turnos desde mañana', async () => {
    const { servicio, repo, tx, transaccion } = crear();
    const horarios = semana({
      4: { cierre: '14:00', duracion: 30 }, // jueves: cambia
      5: { atiende: false, apertura: null, cierre: null, duracion: null }, // viernes: deja de atender
      6: { atiende: true, apertura: '08:00', cierre: '12:00', duracion: 30 }, // sábado: nuevo
    });
    await servicio.guardar(1, horarios);

    expect(transaccion).toHaveBeenCalledTimes(1);
    expect(repo.bloquear).toHaveBeenCalledWith(tx, 1);
    expect(repo.actualizar).toHaveBeenCalledWith(tx, 40, { apertura: '08:00', cierre: '14:00', duracion: 30, activo: true });
    expect(repo.actualizar).toHaveBeenCalledTimes(4); // lunes a jueves
    expect(repo.desactivar).toHaveBeenCalledWith(tx, 50);
    expect(repo.insertar).toHaveBeenCalledWith(tx, 1, { diaSemana: 6, apertura: '08:00', cierre: '12:00', duracion: 30 });
    // «Solo desde mañana»: los turnos de hoy (2026-11-05) no se tocan.
    expect(repo.reajustarTurnos).toHaveBeenCalledWith(tx, 1, '2026-11-06');
    expect(repo.generarTurnos).toHaveBeenCalledWith(tx, '2026-11-06', '2026-11-19');
    expect(repo.citasFueraDeHorario).toHaveBeenCalledWith(1, '2026-11-06', tx);
  });

  test('genera hasta el último día que ya tenía turnos si es más lejano (tope 90 días)', async () => {
    const { servicio, repo } = crear({ ultima: '2026-12-20' });
    await servicio.guardar(1, semana());
    expect(repo.generarTurnos).toHaveBeenCalledWith(expect.anything(), '2026-11-06', '2026-12-20');

    const { servicio: s2, repo: r2 } = crear({ ultima: '2027-06-01' });
    await s2.guardar(1, semana());
    expect(r2.generarTurnos).toHaveBeenCalledWith(expect.anything(), '2026-11-06', '2027-02-03');
  });

  test('no desactiva un día que ya estaba inactivo ni toca días sin fila que no atienden', async () => {
    const { servicio, repo } = crear({ actuales: [{ id: 70, diaSemana: 7, apertura: '08:00', cierre: '12:00', duracion: 30, activo: false }, { id: 10, diaSemana: 1, apertura: '08:00', cierre: '16:00', duracion: 40, activo: true }] });
    await servicio.guardar(1, semana());
    expect(repo.desactivar).not.toHaveBeenCalled();
    expect(repo.insertar).toHaveBeenCalledTimes(4); // martes a viernes
  });

  test('E2: devuelve las citas que quedaron fuera del horario (se conservan)', async () => {
    const fuera = [{ codigo: 'CR-04851', estado: 'CONFIRMADA', servicio: 'Control Prenatal', fecha: '2026-11-12', horaInicio: '14:40', horaFin: '15:20' }];
    const { servicio } = crear({ fuera });
    const r = await servicio.guardar(1, semana({ 4: { cierre: '14:00' } }));
    expect(r.citasFueraDeHorario).toEqual(fuera);
    expect(r.horarios).toHaveLength(7);
  });

  test('obtener: horarios y citas fuera de horario desde hoy', async () => {
    const { servicio, repo } = crear();
    const r = await servicio.obtener(1);
    expect(repo.citasFueraDeHorario).toHaveBeenCalledWith(1, '2026-11-05');
    expect(r.horarios.map((h) => h.atiende)).toEqual([true, true, true, true, true, false, false]);
  });
});

describe('Generación de turnos solo en días sin turnos', () => {
  test('rangosSinTurnos agrupa los días faltantes consecutivos', () => {
    expect(rangosSinTurnos('2026-11-05', '2026-11-11', new Set())).toEqual([['2026-11-05', '2026-11-11']]);
    expect(rangosSinTurnos('2026-11-05', '2026-11-11', new Set(['2026-11-05', '2026-11-06', '2026-11-09']))).toEqual([
      ['2026-11-07', '2026-11-08'],
      ['2026-11-10', '2026-11-11'],
    ]);
    expect(rangosSinTurnos('2026-11-05', '2026-11-06', new Set(['2026-11-05', '2026-11-06']))).toEqual([]);
  });

  test('TurnosService.consultar no regenera un día que ya tiene turnos (no mezcla dos horarios)', async () => {
    const repo = {
      fechasConTurnos: jest.fn().mockResolvedValue(new Set(['2026-11-05', '2026-11-06'])),
      generar: jest.fn(),
      listar: jest.fn().mockResolvedValue([]),
    };
    const servicio = crearTurnosService({ turnosRepo: repo, serviciosService: { obtenerActivo: jest.fn() }, reloj });
    await servicio.consultar({ servicioId: 1, desde: '2026-11-05', hasta: '2026-11-10' });
    expect(repo.generar).toHaveBeenCalledTimes(1);
    expect(repo.generar).toHaveBeenCalledWith('2026-11-07', '2026-11-10');
  });
});
