'use strict';

// Valores ficticios para que las pruebas (y la CI) corran sin base de datos
// ni archivo .env. Nunca usar datos reales aquí.
process.env.NODE_ENV = 'test';
process.env.DB_SERVIDOR = 'localhost';
process.env.DB_NOMBRE = 'SIGOP_PRUEBAS';
process.env.DB_USUARIO = 'usuario_prueba';
process.env.DB_CLAVE = 'clave_prueba';
process.env.DB_CIFRAR = 'false';
process.env.DB_CONFIAR_CERTIFICADO = 'true';
process.env.CLAVE_CIFRADO = '0'.repeat(64);
process.env.SECRETO_SESION = 'secreto-de-pruebas-de-al-menos-32-caracteres';
