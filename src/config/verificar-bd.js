'use strict';

// npm run db:verificar — comprueba la conexión a SQL Server y que la base
// tenga los datos de 02_datos_demo.sql (Fase 3, Tabla 54). Solo lee conteos.
const { obtenerPool, cerrarPool } = require('./base-datos');

const ESPERADOS = [
  { tabla: 'usuarios', minimo: 2, exacto: true },
  { tabla: 'servicios', minimo: 4, exacto: true },
  { tabla: 'preguntas_triaje', minimo: 10, exacto: true },
  { tabla: 'estudios_sugeridos', minimo: 6, exacto: true },
  { tabla: 'horarios_laborales', minimo: 5, exacto: true },
  { tabla: 'turnos', minimo: 120, exacto: false },
];

async function main() {
  let fallos = 0;
  try {
    const pool = await obtenerPool();
    console.log('Conexión a SQL Server: OK');
    for (const { tabla, minimo, exacto } of ESPERADOS) {
      // Los nombres de tabla son constantes de este archivo, no entrada del usuario.
      const { recordset } = await pool.request().query(`SELECT COUNT(*) AS total FROM dbo.${tabla}`);
      const total = recordset[0].total;
      const ok = exacto ? total === minimo : total >= minimo;
      if (!ok) fallos += 1;
      console.log(`${ok ? 'OK   ' : 'FALLA'} ${tabla}: ${total} (esperado ${exacto ? '' : '>= '}${minimo})`);
    }
  } catch (err) {
    fallos += 1;
    console.error(`Error: [${err.codigo ?? err.code ?? err.name}] ${err.message}`);
    if (err.cause) console.error(`Causa: [${err.cause.code ?? err.cause.name}] ${err.cause.message}`);
  } finally {
    await cerrarPool();
  }
  process.exitCode = fallos === 0 ? 0 : 1;
}

main();
