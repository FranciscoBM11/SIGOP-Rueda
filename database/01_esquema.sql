/* ============================================================================
   SIGOP-Rueda - Esquema de base de datos (SQL Server 2019+ / Azure SQL Database)
   Fase 3, seccion 3. 18 tablas en 3FN.
   Ejecutar en SQL Server Management Studio 22 sobre una base vacia (SIGOP).
   Convenciones: tablas y columnas en snake_case plural; fechas y horas de
   auditoria en UTC (DATETIME2); la API las convierte a America/Managua.
   ============================================================================ */
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;   -- requerido por los indices filtrados
GO

/* ---------------------------- Pacientes y catalogo ----------------------- */
CREATE TABLE dbo.pacientes (
    id         INT IDENTITY(1,1) CONSTRAINT pk_pacientes PRIMARY KEY,
    cedula     VARCHAR(16)  NOT NULL,
    nombres    NVARCHAR(80) NOT NULL,
    telefono   VARCHAR(8)   NOT NULL,
    correo     VARCHAR(100) NOT NULL,
    creado_en  DATETIME2(0) NOT NULL CONSTRAINT df_pacientes_creado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_pacientes_cedula UNIQUE (cedula),
    -- ER-01: 3 digitos, 6 digitos, 4 digitos y una letra mayuscula (comparacion binaria)
    CONSTRAINT ck_pacientes_cedula CHECK (cedula COLLATE Latin1_General_100_BIN2
        LIKE '[0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][A-Z]'),
    -- ER-03: 8 digitos, inicia con 2, 5, 7 u 8
    CONSTRAINT ck_pacientes_telefono CHECK (telefono LIKE '[2578][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    -- ER-04 (forma basica; la validacion completa se hace en la aplicacion)
    CONSTRAINT ck_pacientes_correo CHECK (correo LIKE '_%@_%._%')
);
GO

CREATE TABLE dbo.servicios (
    id                   INT IDENTITY(1,1) CONSTRAINT pk_servicios PRIMARY KEY,
    nombre               NVARCHAR(60)   NOT NULL,
    indicaciones_previas NVARCHAR(1000) NOT NULL CONSTRAINT df_servicios_indic DEFAULT N'',
    activo               BIT NOT NULL CONSTRAINT df_servicios_activo DEFAULT 1,
    CONSTRAINT uq_servicios_nombre UNIQUE (nombre)
);
GO

CREATE TABLE dbo.preguntas_triaje (
    id             INT IDENTITY(1,1) CONSTRAINT pk_preguntas_triaje PRIMARY KEY,
    servicio_id    INT NOT NULL CONSTRAINT fk_preguntas_servicio REFERENCES dbo.servicios(id),
    texto          NVARCHAR(200) NOT NULL,
    tipo_respuesta VARCHAR(10)   NOT NULL,
    obligatoria    BIT NOT NULL CONSTRAINT df_preguntas_oblig DEFAULT 0,
    orden          SMALLINT NOT NULL,
    activa         BIT NOT NULL CONSTRAINT df_preguntas_activa DEFAULT 1,
    CONSTRAINT uq_preguntas_servicio_orden UNIQUE (servicio_id, orden),
    CONSTRAINT ck_preguntas_tipo CHECK (tipo_respuesta IN ('TEXTO','SI_NO','NUMERO','FECHA','SELECCION')),
    CONSTRAINT ck_preguntas_orden CHECK (orden >= 1)
);
GO

CREATE TABLE dbo.opciones_pregunta (
    id          INT IDENTITY(1,1) CONSTRAINT pk_opciones_pregunta PRIMARY KEY,
    pregunta_id INT NOT NULL CONSTRAINT fk_opciones_pregunta REFERENCES dbo.preguntas_triaje(id) ON DELETE CASCADE,
    etiqueta    NVARCHAR(100) NOT NULL,
    orden       SMALLINT NOT NULL,
    CONSTRAINT uq_opciones_pregunta_orden UNIQUE (pregunta_id, orden)
);
GO

CREATE TABLE dbo.estudios_sugeridos (
    id          INT IDENTITY(1,1) CONSTRAINT pk_estudios_sugeridos PRIMARY KEY,
    trimestre   TINYINT       NOT NULL,
    nombre      NVARCHAR(100) NOT NULL,
    descripcion NVARCHAR(300) NOT NULL,
    servicio_id INT NULL CONSTRAINT fk_estudios_servicio REFERENCES dbo.servicios(id),
    orden       SMALLINT NOT NULL CONSTRAINT df_estudios_orden DEFAULT 1,
    CONSTRAINT uq_estudios_trimestre_nombre UNIQUE (trimestre, nombre),
    CONSTRAINT ck_estudios_trimestre CHECK (trimestre IN (1,2,3))
);
GO

/* ---------------------------- Usuarios del panel ------------------------- */
CREATE TABLE dbo.usuarios (
    id               INT IDENTITY(1,1) CONSTRAINT pk_usuarios PRIMARY KEY,
    usuario          VARCHAR(30)   NOT NULL,
    contrasena_hash  VARCHAR(100)  NOT NULL,        -- bcrypt, costo 12 (RNF-03)
    nombre_completo  NVARCHAR(80)  NOT NULL,
    rol              VARCHAR(15)   NOT NULL,
    intentos_fallidos TINYINT      NOT NULL CONSTRAINT df_usuarios_intentos DEFAULT 0,
    bloqueado_hasta  DATETIME2(0)  NULL,
    activo           BIT NOT NULL CONSTRAINT df_usuarios_activo DEFAULT 1,
    ultimo_acceso    DATETIME2(0)  NULL,
    CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),
    CONSTRAINT ck_usuarios_rol CHECK (rol IN ('MEDICO','RECEPCIONISTA')),
    -- ER-06: minusculas, digitos, punto y guion bajo; 4 a 30 caracteres
    CONSTRAINT ck_usuarios_usuario CHECK (LEN(usuario) >= 4
        AND usuario COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^a-z0-9._]%'),
    -- RN-12
    CONSTRAINT ck_usuarios_intentos CHECK (intentos_fallidos BETWEEN 0 AND 5)
);
GO

