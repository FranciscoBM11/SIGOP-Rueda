'use strict';

// PacientesRepository: único lugar con SQL sobre dbo.pacientes.
const { sql } = require('../../config/base-datos');

function crearPacientesRepository() {
  return {
    /** Busca por cédula y bloquea la fila (o el hueco) hasta el commit. */
    async buscarPorCedulaParaActualizar(tx, cedula) {
      const r = await tx
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .query('SELECT id FROM dbo.pacientes WITH (UPDLOCK, HOLDLOCK) WHERE cedula = @cedula');
      return r.recordset[0] ?? null;
    },

    async insertar(tx, { cedula, nombres, telefono, correo }) {
      const r = await tx
        .request()
        .input('cedula', sql.VarChar(16), cedula)
        .input('nombres', sql.NVarChar(80), nombres)
        .input('telefono', sql.VarChar(8), telefono)
        .input('correo', sql.VarChar(100), correo)
        .query(
          `INSERT INTO dbo.pacientes (cedula, nombres, telefono, correo)
           OUTPUT INSERTED.id
           VALUES (@cedula, @nombres, @telefono, @correo)`,
        );
      return r.recordset[0].id;
    },

    async actualizarContacto(tx, id, { telefono, correo }) {
      await tx
        .request()
        .input('id', sql.Int, id)
        .input('telefono', sql.VarChar(8), telefono)
        .input('correo', sql.VarChar(100), correo)
        .query('UPDATE dbo.pacientes SET telefono = @telefono, correo = @correo WHERE id = @id');
    },
  };
}

module.exports = { crearPacientesRepository };
