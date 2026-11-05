/* ============================================================================
   SIGOP-Rueda - Datos de demostracion (SOLO desarrollo y demos; nunca datos reales)
   Usuarios de prueba:  dra.rueda / Clinica2026   (MEDICO)
                        recepcion.lira / Recepcion2026   (RECEPCIONISTA)
   ============================================================================ */
SET NOCOUNT ON;
GO

-- Usuarios (hash bcrypt, costo 12)
INSERT INTO dbo.usuarios (usuario, contrasena_hash, nombre_completo, rol) VALUES
 ('dra.rueda',      '$2b$12$O5pqN.rOfCEIagkFlq13T.bxFeXUbK2tTD5DFWwKajF2ny8AljFDy', N'Dra. Rueda',      'MEDICO'),
 ('recepcion.lira', '$2b$12$B28kk4y8APWPjH53NPYmZ.T17Ji6EBvvSyH4ds3PUP.RNwt2vvAlS', N'José Lira',       'RECEPCIONISTA');

INSERT INTO dbo.medicos (usuario_id, codigo_minsa)
SELECT id, 'MINSA-DEMO-001' FROM dbo.usuarios WHERE usuario = 'dra.rueda';
INSERT INTO dbo.recepcionistas (usuario_id, turno_laboral)
SELECT id, 'COMPLETO' FROM dbo.usuarios WHERE usuario = 'recepcion.lira';
GO

-- Servicios (4) con sus indicaciones previas
INSERT INTO dbo.servicios (nombre, indicaciones_previas) VALUES
 (N'Papanicolaou',            N'No tener relaciones sexuales ni usar óvulos, cremas o duchas vaginales 48 horas antes. No asistir durante la menstruación.'),
 (N'Ecografía Pélvica',       N'Llegar con la vejiga llena: tomar 1 litro de agua una hora antes y no orinar hasta terminar el estudio.'),
 (N'Control Prenatal',        N'Traer el carné perinatal y los exámenes de laboratorio anteriores. Llegar 10 minutos antes.'),
 (N'Consulta Ginecológica',   N'Traer los estudios previos, si los tiene. Llegar 10 minutos antes.');
GO

-- Preguntas de pre-triaje (10) por servicio
INSERT INTO dbo.preguntas_triaje (servicio_id, texto, tipo_respuesta, obligatoria, orden)
SELECT s.id, v.texto, v.tipo, v.oblig, v.orden
FROM (VALUES
 (N'Papanicolaou',          N'Fecha de su última menstruación',                         'FECHA',     1, 1),
 (N'Papanicolaou',          N'¿Se ha realizado un Papanicolaou antes?',                 'SI_NO',     1, 2),
 (N'Papanicolaou',          N'¿Usa algún método anticonceptivo?',                       'SELECCION', 0, 3),
 (N'Ecografía Pélvica',     N'Fecha de su última menstruación',                         'FECHA',     1, 1),
 (N'Ecografía Pélvica',     N'Motivo por el que solicita el estudio',                   'TEXTO',     1, 2),
 (N'Control Prenatal',      N'Fecha de su última menstruación (FUM)',                   'FECHA',     1, 1),
 (N'Control Prenatal',      N'Número de embarazos anteriores',                          'NUMERO',    1, 2),
 (N'Control Prenatal',      N'¿Presenta sangrado, dolor intenso o falta de movimiento fetal?', 'SI_NO', 1, 3),
 (N'Consulta Ginecológica', N'Motivo de la consulta',                                   'TEXTO',     1, 1),
 (N'Consulta Ginecológica', N'¿Tiene alguna alergia a medicamentos?',                   'TEXTO',     0, 2)
) AS v(servicio, texto, tipo, oblig, orden)
JOIN dbo.servicios s ON s.nombre = v.servicio;

INSERT INTO dbo.opciones_pregunta (pregunta_id, etiqueta, orden)
SELECT p.id, o.etiqueta, o.orden
FROM (VALUES (N'Ninguno',1),(N'Pastillas',2),(N'Inyección',3),(N'Dispositivo intrauterino (DIU)',4),(N'Preservativo',5)) AS o(etiqueta, orden)
CROSS JOIN dbo.preguntas_triaje p
WHERE p.texto = N'¿Usa algún método anticonceptivo?';
GO

-- Estudios sugeridos por trimestre (RF-02)
INSERT INTO dbo.estudios_sugeridos (trimestre, nombre, descripcion, orden) VALUES
 (1, N'Hemograma y grupo sanguíneo',        N'Examen de sangre inicial y tipo de sangre.',                          1),
 (1, N'Ecografía obstétrica temprana',      N'Confirma el embarazo, su ubicación y el tiempo de gestación.',        2),
 (2, N'Ecografía morfológica',              N'Revisa el desarrollo del bebé, entre las semanas 18 y 22.',           1),
 (2, N'Prueba de tolerancia a la glucosa',  N'Descarta diabetes gestacional, entre las semanas 24 y 28.',           2),
 (3, N'Ecografía de crecimiento',           N'Controla el peso del bebé, su posición y el líquido amniótico.',      1),
 (3, N'Monitoreo fetal',                    N'Registra el latido del bebé en las últimas semanas.',                 2);
GO

-- Horario de la medica: lunes a viernes, 08:00-16:00, turnos de 40 minutos (12 por dia)
INSERT INTO dbo.horarios_laborales (medico_id, dia_semana, hora_apertura, hora_cierre, duracion_turno)
SELECT m.usuario_id, d.dia, '08:00', '16:00', 40
FROM dbo.medicos m CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(dia);
GO

-- Turnos de los proximos 14 dias
DECLARE @hoy DATE = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central America Standard Time' AS DATE);
DECLARE @fin DATE = DATEADD(DAY, 13, @hoy);
EXEC dbo.sp_generar_turnos @hoy, @fin;
GO
