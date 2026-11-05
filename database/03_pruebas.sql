/* ============================================================================
   SIGOP-Rueda - Pruebas de las reglas garantizadas por la base de datos
   Ejecutar despues de 01_esquema.sql y 02_datos_demo.sql.
   Todo se hace dentro de una transaccion que se revierte al final.
   Cada prueba imprime OK o FALLA en la pestana Mensajes de SSMS.
   ============================================================================ */
SET NOCOUNT ON;
BEGIN TRAN;

DECLARE @serv INT = (SELECT TOP 1 id FROM dbo.servicios ORDER BY id);
DECLARE @t1 INT = (SELECT TOP 1 id FROM dbo.turnos ORDER BY fecha, hora_inicio);
DECLARE @t2 INT = (SELECT TOP 1 id FROM dbo.turnos WHERE id <> @t1 ORDER BY fecha, hora_inicio);
DECLARE @recep INT = (SELECT usuario_id FROM dbo.recepcionistas);
DECLARE @pac INT;

INSERT INTO dbo.pacientes (cedula, nombres, telefono, correo)
VALUES ('001-150390-0012K', N'María José López', '88123456', 'maria.lopez@gmail.com');
SET @pac = SCOPE_IDENTITY();

-- Cita base valida
INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
VALUES ('CR-04821', @pac, @t1, @serv, 1, 'v1.0');
DECLARE @cita INT = SCOPE_IDENTITY();

-- RN-01: segunda cita activa en el mismo turno
BEGIN TRY
    INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
    VALUES ('CR-04822', @pac, @t1, @serv, 1, 'v1.0');
    PRINT 'FALLA  RN-01: se acepto una doble reserva';
END TRY BEGIN CATCH PRINT 'OK     RN-01: doble reserva rechazada (uq_cita_turno_activa)'; END CATCH

-- RN-07: tras cancelar, el turno queda libre
UPDATE dbo.citas SET estado = 'CANCELADA' WHERE id = @cita;
BEGIN TRY
    INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
    VALUES ('CR-04823', @pac, @t1, @serv, 1, 'v1.0');
    PRINT 'OK     RN-07: turno liberado tras cancelar, nueva cita aceptada';
END TRY BEGIN CATCH PRINT 'FALLA  RN-07: el turno cancelado no quedo libre'; END CATCH

-- ER-01: cedula con letra minuscula
BEGIN TRY
    INSERT INTO dbo.pacientes (cedula, nombres, telefono, correo) VALUES ('001-150390-0012k', N'Ana Pérez', '88123457', 'ana@correo.com');
    PRINT 'FALLA  ER-01: cedula con minuscula aceptada';
END TRY BEGIN CATCH PRINT 'OK     ER-01: cedula invalida rechazada'; END CATCH

-- ER-03: telefono que no inicia con 2, 5, 7 u 8
BEGIN TRY
    INSERT INTO dbo.pacientes (cedula, nombres, telefono, correo) VALUES ('001-150390-0013K', N'Ana Pérez', '98123457', 'ana@correo.com');
    PRINT 'FALLA  ER-03: telefono invalido aceptado';
END TRY BEGIN CATCH PRINT 'OK     ER-03: telefono invalido rechazado'; END CATCH

-- ER-05 / RN-02: codigo CR-1
BEGIN TRY
    INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
    VALUES ('CR-1', @pac, @t2, @serv, 1, 'v1.0');
    PRINT 'FALLA  ER-05: codigo con formato invalido aceptado';
END TRY BEGIN CATCH PRINT 'OK     ER-05: codigo CR-1 rechazado'; END CATCH

-- RN-02: codigo repetido
BEGIN TRY
    INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
    VALUES ('CR-04823', @pac, @t2, @serv, 1, 'v1.0');
    PRINT 'FALLA  RN-02: codigo repetido aceptado';
END TRY BEGIN CATCH PRINT 'OK     RN-02: codigo repetido rechazado'; END CATCH

-- RN-05: sin consentimiento
BEGIN TRY
    INSERT INTO dbo.citas (codigo, paciente_id, turno_id, servicio_id, consentimiento_aceptado, consentimiento_version)
    VALUES ('CR-04824', @pac, @t2, @serv, 0, 'v1.0');
    PRINT 'FALLA  RN-05: cita sin consentimiento aceptada';
END TRY BEGIN CATCH PRINT 'OK     RN-05: cita sin consentimiento rechazada'; END CATCH

-- RN-10: horario con turnos de 60 minutos
BEGIN TRY
    INSERT INTO dbo.horarios_laborales (medico_id, dia_semana, hora_apertura, hora_cierre, duracion_turno)
    SELECT usuario_id, 6, '08:00', '12:00', 60 FROM dbo.medicos;
    PRINT 'FALLA  RN-10: duracion de 60 minutos aceptada';
END TRY BEGIN CATCH PRINT 'OK     RN-10: duracion fuera de 30-45 rechazada'; END CATCH

-- RF-17: cambio de estado del personal sin usuario
BEGIN TRY
    INSERT INTO dbo.cambios_estado_cita (cita_id, estado_anterior, estado_nuevo, origen)
    VALUES (@cita, 'CONFIRMADA', 'EN_ESPERA', 'PERSONAL');
    PRINT 'FALLA  RF-17: cambio del personal sin usuario aceptado';
END TRY BEGIN CATCH PRINT 'OK     RF-17: cambio del personal sin usuario rechazado'; END CATCH

-- RN-12: mas de 5 intentos fallidos
BEGIN TRY
    UPDATE dbo.usuarios SET intentos_fallidos = 6 WHERE usuario = 'recepcion.lira';
    PRINT 'FALLA  RN-12: intentos_fallidos = 6 aceptado';
END TRY BEGIN CATCH PRINT 'OK     RN-12: intentos_fallidos fuera de 0-5 rechazado'; END CATCH

-- RN-09: archivo que no es PDF y archivo de mas de 10 MB
BEGIN TRY
    INSERT INTO dbo.informes_resultado (cita_id, cargado_por, nombre_archivo, tamano_bytes, archivo_cifrado, hash_sha256)
    VALUES (@cita, @recep, N'informe.docx', 1000, 0x00, REPLICATE('a', 64));
    PRINT 'FALLA  RN-09: archivo .docx aceptado';
END TRY BEGIN CATCH PRINT 'OK     RN-09: archivo que no es PDF rechazado'; END CATCH
BEGIN TRY
    INSERT INTO dbo.informes_resultado (cita_id, cargado_por, nombre_archivo, tamano_bytes, archivo_cifrado, hash_sha256)
    VALUES (@cita, @recep, N'informe.pdf', 10485761, 0x00, REPLICATE('a', 64));
    PRINT 'FALLA  RN-09: PDF de mas de 10 MB aceptado';
END TRY BEGIN CATCH PRINT 'OK     RN-09: PDF de mas de 10 MB rechazado'; END CATCH

-- Generador de turnos: no duplica
DECLARE @antes INT = (SELECT COUNT(*) FROM dbo.turnos);
DECLARE @hoy DATE = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central America Standard Time' AS DATE);
EXEC dbo.sp_generar_turnos @hoy, @hoy;
IF (SELECT COUNT(*) FROM dbo.turnos) = @antes PRINT 'OK     RN-10: sp_generar_turnos no duplica turnos'
ELSE PRINT 'FALLA  RN-10: sp_generar_turnos duplico turnos';

ROLLBACK;
PRINT 'Pruebas terminadas. Los datos de prueba se revirtieron.';
