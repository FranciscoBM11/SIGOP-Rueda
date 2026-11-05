'use strict';

// IntentosRepository: intentos de acceso público con cédula y código (RN-15).
// Las fechas se comparan con el reloj de SQL Server (UTC) para no depender
// del reloj del servidor de la aplicación.
const { sql } = require('../../config/base-datos');

function crearIntentosRepository({ obtenerPool }) {
  return {
    /**
     * Fallidos de la cédula dentro de la ventana y posteriores a su último
     * acceso exitoso ("consecutivos"), del más reciente al más antiguo.
     * Para cada uno devuelve los segundos que le faltan para salir de la ventana.
     * @returns {Promise<Array<{ segundosRestantes: number }>>} como máximo `limite` filas
     */
    async fallidosRecientes(cedula, { ventanaMinutos, limite }) {
      const pool = await obtenerPool();
      const r = await pool
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .input('ventana', sql.Int, ventanaMinutos)
        .input('limite', sql.Int, limite)
        .query(
          `SELECT TOP (@limite)
                  DATEDIFF(SECOND, SYSUTCDATETIME(), DATEADD(MINUTE, @ventana, i.fecha_hora)) AS segundos_restantes
             FROM dbo.intentos_acceso i
            WHERE i.cedula_ingresada = @cedula
              AND i.exitoso = 0
              AND i.fecha_hora > DATEADD(MINUTE, -@ventana, SYSUTCDATETIME())
              -- posteriores al último exitoso (id IDENTITY = orden de inserción)
              AND i.id > ISNULL((SELECT MAX(e.id) FROM dbo.intentos_acceso e
                                  WHERE e.cedula_ingresada = @cedula AND e.exitoso = 1), 0)
            ORDER BY i.id DESC`,
        );
      return r.recordset.map((f) => ({ segundosRestantes: f.segundos_restantes }));
    },

    async registrar({ cedula, exitoso, ipHash }) {
      const pool = await obtenerPool();
      await pool
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .input('exitoso', sql.Bit, exitoso)
        .input('ipHash', sql.Char(64), ipHash)
        .query(
          `INSERT INTO dbo.intentos_acceso (cedula_ingresada, exitoso, ip_hash)
           VALUES (@cedula, @exitoso, @ipHash)`,
        );
    },
  };
}

module.exports = { crearIntentosRepository };
