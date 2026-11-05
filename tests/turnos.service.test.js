'use strict';

// CU-02, RN-01 (sin dobles reservas) y RN-10 (solo turnos generados por horario).
const { crearTurnosService } = require('../src/modules/disponibilidad/turnos.service');
const { ErrorNegocio } = require('../src/common/errores');

const reloj = () => ({ fecha: '2026-11-09', hora: '10:15' });
const serviciosService = { obtenerActivo: jest.fn().mockResolvedValue({ id: 1, nombre: 'Papanicolaou' }) };

function fila(id, fecha, hora_inicio, ocupado = 0) {
  return { id, fecha, hora_inicio, hora_fin: '00:00', ocupado, habilitado: true };
}

function crear(repo) {
  return crearTurnosService({ turnosRepo: repo, serviciosService, reloj });
}

describe('TurnosService.consultar', () => {
  test('genera los turnos del rango, descarta los pasados y marca los ocupados (RN-01)', async () => {
    const repo = {
      generar: jest.fn(),
      listar: jest.fn().mockResolvedValue([
        fila(1, '2026-11-09', '08:00'),
        fila(2, '2026-11-09', '10:15'), // empieza ahora: ya no se ofrece
        fila(3, '2026-11-09', '10:40'),
        fila(4, '2026-11-10', '08:00', 1),
      ]),
    };
    const r = await crear(repo).consultar({ servicioId: 1, desde: '2026-11-01', hasta: '2026-11-15' });
    expect(repo.generar).toHaveBeenCalledWith('2026-11-09', '2026-11-15'); // desde se ajusta a hoy
    expect(r).toEqual([
      { id: 3, fecha: '2026-11-09', horaInicio: '10:40', horaFin: '00:00', disponible: true },
      { id: 4, fecha: '2026-11-10', horaInicio: '08:00', horaFin: '00:00', disponible: false },
    ]);
  });

  test('si la generación falla, igual lista los turnos existentes', async () => {
    const repo = { generar: jest.fn().mockRejectedValue(new Error('permiso denegado')), listar: jest.fn().mockResolvedValue([]) };
    await expect(crear(repo).consultar({ servicioId: 1, desde: '2026-11-10', hasta: '2026-11-12' })).resolves.toEqual([]);
    expect(repo.listar).toHaveBeenCalled();
  });

  test('rango totalmente pasado → lista vacía sin consultar', async () => {
    const repo = { generar: jest.fn(), listar: jest.fn() };
    expect(await crear(repo).consultar({ servicioId: 1, desde: '2026-11-01', hasta: '2026-11-05' })).toEqual([]);
    expect(repo.listar).not.toHaveBeenCalled();
  });

  test.each([
    ['hasta antes de desde', '2026-11-12', '2026-11-10', /posterior/],
    ['más de 31 días', '2026-11-10', '2026-12-11', /31 días/],
    ['más de 90 días adelante', '2027-02-01', '2027-02-10', /90 días/],
  ])('rechaza rango inválido: %s', async (_, desde, hasta, mensaje) => {
    const repo = { generar: jest.fn(), listar: jest.fn() };
    const promesa = crear(repo).consultar({ servicioId: 1, desde, hasta });
    await expect(promesa).rejects.toMatchObject({ codigo: 'RANGO_INVALIDO', http: 400 });
    await expect(crear(repo).consultar({ servicioId: 1, desde, hasta })).rejects.toThrow(mensaje);
  });

  test('E2: servicio inactivo → no consulta turnos', async () => {
    const inactivo = { obtenerActivo: jest.fn().mockRejectedValue(new ErrorNegocio('SERVICIO_NO_DISPONIBLE', 'x', 404)) };
    const repo = { generar: jest.fn(), listar: jest.fn() };
    const servicio = crearTurnosService({ turnosRepo: repo, serviciosService: inactivo, reloj });
    await expect(servicio.consultar({ servicioId: 9, desde: '2026-11-10', hasta: '2026-11-12' })).rejects.toMatchObject({
      codigo: 'SERVICIO_NO_DISPONIBLE',
    });
    expect(repo.generar).not.toHaveBeenCalled();
  });
});

describe('TurnosService.reservar (dentro de la transacción)', () => {
  const tx = {};
  const reservar = (filaTurno) => crear({ bloquearParaReserva: jest.fn().mockResolvedValue(filaTurno) }).reservar(tx, 1);

  test('turno libre y futuro → devuelve fecha y horas', async () => {
    await expect(reservar({ ...fila(1, '2026-11-10', '08:00'), hora_fin: '08:40' })).resolves.toEqual({
      id: 1,
      fecha: '2026-11-10',
      horaInicio: '08:00',
      horaFin: '08:40',
    });
  });

  test('RN-01: turno con cita activa → 409 TURNO_OCUPADO', async () => {
    await expect(reservar(fila(1, '2026-11-10', '08:00', 1))).rejects.toMatchObject({ codigo: 'TURNO_OCUPADO', http: 409 });
  });

  test('turno inexistente → 404 TURNO_NO_ENCONTRADO', async () => {
    await expect(reservar(null)).rejects.toMatchObject({ codigo: 'TURNO_NO_ENCONTRADO', http: 404 });
  });

  test.each([
    ['ya pasó', fila(1, '2026-11-09', '09:00')],
    ['deshabilitado', { ...fila(1, '2026-11-10', '08:00'), habilitado: false }],
    ['más allá de 90 días', fila(1, '2027-03-01', '08:00')],
  ])('turno %s → 409 TURNO_NO_DISPONIBLE', async (_, f) => {
    await expect(reservar(f)).rejects.toMatchObject({ codigo: 'TURNO_NO_DISPONIBLE', http: 409 });
  });
});
