'use strict';

// RN-09 y ER-08: el informe es un PDF real de hasta 10 MB (no basta la extensión).
const { validarPdf, normalizarNombre, MAX_BYTES } = require('../src/modules/resultados/validar-pdf');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');

function archivo(cambios = {}) {
  return { nombreOriginal: 'eco_pelvica_CR-04821.pdf', tipo: 'application/pdf', contenido: PDF, ...cambios };
}

function codigoDe(fn) {
  try {
    fn();
  } catch (err) {
    return { codigo: err.codigo, http: err.http };
  }
  return null;
}

describe('validarPdf (RN-09)', () => {
  test('acepta un PDF válido y conserva el guion del nombre (ER-08 de la Fase 3)', () => {
    expect(validarPdf(archivo())).toEqual({ nombre: 'eco_pelvica_CR-04821.pdf', tamanoBytes: PDF.length });
  });

  test('acepta application/x-pdf y extensión en mayúsculas', () => {
    expect(validarPdf(archivo({ nombreOriginal: 'INFORME.PDF', tipo: 'application/x-pdf' })).nombre).toBe('INFORME.pdf');
  });

  test.each([
    ['extensión distinta (E1)', { nombreOriginal: 'informe.docx' }, 'ARCHIVO_NO_PDF'],
    ['doble extensión', { nombreOriginal: 'informe.pdf.exe' }, 'ARCHIVO_NO_PDF'],
    ['tipo declarado distinto', { tipo: 'image/png' }, 'ARCHIVO_NO_PDF'],
    ['sin tipo', { tipo: undefined }, 'ARCHIVO_NO_PDF'],
    ['otro archivo renombrado a .pdf (contenido real)', { contenido: Buffer.from('MZ\x90\x00 ejecutable', 'latin1') }, 'ARCHIVO_NO_PDF'],
    ['HTML renombrado a .pdf', { contenido: Buffer.from('<html>%PDF-1.4</html>%%EOF') }, 'ARCHIVO_NO_PDF'],
    ['PDF cortado, sin %%EOF (E4)', { contenido: Buffer.from('%PDF-1.7\n1 0 obj << >>') }, 'ARCHIVO_DANADO'],
    ['vacío', { contenido: Buffer.alloc(0) }, 'ARCHIVO_VACIO'],
  ])('rechaza %s con 422', (_, cambios, codigo) => {
    expect(codigoDe(() => validarPdf(archivo(cambios)))).toEqual({ codigo, http: 422 });
  });

  test('rechaza más de 10 MB (E2) y acepta exactamente 10 MB', () => {
    const grande = Buffer.alloc(MAX_BYTES + 1, 0x20);
    PDF.copy(grande, 0, 0, 9);
    grande.write('%%EOF', grande.length - 6, 'latin1');
    expect(codigoDe(() => validarPdf(archivo({ contenido: grande })))).toEqual({ codigo: 'ARCHIVO_DEMASIADO_GRANDE', http: 422 });

    const justo = grande.subarray(1); // 10 MB exactos
    justo.write('%PDF-1.4', 0, 'latin1');
    expect(validarPdf(archivo({ contenido: justo })).tamanoBytes).toBe(MAX_BYTES);
  });
});

describe('normalizarNombre (ER-08)', () => {
  test.each([
    ['Ecografía pélvica.pdf', 'Ecografia pelvica.pdf'],
    ['C:\\Users\\x\\Documentos\\informe final.pdf', 'informe final.pdf'],
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['resultado "final" <1>.pdf', 'resultado _final_ _1_.pdf'],
    ['ñandú (copia).PDF', 'nandu _copia_.pdf'],
    ['.pdf', 'informe.pdf'],
    ['___.pdf', 'informe.pdf'],
    ['sin-extension', null],
  ])('%s → %s', (original, esperado) => {
    expect(normalizarNombre(original)).toBe(esperado);
  });

  test('recorta nombres largos a 100 caracteres en total', () => {
    const nombre = normalizarNombre(`${'a'.repeat(150)}.pdf`);
    expect(nombre).toHaveLength(100);
    expect(nombre.endsWith('.pdf')).toBe(true);
  });
});
