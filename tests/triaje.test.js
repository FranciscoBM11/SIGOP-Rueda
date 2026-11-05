'use strict';

// CU-04, RN-08 (cuestionario por servicio) y RN-14 (respuestas cifradas).
const crypto = require('node:crypto');
const { validarRespuestas, crearTriajeService } = require('../src/modules/triaje/triaje.service');
const { agrupar } = require('../src/modules/catalogo/preguntas.service');
const { cifrar, descifrarTexto } = require('../src/common/cifrado');

const preguntas = [
  { id: 1, texto: 'FUM', tipo: 'FECHA', obligatoria: true, opciones: [] },
  { id: 2, texto: '¿Papanicolaou antes?', tipo: 'SI_NO', obligatoria: true, opciones: [] },
  {
    id: 3,
    texto: 'Método anticonceptivo',
    tipo: 'SELECCION',
    obligatoria: false,
    opciones: [
      { id: 10, etiqueta: 'Ninguno' },
      { id: 11, etiqueta: 'Pastillas' },
    ],
  },
  { id: 4, texto: 'Embarazos anteriores', tipo: 'NUMERO', obligatoria: false, opciones: [] },
  { id: 5, texto: 'Alergias', tipo: 'TEXTO', obligatoria: false, opciones: [] },
];

function errorDe(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('se esperaba un error');
}

describe('validarRespuestas (RN-08)', () => {
  test('acepta respuestas válidas, normaliza y omite las opcionales vacías', () => {
    const r = validarRespuestas(preguntas, [
      { preguntaId: 1, valor: '2026-10-01' },
      { preguntaId: 2, valor: 'sí' },
      { preguntaId: 3, valor: 'Pastillas' },
      { preguntaId: 4, valor: '2' },
      { preguntaId: 5, valor: '   ' },
    ]);
    expect(r).toEqual([
      { preguntaId: 1, valor: '2026-10-01' },
      { preguntaId: 2, valor: 'SI' },
      { preguntaId: 3, valor: 'Pastillas' }, // se guarda la etiqueta, no el id
      { preguntaId: 4, valor: '2' },
    ]);
  });

  test('E1: falta una obligatoria → TRIAJE_INVALIDO indicando cuál', () => {
    const err = errorDe(() => validarRespuestas(preguntas, [{ preguntaId: 1, valor: '2026-10-01' }]));
    expect(err.codigo).toBe('TRIAJE_INVALIDO');
    expect(err.http).toBe(400);
    expect(err.detalles).toEqual([{ campo: 'respuestas.2', mensaje: 'Esta pregunta es obligatoria.' }]);
  });

  test('E1: cada valor debe corresponder a su tipo', () => {
    const err = errorDe(() =>
      validarRespuestas(preguntas, [
        { preguntaId: 1, valor: '2026-02-30' },
        { preguntaId: 2, valor: 'tal vez' },
        { preguntaId: 3, valor: 'Otra' },
        { preguntaId: 4, valor: 'dos' },
      ]),
    );
    expect(err.detalles.map((d) => d.campo)).toEqual(['respuestas.1', 'respuestas.2', 'respuestas.3', 'respuestas.4']);
  });

  test('rechaza preguntas de otro servicio y respuestas repetidas', () => {
    const err = errorDe(() =>
      validarRespuestas(preguntas, [
        { preguntaId: 1, valor: '2026-10-01' },
        { preguntaId: 1, valor: '2026-10-02' },
        { preguntaId: 2, valor: 'NO' },
        { preguntaId: 99, valor: 'x' },
      ]),
    );
    expect(err.detalles).toEqual([
      { campo: 'respuestas.1', mensaje: 'La pregunta se respondió más de una vez.' },
      { campo: 'respuestas.99', mensaje: 'La pregunta no pertenece al servicio elegido.' },
    ]);
  });

  test('A2: servicio sin preguntas → sin respuestas', () => {
    expect(validarRespuestas([], [])).toEqual([]);
  });
});

describe('TriajeService.guardarFicha (RN-14)', () => {
  const clave = crypto.randomBytes(32);

  test('guarda una ficha y cada respuesta cifrada', async () => {
    const fichasRepo = { insertarFicha: jest.fn().mockResolvedValue(70), insertarRespuesta: jest.fn() };
    const servicio = crearTriajeService({ fichasRepo, preguntasService: {}, cifrar: (v) => cifrar(v, clave) });
    const tx = {};
    await servicio.guardarFicha(tx, 5, [
      { preguntaId: 1, valor: '2026-10-01' },
      { preguntaId: 2, valor: 'SI' },
    ]);
    expect(fichasRepo.insertarFicha).toHaveBeenCalledWith(tx, 5);
    expect(fichasRepo.insertarRespuesta).toHaveBeenCalledTimes(2);
    const [, fichaId, preguntaId, valorCifrado] = fichasRepo.insertarRespuesta.mock.calls[0];
    expect([fichaId, preguntaId]).toEqual([70, 1]);
    expect(Buffer.isBuffer(valorCifrado)).toBe(true);
    expect(valorCifrado.includes(Buffer.from('2026-10-01'))).toBe(false);
    expect(descifrarTexto(valorCifrado, clave)).toBe('2026-10-01');
  });

  test('sin respuestas no crea ficha (CU-04, A2)', async () => {
    const fichasRepo = { insertarFicha: jest.fn(), insertarRespuesta: jest.fn() };
    const servicio = crearTriajeService({ fichasRepo, preguntasService: {} });
    expect(await servicio.guardarFicha({}, 5, [])).toBeNull();
    expect(fichasRepo.insertarFicha).not.toHaveBeenCalled();
  });

  test('validar() usa el cuestionario del servicio elegido', async () => {
    const preguntasService = { listarPorServicio: jest.fn().mockResolvedValue(preguntas) };
    const servicio = crearTriajeService({ fichasRepo: {}, preguntasService });
    await servicio.validar(3, [
      { preguntaId: 1, valor: '2026-10-01' },
      { preguntaId: 2, valor: 'NO' },
    ]);
    expect(preguntasService.listarPorServicio).toHaveBeenCalledWith(3);
  });
});

describe('PreguntasService.agrupar', () => {
  test('agrupa filas pregunta × opción conservando el orden', () => {
    const filas = [
      { id: 1, texto: 'A', tipo_respuesta: 'FECHA', obligatoria: true, opcion_id: null },
      { id: 3, texto: 'B', tipo_respuesta: 'SELECCION', obligatoria: false, opcion_id: 10, opcion_etiqueta: 'Ninguno' },
      { id: 3, texto: 'B', tipo_respuesta: 'SELECCION', obligatoria: false, opcion_id: 11, opcion_etiqueta: 'Pastillas' },
    ];
    expect(agrupar(filas)).toEqual([
      { id: 1, texto: 'A', tipo: 'FECHA', obligatoria: true, opciones: [] },
      {
        id: 3,
        texto: 'B',
        tipo: 'SELECCION',
        obligatoria: false,
        opciones: [
          { id: 10, etiqueta: 'Ninguno' },
          { id: 11, etiqueta: 'Pastillas' },
        ],
      },
    ]);
  });
});
