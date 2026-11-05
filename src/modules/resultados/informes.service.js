'use strict';

// InformesService: carga (CU-15), consulta (CU-08 + CU-09) y descarga (CU-09)
// de informes PDF. El PDF se cifra con AES-256-GCM antes de guardarse y se
// guarda su SHA-256 para comprobar la integridad al descargarlo (RN-14, RNF-10).
const crypto = require('node:crypto');
const { ErrorNegocio } = require('../../common/errores');
const { ahoraManagua } = require('../../common/fechas');
const { cifrar: cifrarAes, descifrar: descifrarAes } = require('../../common/cifrado');
const registro = require('../../common/registro');
const { validarPdf } = require('./validar-pdf');

const ESTADOS_SIN_INFORME = new Set(['CANCELADA', 'NO_ASISTIO']);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * Decisión de la Iteración 4: se sube informe a citas de hoy o anteriores que
 * no estén Canceladas ni en No asistió. Devuelve el motivo si no se puede, o null.
 */
function motivoSinInforme(cita, ahora) {
  if (ESTADOS_SIN_INFORME.has(cita.estado)) {
    return cita.estado === 'CANCELADA'
      ? 'La cita está cancelada: no se le pueden subir informes.'
      : 'La paciente no asistió a esta cita: no se le pueden subir informes.';
  }
  if (cita.fecha > ahora.fecha) return 'La cita todavía no se realiza: el informe se sube el día de la cita o después.';
  return null;
}

function crearInformesService({
  informesRepo,
  citasRepo,
  accesoPublicoService,
  cifrar = cifrarAes,
  descifrar = descifrarAes,
  reloj = ahoraManagua,
}) {
  return {
    /** CU-15 pasos 1-2: POST /admin/pacientes/busqueda. */
    async buscarPaciente(cedula) {
      const paciente = await informesRepo.pacienteConCitas(cedula);
      // E3: mismo mensaje si no existe o no tiene citas.
      if (!paciente || paciente.citas.length === 0) {
        throw new ErrorNegocio(
          'PACIENTE_NO_ENCONTRADA',
          'No encontramos una paciente con citas registradas con esa cédula.',
          404,
        );
      }
      const ahora = reloj();
      return {
        paciente: { nombres: paciente.nombres, cedula: paciente.cedula },
        citas: paciente.citas.map((c) => {
          const motivo = motivoSinInforme(c, ahora);
          return { ...c, admiteInforme: !motivo, ...(motivo ? { motivo } : {}) };
        }),
      };
    },

    /**
     * CU-15 pasos 3-6.
     * @param {string} codigo código de la cita (ER-05, ya validado)
     * @param {{ nombreOriginal: string, tipo: string, contenido: Buffer }} archivo
     * @param {{ usuarioId: number }} sesion recepcionista que carga el informe
     */
    async subir(codigo, archivo, sesion) {
      const { nombre, tamanoBytes } = validarPdf(archivo); // E1, E2, E4

      const cita = await citasRepo.buscarPorCodigo(codigo);
      if (!cita) {
        throw new ErrorNegocio('CITA_NO_ENCONTRADA', 'No existe una cita con ese código. Vuelve a buscar a la paciente.', 404);
      }
      const motivo = motivoSinInforme(cita, reloj());
      if (motivo) throw new ErrorNegocio('CITA_NO_ADMITE_INFORME', motivo, 409);

      const informe = await informesRepo.insertar({
        citaId: cita.id,
        cargadoPor: sesion.usuarioId,
        nombre,
        tamanoBytes,
        archivoCifrado: cifrar(archivo.contenido),
        hashSha256: sha256(archivo.contenido),
      });
      registro.info('informe_cargado', { usuarioId: sesion.usuarioId, citaId: cita.id, informeId: informe.id, tamanoBytes });
      return { ...informe, cita: cita.codigo };
    },

    /**
     * CU-08 + CU-09 pasos 1-3: POST /resultados/consulta. Valida cédula y
     * código (con el mismo límite de intentos que «Mi cita») sin importar el
     * estado de la cita, y lista sus informes (E3: lista vacía).
     */
    async consultar({ cedula, codigo, ip }) {
      const cita = await accesoPublicoService.verificarCedulaYCodigo({ cedula, codigo, ip });
      const informes = await informesRepo.listarPorCita(cita.id);
      return {
        tokenCita: accesoPublicoService.emitirToken(cita),
        cita: { codigo: cita.codigo, servicio: cita.servicio, fecha: cita.fecha },
        informes,
      };
    },

    /**
     * CU-09 paso 5: GET /resultados/:id/archivo. Solo entrega informes de la
     * cita del token; si no, responde como si no existiera.
     * @returns {Promise<{ nombre: string, contenido: Buffer }>}
     */
    async descargar(informeId, citaIdDelToken) {
      const informe = await informesRepo.obtenerArchivo(informeId);
      if (!informe || informe.citaId !== citaIdDelToken) {
        throw new ErrorNegocio('INFORME_NO_ENCONTRADO', 'No encontramos ese informe. Vuelve a consultar tus resultados.', 404);
      }
      let contenido;
      try {
        contenido = descifrar(informe.archivoCifrado);
      } catch (err) {
        contenido = null;
        registro.error('informe_no_descifrado', { informeId: informe.id, error: registro.resumirError(err) });
      }
      if (!contenido || sha256(contenido) !== informe.hashSha256) {
        if (contenido) registro.error('informe_hash_distinto', { informeId: informe.id });
        // E4
        throw new ErrorNegocio(
          'INFORME_NO_DISPONIBLE',
          'No pudimos entregar este informe. Comunícate con la clínica para recibirlo.',
          500,
        );
      }
      return { nombre: informe.nombre, contenido };
    },
  };
}

module.exports = { crearInformesService, motivoSinInforme };
