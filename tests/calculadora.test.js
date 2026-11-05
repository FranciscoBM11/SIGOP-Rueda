'use strict';

// CU-01 y RN-13 (Regla de Naegele).
const { ErrorNegocio } = require('../src/common/errores');
const {
  calcularFpp,
  calcularGestacion,
  trimestreDe,
  crearCalculadoraService,
} = require('../src/modules/calculadora/calculadora.service');
const { ahoraManagua, sumarMeses } = require('../src/common/fechas');

describe('RN-13 – Regla de Naegele (FUM + 7 días − 3 meses + 1 año)', () => {
  test.each([
    ['2026-01-01', '2026-10-08'],
    ['2026-03-10', '2026-12-17'],
    ['2026-06-28', '2027-04-05'], // + 7 días cruza de mes
    ['2025-12-28', '2026-10-04'], // + 7 días cruza de año
    ['2026-05-24', '2027-02-28'], // 31 de mayo − 3 meses: último día de febrero
    ['2027-05-24', '2028-02-29'], // ... en año bisiesto
  ])('FUM %s → FPP %s', (fum, fpp) => {
    expect(calcularFpp(fum)).toBe(fpp);
  });
});

describe('calcularGestacion', () => {
  test('semanas, días y trimestre', () => {
    expect(calcularGestacion('2026-11-05', '2026-11-05')).toMatchObject({ semanas: 0, dias: 0, trimestre: 1 });
    expect(calcularGestacion('2026-08-01', '2026-11-05')).toMatchObject({ semanas: 13, dias: 5, trimestre: 1 });
    expect(calcularGestacion('2026-07-30', '2026-11-05')).toMatchObject({ semanas: 14, dias: 0, trimestre: 2 });
    expect(calcularGestacion('2026-04-23', '2026-11-05')).toMatchObject({ semanas: 28, dias: 0, trimestre: 3 });
  });

  test('límites del trimestre', () => {
    expect([13, 14, 27, 28, 42].map(trimestreDe)).toEqual([1, 2, 2, 3, 3]);
  });

  test('E1: FUM futura → FUM_FUTURA', () => {
    expect(() => calcularGestacion('2026-11-06', '2026-11-05')).toThrow(ErrorNegocio);
    try {
      calcularGestacion('2026-11-06', '2026-11-05');
    } catch (err) {
      expect(err.codigo).toBe('FUM_FUTURA');
      expect(err.http).toBe(400);
    }
  });

  test('E2: 294 días se acepta; 295 → FUM_FUERA_DE_RANGO', () => {
    expect(calcularGestacion('2026-01-15', '2026-11-05').semanas).toBe(42); // 294 días
    expect(() => calcularGestacion('2026-01-14', '2026-11-05')).toThrow(/42 semanas/);
  });
});

describe('CalculadoraService', () => {
  test('devuelve los estudios del trimestre calculado', async () => {
    const estudiosRepo = { listarPorTrimestre: jest.fn().mockResolvedValue([{ nombre: 'Ecografía', descripcion: 'd', extra: 1 }]) };
    const servicio = crearCalculadoraService({ estudiosRepo, reloj: () => ({ fecha: '2026-11-05', hora: '10:00' }) });
    const r = await servicio.calcular('2026-07-30');
    expect(estudiosRepo.listarPorTrimestre).toHaveBeenCalledWith(2);
    expect(r).toEqual({ fpp: '2027-05-06', semanas: 14, dias: 0, trimestre: 2, estudios: [{ nombre: 'Ecografía', descripcion: 'd' }] });
  });
});

describe('fechas en America/Managua', () => {
  test('ahoraManagua usa UTC−6 (las 03:00 UTC son las 21:00 del día anterior)', () => {
    expect(ahoraManagua(new Date('2026-11-06T03:00:00Z'))).toEqual({ fecha: '2026-11-05', hora: '21:00' });
  });

  test('sumarMeses ajusta al último día del mes', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28');
  });
});
