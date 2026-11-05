'use strict';

// HorariosService (CU-16): la médica consulta y cambia sus días y horas de
// atención y la duración de los turnos. Al guardar, en una sola transacción:
// actualiza horarios_laborales, reajusta los turnos desde mañana (los de hoy
// no cambian) y devuelve las citas activas que quedaron fuera del horario,
// que se conservan para que recepción las gestione (E2).
const { ahoraManagua, sumarDias } = require('../../common/fechas');
const registro = require('../../common/registro');

const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_MINIMOS_GENERADOS = 14; // como los datos de demostración (02_datos_demo.sql)
const MAX_DIAS_ADELANTE = 90; // igual que la consulta pública de turnos

/** Los 7 días, con los valores guardados (o vacíos si nunca se configuró el día). */
function presentarSemana(filas) {
  const porDia = new Map(filas.map((f) => [f.diaSemana, f]));
  return NOMBRES_DIA.map((nombre, i) => {
    const f = porDia.get(i + 1);
    return {
      diaSemana: i + 1,
      nombre,
      atiende: Boolean(f?.activo),
      apertura: f?.apertura ?? null,
      cierre: f?.cierre ?? null,
      duracion: f?.duracion ?? null,
    };
  });
}

function mayor(a, b) {
  return a > b ? a : b;
}

function crearHorariosService({ transaccion, horariosRepo, reloj = ahoraManagua }) {
  return {
    /** GET /admin/disponibilidad */
    async obtener(medicoId) {
      const hoy = reloj().fecha;
      const [filas, citasFueraDeHorario] = await Promise.all([
        horariosRepo.listar(medicoId),
        horariosRepo.citasFueraDeHorario(medicoId, hoy),
      ]);
      return { horarios: presentarSemana(filas), citasFueraDeHorario };
    },

    /**
     * PUT /admin/disponibilidad
     * @param {number} medicoId usuario_id de la médica en sesión
     * @param {Array} horarios los 7 días, ya validados por guardarHorariosSchema
     */
    async guardar(medicoId, horarios) {
      const manana = sumarDias(reloj().fecha, 1);

      const resultado = await transaccion(async (tx) => {
        const actuales = new Map((await horariosRepo.bloquear(tx, medicoId)).map((f) => [f.diaSemana, f]));

        for (const dia of horarios) {
          const actual = actuales.get(dia.diaSemana);
          if (dia.atiende) {
            const valores = { apertura: dia.apertura, cierre: dia.cierre, duracion: dia.duracion };
            if (actual) await horariosRepo.actualizar(tx, actual.id, { ...valores, activo: true });
            else await horariosRepo.insertar(tx, medicoId, { diaSemana: dia.diaSemana, ...valores });
          } else if (actual?.activo) {
            // Se conserva la fila (los turnos pasados la referencian) pero inactiva.
            await horariosRepo.desactivar(tx, actual.id);
          }
        }

        // Paso 6: turnos futuros (desde mañana) según el nuevo horario.
        await horariosRepo.reajustarTurnos(tx, medicoId, manana);
        const ultima = (await horariosRepo.ultimaFechaConTurnos(tx, medicoId)) ?? manana;
        const hasta = mayor(ultima, sumarDias(manana, DIAS_MINIMOS_GENERADOS - 1));
        const tope = sumarDias(manana, MAX_DIAS_ADELANTE - 1);
        await horariosRepo.generarTurnos(tx, manana, hasta > tope ? tope : hasta);

        return {
          filas: await horariosRepo.bloquear(tx, medicoId),
          citasFueraDeHorario: await horariosRepo.citasFueraDeHorario(medicoId, manana, tx),
        };
      });

      registro.info('disponibilidad_actualizada', {
        usuarioId: medicoId,
        diasAtencion: horarios.filter((h) => h.atiende).length,
        citasFueraDeHorario: resultado.citasFueraDeHorario.length,
      });
      return { horarios: presentarSemana(resultado.filas), citasFueraDeHorario: resultado.citasFueraDeHorario };
    },
  };
}

module.exports = { crearHorariosService, presentarSemana, NOMBRES_DIA };