CREATE TABLE dbo.medicos (
    usuario_id   INT NOT NULL CONSTRAINT pk_medicos PRIMARY KEY
                 CONSTRAINT fk_medicos_usuario REFERENCES dbo.usuarios(id),
    codigo_minsa VARCHAR(20)  NOT NULL,
    especialidad NVARCHAR(60) NOT NULL CONSTRAINT df_medicos_esp DEFAULT N'Ginecología y Obstetricia',
    CONSTRAINT uq_medicos_minsa UNIQUE (codigo_minsa)
);
GO

CREATE TABLE dbo.recepcionistas (
    usuario_id    INT NOT NULL CONSTRAINT pk_recepcionistas PRIMARY KEY
                  CONSTRAINT fk_recepcionistas_usuario REFERENCES dbo.usuarios(id),
    turno_laboral VARCHAR(10) NOT NULL,
    CONSTRAINT ck_recepcionistas_turno CHECK (turno_laboral IN ('MATUTINO','VESPERTINO','COMPLETO'))
);
GO

CREATE TABLE dbo.sesiones (
    id                UNIQUEIDENTIFIER NOT NULL CONSTRAINT pk_sesiones PRIMARY KEY
                      CONSTRAINT df_sesiones_id DEFAULT NEWID(),
    usuario_id        INT NOT NULL CONSTRAINT fk_sesiones_usuario REFERENCES dbo.usuarios(id),
    creada_en         DATETIME2(0) NOT NULL CONSTRAINT df_sesiones_creada DEFAULT SYSUTCDATETIME(),
    ultima_actividad  DATETIME2(0) NOT NULL CONSTRAINT df_sesiones_ult DEFAULT SYSUTCDATETIME(),
    expira_en         DATETIME2(0) NOT NULL,
    revocada          BIT NOT NULL CONSTRAINT df_sesiones_rev DEFAULT 0,
    ip_hash           CHAR(64) NULL
);
GO
CREATE INDEX ix_sesiones_usuario_vigentes ON dbo.sesiones(usuario_id) WHERE revocada = 0;
GO

