'use strict';

// CitasRepository: único lugar con SQL sobre dbo.citas.
const { sql } = require('../../config/base-datos');

function crearCitasRepository() {
  return {
    /** ¿Existe ya una cita con ese código? Bloquea el valor hasta el commit. */
    async codigoExiste(tx, codigo) {
      const r = await tx
        .request()
        .input('codigo', sql.Char(8), codigo)
        .query('SELECT 1 AS existe FROM dbo.citas WITH (UPDLOCK, HOLDLOCK) WHERE codigo = @codigo');
      return r.recordset.length > 0;
    },

    /** Inserta la cita en estado CONFIRMADA (valor por defecto de la tabla). */
    async insertar(tx, { codigo, pacienteId, turnoId, servicioId, consentimientoVersion }) {
      const r = await tx
        .request()
        .input('codigo', sql.Char(8), codigo)
        .input('pacienteId', sql.Int, pacienteId)
        .input('turnoId', sql.Int, turnoId)
        .input('servicioId', sql.Int, servicioId)
        .input('version', sql.VarChar(10), consentimientoVersion)
        .query(
          `INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id,
                                  consentimiento_aceptado, consentimiento_version)
           OUTPUT INSERTED.id
           VALUES (@codigo, @pacienteId, @turnoId, @servicioId, 1, @version)`,
        );
      return r.recordset[0].id;
    },
  };
}

module.exports = { crearCitasRepository };
