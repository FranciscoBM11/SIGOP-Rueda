'use strict';

const { ER, esFechaValida, esquemas } = require('../src/common/validadores');

describe('Expresiones regulares ER-01 a ER-10 (Fase 2, Tabla 34)', () => {
  const casos = [
    ['CEDULA (ER-01)', ER.CEDULA, ['001-150390-0012K'], ['001-150390-0012k', '0011503900012K', '001-150390-001K', '']],
    ['NOMBRES (ER-02)', ER.NOMBRES, ['María José López', 'Ñusta Úrsula'], ['Al', 'Ana2', 'Ana-María', 'a'.repeat(81)]],
    ['TELEFONO (ER-03)', ER.TELEFONO, ['88123456', '22501234', '57123456', '77123456'], ['18123456', '8812345', '881234567', '8812345a']],
    ['CORREO (ER-04)', ER.CORREO, ['maria.lopez@gmail.com', 'a+b@c.co'], ['maria@', '@gmail.com', 'maria@gmail', 'ma ria@gmail.com']],
    ['CODIGO_CITA (ER-05)', ER.CODIGO_CITA, ['CR-04821', 'CR-00000'], ['CR-4821', 'cr-04821', 'CR-048210', 'XX-04821']],
    ['USUARIO (ER-06)', ER.USUARIO, ['recepcion.lira', 'dra_rueda'], ['abc', 'Dra.Rueda', 'a'.repeat(31)]],
    ['CONTRASENA (ER-07)', ER.CONTRASENA, ['Clinica2026'], ['clinica2026', 'CLINICA2026', 'Clinicaaa', 'Cl1']],
    ['NOMBRE_ARCHIVO (ER-08)', ER.NOMBRE_ARCHIVO, ['eco_pelvica_CR04821.pdf', 'eco_pelvica_CR-04821.pdf', 'informe.PDF'], ['informe.exe', 'informe.pdf.exe', '.pdf']],
    ['FECHA (ER-09)', ER.FECHA, ['2026-11-20'], ['2026-13-01', '2026-1-01', '20-11-2026']],
    ['HORA (ER-10)', ER.HORA, ['14:30', '00:00', '23:59'], ['24:00', '9:30', '12:60']],
  ];

  test.each(casos)('%s acepta los válidos y rechaza los inválidos', (_, er, validos, invalidos) => {
    for (const v of validos) expect(er.test(v)).toBe(true);
    for (const v of invalidos) expect(er.test(v)).toBe(false);
  });
});

describe('esFechaValida', () => {
  test('rechaza días que no existen', () => {
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-04-31')).toBe(false);
    expect(esFechaValida(20261101)).toBe(false);
  });
});

describe('esquemas zod compartidos', () => {
  test('cedula se normaliza a mayúsculas y sin espacios', () => {
    expect(esquemas.cedula.parse(' 001-150390-0012k ')).toBe('001-150390-0012K');
  });

  test('nombres colapsa espacios repetidos', () => {
    expect(esquemas.nombres.parse('  María   José ')).toBe('María José');
  });

  test('correo con más de 100 caracteres se rechaza', () => {
    const largo = `${'a'.repeat(95)}@gmail.com`;
    expect(esquemas.correo.safeParse(largo).success).toBe(false);
  });

  test('los mensajes de error son claros y en español', () => {
    const r = esquemas.telefono.safeParse('123');
    expect(r.success).toBe(false);
    expect(r.error.issues[0].message).toMatch(/8 dígitos/);
  });

  test('id acepta texto numérico (query) y rechaza no enteros', () => {
    expect(esquemas.id.parse('7')).toBe(7);
    expect(esquemas.id.safeParse('1.5').success).toBe(false);
    expect(esquemas.id.safeParse('-1').success).toBe(false);
    expect(esquemas.id.safeParse('abc').success).toBe(false);
  });
});
