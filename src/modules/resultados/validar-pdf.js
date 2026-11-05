'use strict';

// validarPdf (Fase 3, Tabla 49; RN-09, ER-08): un informe es un PDF real de
// hasta 10 MB. No basta con la extensión: se revisan el tipo declarado, la
// firma inicial %PDF-x.y y el marcador final %%EOF (archivo completo, E4).
const path = require('node:path');
const { ErrorNegocio } = require('../../common/errores');
const { ER } = require('../../common/validadores');

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (RN-09, CHECK de informes_resultado)
const MAX_NOMBRE = 100; // nombre_archivo NVARCHAR(100)
const TIPOS_ACEPTADOS = new Set(['application/pdf', 'application/x-pdf']);
const FIRMA = /^%PDF-\d\.\d/;
const BYTES_FINALES = 1024; // %%EOF debe estar cerca del final (puede haber saltos de línea)

// ER-08 ajustada en la Fase 3: admite también el guion («eco_pelvica_CR-04821.pdf»,
// el propio ejemplo de la Fase 2). \w sin la bandera u solo admite ASCII.
const ER_NOMBRE = ER.NOMBRE_ARCHIVO;

function errorArchivo(codigo, mensaje) {
  return new ErrorNegocio(codigo, mensaje, 422);
}

const NO_ES_PDF = 'Solo se aceptan archivos PDF (.pdf).';

/**
 * Normaliza el nombre original: sin ruta, sin tildes y con «_» en lugar de
 * cualquier carácter fuera de ER-08. Devuelve null si no termina en .pdf.
 */
function normalizarNombre(original) {
  const base = path.basename(String(original ?? '').replaceAll('\\', '/')).trim();
  const coincidencia = /^(.*)\.pdf$/i.exec(base);
  if (!coincidencia) return null;
  let raiz = coincidencia[1]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w. -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (raiz === '' || /^[._ -]+$/.test(raiz)) raiz = 'informe';
  raiz = raiz.slice(0, MAX_NOMBRE - 4).trim();
  const nombre = `${raiz}.pdf`;
  return ER_NOMBRE.test(nombre) ? nombre : null;
}

/**
 * @param {{ nombreOriginal: string, tipo: string, contenido: Buffer }} archivo
 * @returns {{ nombre: string, tamanoBytes: number }}
 * @throws ErrorNegocio 422 ARCHIVO_NO_PDF | ARCHIVO_VACIO | ARCHIVO_DEMASIADO_GRANDE | ARCHIVO_DANADO
 */
function validarPdf({ nombreOriginal, tipo, contenido }) {
  // E1: extensión y tipo declarado.
  const nombre = normalizarNombre(nombreOriginal);
  if (!nombre) throw errorArchivo('ARCHIVO_NO_PDF', NO_ES_PDF);
  if (!TIPOS_ACEPTADOS.has(String(tipo ?? '').toLowerCase())) throw errorArchivo('ARCHIVO_NO_PDF', NO_ES_PDF);

  // E2: tamaño.
  if (!Buffer.isBuffer(contenido) || contenido.length === 0) {
    throw errorArchivo('ARCHIVO_VACIO', 'El archivo está vacío.');
  }
  if (contenido.length > MAX_BYTES) {
    throw errorArchivo('ARCHIVO_DEMASIADO_GRANDE', 'El archivo supera el límite de 10 MB.');
  }

  // E1/E4: contenido real. Un archivo renombrado a .pdf no tiene la firma;
  // uno cortado o dañado no tiene el marcador final.
  if (!FIRMA.test(contenido.subarray(0, 8).toString('latin1'))) {
    throw errorArchivo('ARCHIVO_NO_PDF', 'El archivo no es un PDF válido, aunque su nombre termine en .pdf.');
  }
  const final = contenido.subarray(Math.max(0, contenido.length - BYTES_FINALES)).toString('latin1');
  if (!final.includes('%%EOF')) {
    throw errorArchivo('ARCHIVO_DANADO', 'El PDF está incompleto o dañado. Vuelve a generarlo o escanearlo.');
  }

  return { nombre, tamanoBytes: contenido.length };
}

module.exports = { validarPdf, normalizarNombre, MAX_BYTES, ER_NOMBRE };