/* ---------------------------- Agenda ------------------------------------- */
CREATE TABLE dbo.horarios_laborales (
    id             INT IDENTITY(1,1) CONSTRAINT pk_horarios_laborales PRIMARY KEY,
    medico_id      INT NOT NULL CONSTRAINT fk_horarios_medico REFERENCES dbo.medicos(usuario_id),
    dia_semana     TINYINT NOT NULL,                 -- 1 = lunes ... 7 = domingo
    hora_apertura  TIME(0) NOT NULL,
    hora_cierre    TIME(0) NOT NULL,
    duracion_turno TINYINT NOT NULL,
    activo         BIT NOT NULL CONSTRAINT df_horarios_activo DEFAULT 1,
    CONSTRAINT uq_horarios_medico_dia UNIQUE (medico_id, dia_semana),
    CONSTRAINT ck_horarios_dia CHECK (dia_semana BETWEEN 1 AND 7),
    CONSTRAINT ck_horarios_horas CHECK (hora_cierre > hora_apertura),
    -- RN-10 / RF-03: bloques de 30 a 45 minutos
    CONSTRAINT ck_horarios_duracion CHECK (duracion_turno BETWEEN 30 AND 45)
);
GO

CREATE TABLE dbo.turnos (
    id          INT IDENTITY(1,1) CONSTRAINT pk_turnos PRIMARY KEY,
    horario_id  INT NOT NULL CONSTRAINT fk_turnos_horario REFERENCES dbo.horarios_laborales(id),
    fecha       DATE    NOT NULL,
    hora_inicio TIME(0) NOT NULL,
    hora_fin    TIME(0) NOT NULL,
    habilitado  BIT NOT NULL CONSTRAINT df_turnos_hab DEFAULT 1,
    CONSTRAINT uq_turnos_horario_fecha_hora UNIQUE (horario_id, fecha, hora_inicio),
    CONSTRAINT ck_turnos_duracion CHECK (DATEDIFF(MINUTE, hora_inicio, hora_fin) BETWEEN 30 AND 45)
);
GO
CREATE INDEX ix_turnos_fecha ON dbo.turnos(fecha) INCLUDE (hora_inicio, hora_fin, habilitado);
GO

/* ---------------------------- Citas -------------------------------------- */
CREATE TABLE dbo.citas (
    id                      INT IDENTITY(1,1) CONSTRAINT pk_citas PRIMARY KEY,
    codigo                  CHAR(8) NOT NULL,
    paciente_id             INT NOT NULL CONSTRAINT fk_citas_paciente REFERENCES dbo.pacientes(id),
    turno_id                INT NOT NULL CONSTRAINT fk_citas_turno    REFERENCES dbo.turnos(id),
    servicio_id             INT NOT NULL CONSTRAINT fk_citas_servicio REFERENCES dbo.servicios(id),
    estado                  VARCHAR(12) NOT NULL CONSTRAINT df_citas_estado DEFAULT 'CONFIRMADA',
    consentimiento_aceptado BIT NOT NULL,
    consentimiento_version  VARCHAR(10) NOT NULL,
    consentimiento_fecha    DATETIME2(0) NOT NULL CONSTRAINT df_citas_consent DEFAULT SYSUTCDATETIME(),
    reprogramaciones        TINYINT NOT NULL CONSTRAINT df_citas_reprog DEFAULT 0,
    fecha_registro          DATETIME2(0) NOT NULL CONSTRAINT df_citas_registro DEFAULT SYSUTCDATETIME(),
    fila_version            ROWVERSION,               -- control de concurrencia optimista
    CONSTRAINT uq_citas_codigo UNIQUE (codigo),
    -- RN-02 / ER-05
    CONSTRAINT ck_citas_codigo CHECK (codigo LIKE 'CR-[0-9][0-9][0-9][0-9][0-9]'),
    CONSTRAINT ck_citas_estado CHECK (estado IN ('CONFIRMADA','EN_ESPERA','ATENDIDA','NO_ASISTIO','CANCELADA')),
    -- RN-05
    CONSTRAINT ck_citas_consentimiento CHECK (consentimiento_aceptado = 1)
);
GO
-- RN-01: un turno no puede tener mas de una cita activa (no cancelada)
CREATE UNIQUE INDEX uq_cita_turno_activa ON dbo.citas(turno_id) WHERE estado <> 'CANCELADA';
GO
CREATE INDEX ix_citas_paciente ON dbo.citas(paciente_id);
GO

