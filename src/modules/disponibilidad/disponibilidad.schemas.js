'use strict';

// guardarHorariosSchema (CU-16 paso 4, RN-10): los 7 días de la semana, cada
// uno con «atiende» y, si atiende, apertura < cierre (ER-10) y una duración de
// turno de 30 a 45 minutos que quepa al menos una vez en la jornada.
const { z } = require('zod');
const { esquemas } = require('../../common/validadores');

const DURACION_MIN = 30;
const DURACION_MAX = 45;

const minutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const diaSchema = z
  .strictObject({
    diaSemana: z
      .number({ message: 'El día debe ser un número del 1 (lunes) al 7 (domingo).' })
      .int('El día debe ser un número del 1 (lunes) al 7 (domingo).')
      .min(1, 'El día debe ser un número del 1 (lunes) al 7 (domingo).')
      .max(7, 'El día debe ser un número del 1 (lunes) al 7 (domingo).'),
    atiende: z.boolean({ message: 'Indica si atiende ese día.' }),
    apertura: esquemas.hora.nullish(),
    cierre: esquemas.hora.nullish(),
    duracion: z
      .number({ message: 'La duración debe ser un número de minutos.' })
      .int('La duración debe ser un número entero de minutos.')
      .min(DURACION_MIN, `La duración del turno debe estar entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`)
      .max(DURACION_MAX, `La duración del turno debe estar entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`)
      .nullish(),
  })
  .superRefine((d, ctx) => {
    if (!d.atiende) return;
    if (!d.apertura) ctx.addIssue({ code: 'custom', path: ['apertura'], message: 'Indica la hora de apertura.' });
    if (!d.cierre) ctx.addIssue({ code: 'custom', path: ['cierre'], message: 'Indica la hora de cierre.' });
    if (d.duracion == null) ctx.addIssue({ code: 'custom', path: ['duracion'], message: 'Indica la duración del turno.' });
    if (!d.apertura || !d.cierre) return;
    const jornada = minutos(d.cierre) - minutos(d.apertura);
    if (jornada <= 0) {
      ctx.addIssue({ code: 'custom', path: ['cierre'], message: 'La hora de cierre debe ser posterior a la de apertura.' });
    } else if (d.duracion != null && jornada < d.duracion) {
      ctx.addIssue({ code: 'custom', path: ['cierre'], message: 'La jornada es más corta que un turno.' });
    }
  });

const guardarHorariosSchema = z
  .strictObject({
    horarios: z.array(diaSchema, { message: 'Envía los horarios de la semana.' }).length(7, 'Envía los 7 días de la semana.'),
  })
  .superRefine(({ horarios }, ctx) => {
    const dias = new Set(horarios.map((h) => h.diaSemana));
    if (dias.size !== horarios.length) {
      ctx.addIssue({ code: 'custom', path: ['horarios'], message: 'Cada día de la semana debe aparecer una sola vez.' });
    }
    if (!horarios.some((h) => h.atiende)) {
      ctx.addIssue({ code: 'custom', path: ['horarios'], message: 'Marca al menos un día de atención.' });
    }
  });

module.exports = { guardarHorariosSchema, minutos, DURACION_MIN, DURACION_MAX };
