'use strict';

// AuthService (CU-10): inicio y cierre de sesión del personal, bloqueo de la
// cuenta tras 5 intentos fallidos consecutivos (RN-12) y verificación de la
// sesión en cada petición (expira tras 30 minutos sin actividad, CU-10 A2).
const bcryptPorDefecto = require('bcryptjs');
const { ErrorNegocio } = require('../../common/errores');
const registro = require('../../common/registro');
const { errorSesionExpirada } = require('./token-sesion');

const MAX_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;
const MINUTOS_INACTIVIDAD = 30;

// Hash bcrypt (costo 12) de un texto aleatorio que nadie conoce. Si el usuario
// no existe se compara contra él, para que la respuesta tarde lo mismo y no
// revele qué usuarios existen.
const HASH_FICTICIO = '$2b$12$ZLUcTz4qt/LTs/eCJImSF.f.dfdeQPIANZClnsHkG7d/i92/XtGSe';

// E1: mensaje genérico, sin decir si falló el usuario o la contraseña.
function errorCredenciales() {
  return new ErrorNegocio('CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.', 401);
}

// E2/E3: informa el tiempo restante.
function errorBloqueada(segundos) {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  return new ErrorNegocio(
    'CUENTA_BLOQUEADA',
    `La cuenta está bloqueada por ${MAX_FALLIDOS} intentos fallidos. ` +
      `Intenta de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
    423,
  );
}

function crearAuthService({
  usuariosRepo,
  sesionesRepo,
  tokenSesion,
  hashIp,
  bcrypt = bcryptPorDefecto,
  hashFicticio = HASH_FICTICIO,
}) {
  return {
    /**
     * @param {{ usuario: string, contrasena: string, ip?: string }} datos
     * @returns {Promise<{ token: string, nombre: string, rol: string }>}
     */
    async iniciarSesion({ usuario, contrasena, ip }) {
      const cuenta = await usuariosRepo.buscarParaAcceso(usuario);

      // E3: cuenta bloqueada → se informa el tiempo sin validar la contraseña.
      if (cuenta && cuenta.segundosBloqueo > 0) throw errorBloqueada(cuenta.segundosBloqueo);

      // Paso 5 (RNF-03): se compara siempre, aunque la cuenta no exista.
      const coincide = await bcrypt.compare(contrasena, cuenta?.contrasenaHash ?? hashFicticio);

      if (!cuenta || !cuenta.activo) throw errorCredenciales();

      if (!coincide) {
        const { segundosBloqueo } = await usuariosRepo.registrarFallo(cuenta.id, {
          maximo: MAX_FALLIDOS,
          minutos: MINUTOS_BLOQUEO,
        });
        if (segundosBloqueo > 0) {
          registro.warn('cuenta_bloqueada', { usuarioId: cuenta.id });
          throw errorBloqueada(segundosBloqueo);
        }
        throw errorCredenciales();
      }

      // Pasos 6 y 7.
      await usuariosRepo.registrarExito(cuenta.id);
      const sesionId = await sesionesRepo.crear({
        usuarioId: cuenta.id,
        minutosInactividad: MINUTOS_INACTIVIDAD,
        ipHash: hashIp(ip),
      });
      registro.info('sesion_iniciada', { usuarioId: cuenta.id, rol: cuenta.rol });
      return { token: tokenSesion.firmar(sesionId), nombre: cuenta.nombre, rol: cuenta.rol };
    },

    /**
     * Verifica el token de la cookie y renueva la inactividad de la sesión.
     * @returns {Promise<{ sesionId, usuarioId, nombre, rol }>}
     * @throws SESION_EXPIRADA (401)
     */
    async verificarSesion(token) {
      const sesionId = tokenSesion.verificar(token);
      const sesion = await sesionesRepo.renovar(sesionId, { minutosInactividad: MINUTOS_INACTIVIDAD });
      if (!sesion) throw errorSesionExpirada();
      return { sesionId, ...sesion };
    },

    /** CU-10 A1. Un token vencido o alterado no tiene sesión que cerrar. */
    async cerrarSesion(token) {
      let sesionId;
      try {
        sesionId = tokenSesion.verificar(token);
      } catch {
        return;
      }
      await sesionesRepo.revocar(sesionId);
    },
  };
}

module.exports = { crearAuthService, MAX_FALLIDOS, MINUTOS_BLOQUEO, MINUTOS_INACTIVIDAD, HASH_FICTICIO };