CREATE TABLE dbo.cambios_estado_cita (
    id              INT IDENTITY(1,1) CONSTRAINT pk_cambios_estado PRIMARY KEY,
    cita_id         INT NOT NULL CONSTRAINT fk_cambios_cita REFERENCES dbo.citas(id) ON DELETE CASCADE,
    estado_anterior VARCHAR(12) NULL,
    estado_nuevo    VARCHAR(12) NOT NULL,
    origen          VARCHAR(10) NOT NULL,
    usuario_id      INT NULL CONSTRAINT fk_cambios_usuario REFERENCES dbo.usuarios(id),
    detalle         NVARCHAR(200) NULL,
    fecha_hora      DATETIME2(0) NOT NULL CONSTRAINT df_cambios_fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_cambios_estados CHECK (
        estado_nuevo IN ('CONFIRMADA','EN_ESPERA','ATENDIDA','NO_ASISTIO','CANCELADA')
        AND (estado_anterior IS NULL OR estado_anterior IN ('CONFIRMADA','EN_ESPERA','ATENDIDA','NO_ASISTIO','CANCELADA'))),
    CONSTRAINT ck_cambios_origen CHECK (origen IN ('PACIENTE','PERSONAL','SISTEMA')),
    -- RF-17: todo cambio hecho por el personal registra quien lo hizo
    CONSTRAINT ck_cambios_actor CHECK (origen <> 'PERSONAL' OR usuario_id IS NOT NULL)
);
GO
CREATE INDEX ix_cambios_cita_fecha ON dbo.cambios_estado_cita(cita_id, fecha_hora);
GO

/* ---------------------------- Pre-triaje (datos sensibles) --------------- */
CREATE TABLE dbo.fichas_triaje (
    id             INT IDENTITY(1,1) CONSTRAINT pk_fichas_triaje PRIMARY KEY,
    cita_id        INT NOT NULL CONSTRAINT fk_fichas_cita REFERENCES dbo.citas(id) ON DELETE CASCADE,
    fecha_registro DATETIME2(0) NOT NULL CONSTRAINT df_fichas_fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_fichas_cita UNIQUE (cita_id)
);
GO

CREATE TABLE dbo.respuestas_triaje (
    id            INT IDENTITY(1,1) CONSTRAINT pk_respuestas_triaje PRIMARY KEY,
    ficha_id      INT NOT NULL CONSTRAINT fk_respuestas_ficha    REFERENCES dbo.fichas_triaje(id) ON DELETE CASCADE,
    pregunta_id   INT NOT NULL CONSTRAINT fk_respuestas_pregunta REFERENCES dbo.preguntas_triaje(id),
    valor_cifrado VARBINARY(2100) NOT NULL,           -- AES-256-GCM: iv(12) + etiqueta(16) + texto cifrado (RN-14)
    CONSTRAINT uq_respuestas_ficha_pregunta UNIQUE (ficha_id, pregunta_id)
);
GO

/* ---------------------------- Resultados y notificaciones ---------------- */
CREATE TABLE dbo.informes_resultado (
    id             INT IDENTITY(1,1) CONSTRAINT pk_informes_resultado PRIMARY KEY,
    cita_id        INT NOT NULL CONSTRAINT fk_informes_cita REFERENCES dbo.citas(id),   -- sin cascada (RN-09)
    cargado_por    INT NOT NULL CONSTRAINT fk_informes_recepcionista REFERENCES dbo.recepcionistas(usuario_id),
    nombre_archivo NVARCHAR(100) NOT NULL,
    tamano_bytes   INT NOT NULL,
    archivo_cifrado VARBINARY(MAX) NOT NULL,          -- PDF cifrado con AES-256-GCM (RN-14)
    hash_sha256    CHAR(64) NOT NULL,                 -- integridad del PDF original
    fecha_carga    DATETIME2(0) NOT NULL CONSTRAINT df_informes_fecha DEFAULT SYSUTCDATETIME(),
    -- RN-09 / ER-08
    CONSTRAINT ck_informes_nombre CHECK (nombre_archivo LIKE N'%.pdf'),
    CONSTRAINT ck_informes_tamano CHECK (tamano_bytes BETWEEN 1 AND 10485760)
);
GO
CREATE INDEX ix_informes_cita ON dbo.informes_resultado(cita_id);
GO

