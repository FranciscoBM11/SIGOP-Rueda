'use strict';

const { resumirError } = require('../src/common/registro');

describe('registro.resumirError (sin datos personales)', () => {
  test('enmascara cédulas que aparezcan en el mensaje', () => {
    const r = resumirError(new Error('fallo al procesar 001-010190-0001A'));
    expect(r.mensaje).toBe('fallo al procesar [cedula]');
    expect(JSON.stringify(r)).not.toContain('001-010190-0001A');
  });

  test('de un error de consulta SQL solo registra el número, no el mensaje', () => {
    const err = new Error("Violation of UNIQUE KEY constraint 'uq_pacientes_cedula'. The duplicate key value is (0010101900001A).");
    err.name = 'RequestError';
    err.code = 'EREQUEST';
    err.number = 2627;
    const r = resumirError(err);
    expect(r).toMatchObject({ nombre: 'RequestError', codigo: 'EREQUEST', numeroSql: 2627 });
    expect(r.mensaje).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('0010101900001A');
  });
});
