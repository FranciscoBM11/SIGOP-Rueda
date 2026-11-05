'use strict';

// CU-09 y CU-15 sin base de datos: RN-09 (PDF de hasta 10 MB vinculado a una
// cita), RN-14 (cifrado AES-256-GCM + SHA-256), RN-15 (acceso compartido con
// «Mi cita») y que la descarga solo entregue informes de la cita del token.
const crypto = require('node:crypto');
const { crearInformesService, motivoSinInforme } = require('../src/modules/resultados/informes.service');
const { cifrar, descifrar } = require('../src/common/cifrado');

const reloj = () => ({ fecha: '2026-11-09', hora: '10:00' });
const PDF = Buffer.from('%PDF-1.4\nContenido ficticio de prueba\n%%EOF\n', 'latin1');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

const citaHoy = { id: 7, codigo: 'CR-04801', estado: 'ATENDIDA', fecha: '2026-11-09', servicio: 'Ecografía Pélvica' };

function crear(cambios = {}) {
  const informesRepo = {
    insertar: jest.fn(async (d) => ({ id: 31, nombre: d.nombre, tamanoBytes: d.tamanoBytes, fechaCarga: '2026-11-09T16:00:00Z' })),
    listarPorCita: jest.fn().mockResolvedValue([]),
    obtenerArchivo: jest.fn(),
    pacienteConCitas: jest.fn(),
    ...cambios.informesRepo,
  };
  const citasRepo = { buscarPorCodigo: jest.fn().mockResolvedValue(citaHoy), ...cambios.citasRepo };
  const accesoPublicoService = {
    verificarCedulaYCodigo: jest.fn().mockResolvedValue(citaHoy),
    emitirToken: jest.fn().mockReturnValue('to.k.en'),
    ...cambios.accesoPublicoService,
  };
  const servicio = crearInformesService({ informesRepo, citasRepo, accesoPublicoService, reloj });
  return { servicio, informesRepo, citasRepo, accesoPublicoService };
}

const archivo = { nombreOriginal: 'Ecografía pélvica.pdf', tipo: 'application/pdf', contenido: PDF };

describe('motivoSinInforme (decisión de la Iteración 4)', () => {
  const ahora = reloj();
  test.each([
    ['ATENDIDA', '2026-11-09', true],
    ['EN_ESPERA', '2026-11-09', true],
    ['CONFIRMADA', '2026-11-02', true],
    ['CONFIRMADA', '2026-11-10', false], // futura
    ['CANCELADA', '2026-11-02', false],
    ['NO_ASISTIO', '2026-11-02', false],
  ])('%s del %s → admite: %s', (estado, fecha, admite) => {
    expect(motivoSinInforme({ estado, fecha }, ahora) === null).toBe(admite);
  });
});

describe('InformesService.subir (CU-15)', () => {
  test('guarda el PDF cifrado con AES-256-GCM, su SHA-256 y la recepcionista que lo cargó (RN-14)', async () => {
    const { servicio, informesRepo, citasRepo } = crear();
    const r = await servicio.subir('CR-04801', archivo, { usuarioId: 2 });

    expect(citasRepo.buscarPorCodigo).toHaveBeenCalledWith('CR-04801');
    const guardado = informesRepo.insertar.mock.calls[0][0];
    expect(guardado).toMatchObject({ citaId: 7, cargadoPor: 2, nombre: 'Ecografia pelvica.pdf', tamanoBytes: PDF.length, hashSha256: sha256(PDF) });
    expect(guardado.archivoCifrado.includes(PDF)).toBe(false); // no se guarda en claro
    expect(descifrar(guardado.archivoCifrado).equals(PDF)).toBe(true);
    expect(r).toEqual({ id: 31, nombre: 'Ecografia pelvica.pdf', tamanoBytes: PDF.length, fechaCarga: '2026-11-09T16:00:00Z', cita: 'CR-04801' });
  });

  test('valida el archivo antes de tocar la base (E1)', async () => {
    const { servicio, citasRepo, informesRepo } = crear();
    await expect(servicio.subir('CR-04801', { ...archivo, contenido: Buffer.from('no es pdf') }, { usuarioId: 2 }))
      .rejects.toMatchObject({ codigo: 'ARCHIVO_NO_PDF', http: 422 });
    expect(citasRepo.buscarPorCodigo).not.toHaveBeenCalled();
    expect(informesRepo.insertar).not.toHaveBeenCalled();
  });

  test('404 si la cita no existe (E3)', async () => {
    const { servicio } = crear({ citasRepo: { buscarPorCodigo: jest.fn().mockResolvedValue(null) } });
    await expect(servicio.subir('CR-99999', archivo, { usuarioId: 2 })).rejects.toMatchObject({ codigo: 'CITA_NO_ENCONTRADA', http: 404 });
  });

  test.each([
    { ...citaHoy, estado: 'CANCELADA' },
    { ...citaHoy, estado: 'NO_ASISTIO' },
    { ...citaHoy, estado: 'CONFIRMADA', fecha: '2026-11-12' },
  ])('409 CITA_NO_ADMITE_INFORME para %o', async (cita) => {
    const { servicio, informesRepo } = crear({ citasRepo: { buscarPorCodigo: jest.fn().mockResolvedValue(cita) } });
    await expect(servicio.subir(cita.codigo, archivo, { usuarioId: 2 })).rejects.toMatchObject({ codigo: 'CITA_NO_ADMITE_INFORME', http: 409 });
    expect(informesRepo.insertar).not.toHaveBeenCalled();
  });
});