CREATE TABLE dbo.notificaciones (
    id            INT IDENTITY(1,1) CONSTRAINT pk_notificaciones PRIMARY KEY,
    cita_id       INT NOT NULL CONSTRAINT fk_notificaciones_cita REFERENCES dbo.citas(id) ON DELETE CASCADE,
    tipo          VARCHAR(15) NOT NULL,
    canal         VARCHAR(10) NOT NULL CONSTRAINT df_notif_canal DEFAULT 'CORREO',
    estado_envio  VARCHAR(10) NOT NULL CONSTRAINT df_notif_estado DEFAULT 'PENDIENTE',
    intentos      TINYINT NOT NULL CONSTRAINT df_notif_intentos DEFAULT 0,
    detalle_error NVARCHAR(300) NULL,
    fecha_envio   DATETIME2(0) NULL,
    CONSTRAINT ck_notif_tipo   CHECK (tipo IN ('CONFIRMACION','REPROGRAMACION')),
    CONSTRAINT ck_notif_canal  CHECK (canal IN ('CORREO','WHATSAPP')),
    CONSTRAINT ck_notif_estado CHECK (estado_envio IN ('PENDIENTE','ENVIADA','FALLIDA'))
);
GO
CREATE INDEX ix_notif_pendientes ON dbo.notificaciones(cita_id) WHERE estado_envio = 'PENDIENTE';
GO

CREATE TABLE dbo.intentos_acceso (
    id               INT IDENTITY(1,1) CONSTRAINT pk_intentos_acceso PRIMARY KEY,
    cedula_ingresada VARCHAR(16) NOT NULL,            -- sin FK: tambien se registran cedulas inexistentes
    exitoso          BIT NOT NULL,
    ip_hash          CHAR(64) NULL,
    fecha_hora       DATETIME2(0) NOT NULL CONSTRAINT df_intentos_fecha DEFAULT SYSUTCDATETIME()
);
GO
CREATE INDEX ix_intentos_cedula_fecha ON dbo.intentos_acceso(cedula_ingresada, fecha_hora);
GO

/* ---------------------------- Generador de turnos ------------------------ */
-- Crea los turnos libres de un rango de fechas a partir de horarios_laborales (RN-10).
-- No duplica turnos existentes. Uso: EXEC dbo.sp_generar_turnos '2026-11-09', '2026-11-22';
CREATE OR ALTER PROCEDURE dbo.sp_generar_turnos
    @desde DATE,
    @hasta DATE
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH dias AS (
        SELECT @desde AS fecha
        UNION ALL
        SELECT DATEADD(DAY, 1, fecha) FROM dias WHERE fecha < @hasta
    ),
    base AS (
        SELECT h.id AS horario_id, d.fecha, h.hora_apertura, h.hora_cierre, h.duracion_turno
        FROM dias d
        JOIN dbo.horarios_laborales h
          ON h.activo = 1
         AND h.dia_semana = (DATEDIFF(DAY, '19000101', d.fecha) % 7) + 1   -- 01/01/1900 fue lunes
    ),
    bloques AS (
        SELECT horario_id, fecha, hora_apertura AS hora_inicio,
               DATEADD(MINUTE, duracion_turno, hora_apertura) AS hora_fin,
               hora_cierre, duracion_turno
        FROM base
        WHERE DATEADD(MINUTE, duracion_turno, hora_apertura) <= hora_cierre
        UNION ALL
        SELECT horario_id, fecha, hora_fin,
               DATEADD(MINUTE, duracion_turno, hora_fin),
               hora_cierre, duracion_turno
        FROM bloques
        WHERE DATEADD(MINUTE, duracion_turno, hora_fin) <= hora_cierre
    )
    INSERT INTO dbo.turnos (horario_id, fecha, hora_inicio, hora_fin)
    SELECT b.horario_id, b.fecha, b.hora_inicio, b.hora_fin
    FROM bloques b
    WHERE NOT EXISTS (SELECT 1 FROM dbo.turnos t
                      WHERE t.horario_id = b.horario_id AND t.fecha = b.fecha AND t.hora_inicio = b.hora_inicio)
    OPTION (MAXRECURSION 0);
END;
GO
