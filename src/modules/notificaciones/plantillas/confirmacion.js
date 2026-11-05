'use strict';

// Plantilla del comprobante de cita (CU-05, paso 3): código, servicio, fecha,
// hora e indicaciones previas. Todo valor variable se escapa en el HTML.

const escapar = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const formatoFechaLarga = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** '2026-11-09' → 'lunes, 9 de noviembre de 2026' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return formatoFechaLarga.format(new Date(Date.UTC(a, m - 1, d)));
}

/**
 * @param {{ nombres, codigo, servicio, fecha, horaInicio, horaFin, indicaciones }} d
 * @returns {{ asunto: string, texto: string, html: string }}
 */
function plantillaConfirmacion(d) {
  const fecha = fechaLarga(d.fecha);
  const horario = `${d.horaInicio} a ${d.horaFin}`;
  const indicaciones = d.indicaciones || 'No requiere preparación especial.';

  const texto = [
    `Hola, ${d.nombres}:`,
    '',
    'Tu cita en la Clínica Rueda quedó confirmada.',
    '',
    `Código de cita: ${d.codigo}`,
    `Servicio: ${d.servicio}`,
    `Fecha: ${fecha}`,
    `Hora: ${horario}`,
    '',
    `Indicaciones previas: ${indicaciones}`,
    '',
    'Guarda tu código: junto con tu cédula te permite cancelar o reprogramar la cita y consultar tus resultados.',
    '',
    'Clínica Rueda – Ginecología y Obstetricia',
  ].join('\n');

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;background:#F5F1F6;font-family:Arial,Helvetica,sans-serif;color:#2B2233">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#8A2D5C;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <strong style="font-size:18px">Clínica Rueda</strong><br><span style="font-size:13px">Ginecología y Obstetricia</span>
  </div>
  <div style="background:#fff;padding:20px;border-radius:0 0 8px 8px">
    <p>Hola, ${escapar(d.nombres)}:</p>
    <p>Tu cita quedó <strong style="color:#2E6B5E">confirmada</strong>.</p>
    <p style="font-size:13px;color:#5E5468;margin-bottom:4px">Código de cita</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:2px;margin-top:0;color:#8A2D5C">${escapar(d.codigo)}</p>
    <table style="border-collapse:collapse;font-size:15px">
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Servicio</td><td>${escapar(d.servicio)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Fecha</td><td>${escapar(fecha)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Hora</td><td>${escapar(horario)}</td></tr>
    </table>
    <p style="margin-top:16px"><strong>Indicaciones previas:</strong><br>${escapar(indicaciones)}</p>
    <p style="font-size:13px;color:#5E5468">Guarda tu código: junto con tu cédula te permite cancelar o reprogramar la cita y consultar tus resultados.</p>
  </div>
</div>
</body></html>`;

  return { asunto: `Cita confirmada ${d.codigo} – Clínica Rueda`, texto, html };
}

module.exports = { plantillaConfirmacion, fechaLarga };