describe('InformesService.buscarPaciente (CU-15 pasos 1-2)', () => {
  test('marca qué citas admiten informe y explica por qué no las demás', async () => {
    const { servicio } = crear({
      informesRepo: {
        pacienteConCitas: jest.fn().mockResolvedValue({
          nombres: 'Paciente Demo Uno',
          cedula: '000-010190-0001A',
          citas: [
            { codigo: 'CR-00002', estado: 'CONFIRMADA', servicio: 'Papanicolaou', fecha: '2026-11-20', horaInicio: '08:00', informes: 0 },
            { codigo: 'CR-00001', estado: 'ATENDIDA', servicio: 'Control Prenatal', fecha: '2026-11-09', horaInicio: '09:20', informes: 1 },
          ],
        }),
      },
    });
    const r = await servicio.buscarPaciente('000-010190-0001A');
    expect(r.paciente).toEqual({ nombres: 'Paciente Demo Uno', cedula: '000-010190-0001A' });
    expect(r.citas[0]).toMatchObject({ codigo: 'CR-00002', admiteInforme: false, motivo: expect.stringContaining('todavía no') });
    expect(r.citas[1]).toEqual({ codigo: 'CR-00001', estado: 'ATENDIDA', servicio: 'Control Prenatal', fecha: '2026-11-09', horaInicio: '09:20', informes: 1, admiteInforme: true });
  });

  test.each([null, { nombres: 'X', cedula: '000-010190-0001A', citas: [] }])('404 PACIENTE_NO_ENCONTRADA si no existe o no tiene citas (E3)', async (fila) => {
    const { servicio } = crear({ informesRepo: { pacienteConCitas: jest.fn().mockResolvedValue(fila) } });
    await expect(servicio.buscarPaciente('000-010190-0001A')).rejects.toMatchObject({ codigo: 'PACIENTE_NO_ENCONTRADA', http: 404 });
  });
});

describe('InformesService.consultar (CU-08 + CU-09)', () => {
  test('usa la misma verificación con límite de intentos que «Mi cita» (RN-15) y lista los informes', async () => {
    const informes = [{ id: 31, nombre: 'informe.pdf', tamanoBytes: 1200, fechaCarga: '2026-11-09T16:00:00Z' }];
    const { servicio, accesoPublicoService, informesRepo } = crear({ informesRepo: { listarPorCita: jest.fn().mockResolvedValue(informes) } });
    const r = await servicio.consultar({ cedula: '000-010190-0001A', codigo: 'CR-04801', ip: '1.2.3.4' });
    expect(accesoPublicoService.verificarCedulaYCodigo).toHaveBeenCalledWith({ cedula: '000-010190-0001A', codigo: 'CR-04801', ip: '1.2.3.4' });
    expect(informesRepo.listarPorCita).toHaveBeenCalledWith(7);
    expect(r).toEqual({ tokenCita: 'to.k.en', cita: { codigo: 'CR-04801', servicio: 'Ecografía Pélvica', fecha: '2026-11-09' }, informes });
  });

  test('funciona aunque la cita ya no sea modificable (p. ej. Atendida) y E3: lista vacía', async () => {
    const { servicio } = crear();
    await expect(servicio.consultar({ cedula: 'x', codigo: 'y' })).resolves.toMatchObject({ informes: [] });
  });

  test('propaga el bloqueo y el acceso denegado sin dar token', async () => {
    const error = Object.assign(new Error('bloqueado'), { codigo: 'ACCESO_BLOQUEADO', http: 429 });
    const { servicio, accesoPublicoService } = crear({ accesoPublicoService: { verificarCedulaYCodigo: jest.fn().mockRejectedValue(error) } });
    await expect(servicio.consultar({ cedula: 'x', codigo: 'y' })).rejects.toBe(error);
    expect(accesoPublicoService.emitirToken).not.toHaveBeenCalled();
  });
});

describe('InformesService.descargar (CU-09 paso 5)', () => {
  const guardado = { id: 31, citaId: 7, nombre: 'informe.pdf', archivoCifrado: cifrar(PDF), hashSha256: sha256(PDF) };

  test('descifra y comprueba la integridad', async () => {
    const { servicio } = crear({ informesRepo: { obtenerArchivo: jest.fn().mockResolvedValue(guardado) } });
    const r = await servicio.descargar(31, 7);
    expect(r.nombre).toBe('informe.pdf');
    expect(r.contenido.equals(PDF)).toBe(true);
  });

  test('un informe de otra cita responde 404, igual que uno inexistente', async () => {
    const { servicio } = crear({ informesRepo: { obtenerArchivo: jest.fn().mockResolvedValue(guardado) } });
    await expect(servicio.descargar(31, 8)).rejects.toMatchObject({ codigo: 'INFORME_NO_ENCONTRADO', http: 404 });
    const { servicio: otro } = crear({ informesRepo: { obtenerArchivo: jest.fn().mockResolvedValue(null) } });
    await expect(otro.descargar(99, 7)).rejects.toMatchObject({ codigo: 'INFORME_NO_ENCONTRADO', http: 404 });
  });

  test.each([
    ['alterado (falla la etiqueta GCM)', { archivoCifrado: Buffer.concat([guardado.archivoCifrado.subarray(0, 40), Buffer.from('x')]) }],
    ['con hash distinto', { hashSha256: '0'.repeat(64) }],
  ])('E4: un archivo %s no se entrega', async (_, cambio) => {
    const { servicio } = crear({ informesRepo: { obtenerArchivo: jest.fn().mockResolvedValue({ ...guardado, ...cambio }) } });
    await expect(servicio.descargar(31, 7)).rejects.toMatchObject({ codigo: 'INFORME_NO_DISPONIBLE', http: 500 });
  });
});
