'use strict';

// Plantilla del correo de reprogramación (CU-07 paso 8, vía CU-05): mismo
// código, horario anterior y nuevo horario. Todo valor variable se escapa.
const { fechaLarga, escapar } = require('./confirmacion');

/**
 * @param {{ nombres, codigo, servicio, fecha, horaInicio, horaFin, indicaciones,
 *           anterior: { fecha, horaInicio } }} d
 * @returns {{ asunto: string, texto: string, html: string }}
 */
function plantillaReprogramacion(d) {
  const fecha = fechaLarga(d.fecha);
  const horario = `${d.horaInicio} a ${d.horaFin}`;
  const antes = `${fechaLarga(d.anterior.fecha)}, ${d.anterior.horaInicio}`;
  const indicaciones = d.indicaciones || 'No requiere preparación especial.';

  const texto = [
    `Hola, ${d.nombres}:`,
    '',
    'Tu cita en la Clínica Rueda fue reprogramada. Conservas el mismo código.',
    '',
    `Código de cita: ${d.codigo}`,
    `Servicio: ${d.servicio}`,
    `Nueva fecha: ${fecha}`,
    `Nueva hora: ${horario}`,
    `Horario anterior (ya liberado): ${antes}`,
    '',
    `Indicaciones previas: ${indicaciones}`,
    '',
    'Si no hiciste este cambio, comunícate con la clínica.',
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
    <p>Tu cita fue <strong style="color:#2E6B5E">reprogramada</strong>. Conservas el mismo código.</p>
    <p style="font-size:13px;color:#5E5468;margin-bottom:4px">Código de cita</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:2px;margin-top:0;color:#8A2D5C">${escapar(d.codigo)}</p>
    <table style="border-collapse:collapse;font-size:15px">
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Servicio</td><td>${escapar(d.servicio)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Nueva fecha</td><td><strong>${escapar(fecha)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Nueva hora</td><td><strong>${escapar(horario)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#5E5468">Antes</td><td style="text-decoration:line-through;color:#5E5468">${escapar(antes)}</td></tr>
    </table>
    <p style="margin-top:16px"><strong>Indicaciones previas:</strong><br>${escapar(indicaciones)}</p>
    <p style="font-size:13px;color:#5E5468">Si no hiciste este cambio, comunícate con la clínica.</p>
  </div>
</div>
</body></html>`;

  return { asunto: `Cita reprogramada ${d.codigo} – Clínica Rueda`, texto, html };
}

module.exports = { plantillaReprogramacion };
