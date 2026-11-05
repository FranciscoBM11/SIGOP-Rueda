'use strict';

// Pruebas de integración contra la base SIGOP local (npm run test:bd).
// Usan el .env real y los datos de 02_datos_demo.sql. No corren en la CI.
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/integracion/setup-bd.js'],
  testMatch: ['<rootDir>/tests/integracion/**/*.test.js'],
  testTimeout: 60000,
  maxWorkers: 1,
};
