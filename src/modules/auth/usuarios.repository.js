'use strict';

// UsuariosRepository: cuentas del personal (dbo.usuarios).
// contrasena_hash solo se lee aquí, para compararla al iniciar sesión; nunca
// sale del módulo auth ni se devuelve en una respuesta (Fase 3, Tabla 58).
// Las fechas se comparan con el reloj de SQL Server (UTC).
const { sql } = require('../../config/base-datos');

function crearUsuariosRepository({ obtenerPool }) {
  return {
    /**
     * @returns {Promise<null | { id, usuario, contrasenaHash, nombre, rol, activo, segundosBloqueo }>}
     *   segundosBloqueo > 0 si la cuenta sigue bloqueada (RN-12).
     */
    async buscarParaAcceso(usuario) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('usuario', sql.VarChar(30), usuario)
        .query(
          `SELECT id, usuario, contrasena_hash, nombre_completo, rol, activo,
                  CASE WHEN bloqueado_hasta > SYSUTCDATETIME()
                       THEN DATEDIFF(SECOND, SYSUTCDATETIME(), bloqueado_hasta) ELSE 0 END AS segundos_bloqueo
             FROM dbo.usuarios
            WHERE usuario = @usuario`,
        );
      const f = r.recordset[0];
      if (!f) return null;
      return {
        id: f.id,
        usuario: f.usuario,
        contrasenaHash: f.contrasena_hash,
        nombre: f.nombre_completo,
        rol: f.rol,
        activo: Boolean(f.activo),
        segundosBloqueo: f.segundos_bloqueo,
      };
    },

    /**
     * Suma un intento fallido en una sola sentencia (sin carreras). Si un
     * bloqueo anterior ya venció, la cuenta empieza de nuevo en 1. Al llegar a
     * `maximo` bloquea la cuenta `minutos` (RN-12).
     * @returns {Promise<{ intentos: number, segundosBloqueo: number }>}
     */
    async registrarFallo(id, { maximo, minutos }) {
      const pool = await obtenerPool();
      const nuevo = `CASE WHEN bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= SYSUTCDATETIME() THEN 1
                          WHEN intentos_fallidos >= @maximo THEN @maximo
                          ELSE intentos_fallidos + 1 END`;
      const r = await pool
        .request()
        .input('id', sql.Int, id)
        .input('maximo', sql.TinyInt, maximo)
        .input('minutos', sql.Int, minutos)
        .query(
          `UPDATE dbo.usuarios
              SET intentos_fallidos = ${nuevo},
                  bloqueado_hasta = CASE WHEN ${nuevo} >= @maximo
                                         THEN DATEADD(MINUTE, @minutos, SYSUTCDATETIME()) ELSE NULL END
           OUTPUT inserted.intentos_fallidos AS intentos,
                  ISNULL(DATEDIFF(SECOND, SYSUTCDATETIME(), inserted.bloqueado_hasta), 0) AS segundos_bloqueo
            WHERE id = @id`,
        );
      const f = r.recordset[0];
      return { intentos: f.intentos, segundosBloqueo: f.segundos_bloqueo };
    },

    /** Ingreso correcto: reinicia el contador (CU-10 paso 6) y anota el acceso. */
    async registrarExito(id) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('id', sql.Int, id)
        .query(
          `UPDATE dbo.usuarios
              SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = SYSUTCDATETIME()
            WHERE id = @id`,
        );
    },
  };
}

module.exports = { crearUsuariosRepository };
