'use strict';

// Fechas de calendario en la zona de la clínica (America/Managua, UTC-6 sin
// horario de verano). Las fechas se manejan como texto ISO 'AAAA-MM-DD' y las
// horas como 'HH:MM' para no depender de la zona del servidor (Render usa UTC).
const ZONA = 'America/Managua';

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Fecha y hora actuales en Managua: { fecha: 'AAAA-MM-DD', hora: 'HH:MM' }. */
function ahoraManagua(instante = new Date()) {
  return { fecha: formatoFecha.format(instante), hora: formatoHora.format(instante) };
}

function aUtc(fechaIso) {
  const [a, m, d] = fechaIso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aIso(fechaUtc) {
  return fechaUtc.toISOString().slice(0, 10);
}

function sumarDias(fechaIso, dias) {
  const f = aUtc(fechaIso);
  f.setUTCDate(f.getUTCDate() + dias);
  return aIso(f);
}

/**
 * Suma meses; si el día no existe en el mes destino se usa el último día
 * (31 de mayo + 9 meses = 28 o 29 de febrero).
 */
function sumarMeses(fechaIso, meses) {
  const f = aUtc(fechaIso);
  const dia = f.getUTCDate();
  const destino = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimoDia));
  return aIso(destino);
}

/** Días completos de 'desde' a 'hasta' (negativo si 'hasta' es anterior). */
function diferenciaDias(desde, hasta) {
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86400000);
}

module.exports = { ZONA, ahoraManagua, sumarDias, sumarMeses, diferenciaDias };
