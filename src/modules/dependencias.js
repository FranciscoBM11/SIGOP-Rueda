'use strict';

// Inyección de dependencias manual (Fase 3, Tabla 49): aquí se crean los
// repositorios y servicios reales y se conectan entre sí. En las pruebas se
// pasan servicios simulados a crearApp() en lugar de usar esta función.
// Crear las dependencias no abre la conexión a la base (es perezosa).
const { obtenerPool, transaccion } = require('../config/base-datos');
const { obtenerConfig } = require('../config/config');

const { crearServiciosRepository } = require('./catalogo/servicios.repository');
const { crearPreguntasRepository } = require('./catalogo/preguntas.repository');
const { crearServiciosService } = require('./catalogo/servicios.service');
const { crearPreguntasService } = require('./catalogo/preguntas.service');
const { crearEstudiosRepository } = require('./calculadora/estudios.repository');
const { crearCalculadoraService } = require('./calculadora/calculadora.service');
const { crearTurnosRepository } = require('./disponibilidad/turnos.repository');
const { crearTurnosService } = require('./disponibilidad/turnos.service');
const { crearPacientesRepository } = require('./pacientes/pacientes.repository');
const { crearPacientesService } = require('./pacientes/pacientes.service');
const { crearFichasRepository } = require('./triaje/fichas.repository');
const { crearTriajeService } = require('./triaje/triaje.service');
const { crearNotificacionesRepository } = require('./notificaciones/notificaciones.repository');
const { crearNotificacionesService } = require('./notificaciones/notificaciones.service');
const { CanalCorreo } = require('./notificaciones/canal-correo');
const { CanalCorreoSimulado } = require('./notificaciones/canal-correo-simulado');
const { crearCitasRepository } = require('./citas/citas.repository');
const { crearCambiosEstadoRepository } = require('./citas/cambios-estado.repository');
const { crearCitasService } = require('./citas/citas.service');
const { crearIntentosRepository } = require('./seguridad/intentos.repository');
const { crearAccesoPublicoService } = require('./seguridad/acceso-publico.service');
const { crearTokenCita } = require('./seguridad/token-cita');
const { crearHashIp } = require('./seguridad/hash-ip');
const { crearUsuariosRepository } = require('./auth/usuarios.repository');
const { crearSesionesRepository } = require('./auth/sesiones.repository');
const { crearTokenSesion } = require('./auth/token-sesion');
const { crearAuthService } = require('./auth/auth.service');
const { crearInformesRepository } = require('./resultados/informes.repository');
const { crearInformesService } = require('./resultados/informes.service');
const { crearHorariosRepository } = require('./disponibilidad/horarios.repository');
const { crearHorariosService } = require('./disponibilidad/horarios.service');

function crearCanalCorreo() {
  const { smtp } = obtenerConfig();
  return smtp.configurado ? new CanalCorreo(smtp) : new CanalCorreoSimulado();
}

function crearDependencias() {
  const bd = { obtenerPool };
  const { secretoSesion } = obtenerConfig();

  const serviciosService = crearServiciosService({ serviciosRepo: crearServiciosRepository(bd) });
  const preguntasService = crearPreguntasService({ preguntasRepo: crearPreguntasRepository(bd), serviciosService });
  const calculadoraService = crearCalculadoraService({ estudiosRepo: crearEstudiosRepository(bd) });
  const turnosService = crearTurnosService({ turnosRepo: crearTurnosRepository(bd), serviciosService });
  const pacientesService = crearPacientesService({ pacientesRepo: crearPacientesRepository() });
  const triajeService = crearTriajeService({ fichasRepo: crearFichasRepository(bd), preguntasService });
  const notificacionesService = crearNotificacionesService({
    notificacionesRepo: crearNotificacionesRepository(bd),
    canal: crearCanalCorreo(),
  });
  const citasRepo = crearCitasRepository(bd);
  const citasService = crearCitasService({
    transaccion,
    citasRepo,
    cambiosEstadoRepo: crearCambiosEstadoRepository(),
    serviciosService,
    turnosService,
    pacientesService,
    triajeService,
    notificacionesService,
  });

  const hashIp = crearHashIp(secretoSesion);
  const tokenCita = crearTokenCita({ secreto: secretoSesion });
  const accesoPublicoService = crearAccesoPublicoService({
    intentosRepo: crearIntentosRepository(bd),
    citasRepo,
    tokenCita,
    hashIp,
  });

  const authService = crearAuthService({
    usuariosRepo: crearUsuariosRepository(bd),
    sesionesRepo: crearSesionesRepository(bd),
    tokenSesion: crearTokenSesion({ secreto: secretoSesion }),
    hashIp,
  });

  const informesService = crearInformesService({
    informesRepo: crearInformesRepository(bd),
    citasRepo,
    accesoPublicoService,
  });
  const horariosService = crearHorariosService({ transaccion, horariosRepo: crearHorariosRepository(bd) });

  return {
    serviciosService,
    preguntasService,
    calculadoraService,
    turnosService,
    citasService,
    accesoPublicoService,
    tokenCita,
    triajeService,
    authService,
    informesService,
    horariosService,
  };
}

module.exports = { crearDependencias };
