'use strict';

// CU-14: TriajeService.consultarFicha descifra las respuestas (RN-14) en el
// orden del cuestionario.
const { crearTriajeService } = require('../src/modules/triaje/triaje.service');
const { cifrar } = require('../src/common/cifrado');

const CLAVE = Buffer.alloc(32, 7);

function armar(ficha) {
  const fichasRepo = { obtenerPorCita: jest.fn().mockResolvedValue(ficha) };
  const triaje = crearTriajeService({
    fichasRepo,
    preguntasService: {},
    descifrar: (paquete) => require('../src/common/cifrado').descifrarTexto(paquete, CLAVE),
  });
  return { fichasRepo, triaje };
}

test('devuelve pregunta, tipo y valor descifrado, en el orden del repositorio', async () => {
  const { fichasRepo, triaje } = armar({
    fechaRegistro: '2026-11-05T15:00:00Z',
    respuestas: [
      { preguntaId: 6, texto: 'Fecha de su última menstruación (FUM)', tipo: 'FECHA', valorCifrado: cifrar('2026-03-02', CLAVE) },
      { preguntaId: 7, texto: 'Número de embarazos anteriores', tipo: 'NUMERO', valorCifrado: cifrar('1', CLAVE) },
      { preguntaId: 8, texto: '¿Presenta sangrado?', tipo: 'SI_NO', valorCifrado: cifrar('NO', CLAVE) },
    ],
  });
  const r = await triaje.consultarFicha(7);
  expect(fichasRepo.obtenerPorCita).toHaveBeenCalledWith(7);
  expect(r).toEqual({
    fechaRegistro: '2026-11-05T15:00:00Z',
    respuestas: [
      { pregunta: 'Fecha de su última menstruación (FUM)', tipo: 'FECHA', valor: '2026-03-02' },
      { pregunta: 'Número de embarazos anteriores', tipo: 'NUMERO', valor: '1' },
      { pregunta: '¿Presenta sangrado?', tipo: 'SI_NO', valor: 'NO' },
    ],
  });
});

test('E1: la cita no tiene ficha → null', async () => {
  const { triaje } = armar(null);
  await expect(triaje.consultarFicha(7)).resolves.toBeNull();
});

test('una respuesta alterada (o cifrada con otra clave) se devuelve con valor null sin romper la ficha', async () => {
  const { triaje } = armar({
    fechaRegistro: '2026-11-05T15:00:00Z',
    respuestas: [
      { preguntaId: 1, texto: 'A', tipo: 'TEXTO', valorCifrado: cifrar('bien', CLAVE) },
      { preguntaId: 2, texto: 'B', tipo: 'TEXTO', valorCifrado: cifrar('otra clave', Buffer.alloc(32, 1)) },
    ],
  });
  const r = await triaje.consultarFicha(7);
  expect(r.respuestas.map((x) => x.valor)).toEqual(['bien', null]);
});
