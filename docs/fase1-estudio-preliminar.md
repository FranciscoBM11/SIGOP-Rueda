# Fase 1 – 1. Introducción y objetivo del documento

Este documento corresponde al sistema SIGOP-Rueda: Sistema de Información Gineco-Obstétrica y Pre-triaje Clínica Rueda. El objetivo de esta fase es responder, con evidencia y sin diseñar todavía ninguna solución técnica, a dos preguntas: ¿vale la pena hacer este proyecto? y ¿qué problema resolvemos? Aquí se presenta la idea del sistema y se levantan las necesidades del negocio en lenguaje del cliente, no en lenguaje técnico.

**Técnicas de elicitación aplicadas:** para fundamentar el contenido de este documento se realizó (i) una entrevista estructurada con la médica especialista de la Clínica Rueda y su asistente de recepción, orientada a conocer el proceso actual de agendamiento telefónico, el manejo en papel de las indicaciones y la entrega física de resultados; (ii) observación directa del flujo de atención en un día de consulta; y (iii) revisión de los formularios de admisión, hojas de preparación de estudios y registro de citas que utiliza actualmente la clínica. Estas tres fuentes son la base de la viabilidad, las historias de usuario y la matriz de requerimientos que siguen.

**Problema actual identificado:** la Clínica Rueda, un consultorio uniprofesional de Ginecología y Obstetricia, gestiona hoy su agenda por vía telefónica y en un cuaderno físico. Esto genera choques de horario, olvido de indicaciones previas a los estudios, entrega de resultados únicamente de forma presencial y ausencia de un registro digital del triaje de cada paciente antes de la consulta. La Tabla 1 resume las áreas afectadas, con la causa y la consecuencia de cada problema.

**Tabla 1:** *Resumen de áreas afectadas por la situación actual.*

| **Área**                   | **Situación actual**                                            | **Causa**                                           | **Consecuencia**                                                             | **Cómo lo atiende SIGOP-Rueda**                                      |
|----------------------------|-----------------------------------------------------------------|-----------------------------------------------------|------------------------------------------------------------------------------|----------------------------------------------------------------------|
| Agenda de citas            | Los turnos se reservan por teléfono y se anotan en un cuaderno. | No existe un registro único y compartido de turnos. | Choques de horario y dobles reservas; recepción ocupada atendiendo llamadas. | Calendario en línea que solo ofrece turnos libres (RF-03, RN-01).    |
| Preparación de estudios    | Las indicaciones se dan de forma verbal o en papel.             | No hay un canal escrito y automático.               | Pacientes que llegan sin preparación; reconsultas.                           | Correo automático con las indicaciones del servicio (RF-07).         |
| Entrega de resultados      | Solo presencial y en papel.                                     | Los informes no están digitalizados.                | Desplazamientos innecesarios; tiempo de recepción buscando informes.         | Visor seguro con cédula y código de cita (RF-08, RF-12).             |
| Información clínica previa | La médica conoce los antecedentes cuando la paciente ya entró.  | No existe un pre-triaje registrado.                 | Consulta más larga y menor preparación del caso.                             | Pre-triaje por servicio visible antes de la consulta (RF-06, RF-11). |
| Control de asistencia      | Las inasistencias no se registran de forma sistemática.         | El cuaderno no maneja estados de cita.              | Turnos perdidos que no se miden ni se recuperan.                             | Estados de cita, incluido No asistió (RF-10, RF-17).                 |

# Fase 1 – 2. Acta de Constitución del Proyecto (Project Charter)

## 2.1 Identificación

**Tabla 2:** *Identificación del proyecto.*

| **Campo**                         | **Descripción**                                                                                                                                         |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Nombre del proyecto / sistema** | SIGOP-Rueda: Sistema de Información Gineco-Obstétrica y Pre-triaje Clínica Rueda                                                                        |
| **Cliente / patrocinador**        | Dra. Rueda, especialista en Ginecología y Obstetricia. Clínica Rueda: consultorio uniprofesional con apoyo de recepción.                                |
| **Equipo del proyecto**           | Sergio Sacarías Rueda Hernández — Analista / Product Owner · Marien Tatiana Gómez Moreno — Diseño y UX · Francisco Javier Bárcenas Montoya — Desarrollo |
| **Docente**                       | MSc. Walter José Quintero Acevedo                                                                                                                       |
| **Versión del documento**         | 2.0 — corregida según la evaluación del docente (octubre de 2026)                                                                                       |

## 2.2 Stakeholders clave

La Tabla 3 consolida a los interesados identificados en la entrevista y en las User Personas (sección 4). Se clasifican por tipo, nivel de influencia sobre las decisiones del proyecto y nivel de impacto que el sistema tendrá sobre ellos.

**Tabla 3:** *Stakeholders del proyecto.*

| **Rol / Actor**                            | **Tipo**                        | **Responsabilidad / Interés**                                                          | **Influencia** | **Impacto** | **Necesidad principal**                                          |
|--------------------------------------------|---------------------------------|----------------------------------------------------------------------------------------|----------------|-------------|------------------------------------------------------------------|
| Dra. Rueda (médica especialista)           | Patrocinador y usuario primario | Aprueba alcance y prioridades; atiende las consultas y configura su disponibilidad.    | Alta           | Alto        | Ver la agenda y el triaje de cada paciente antes de la consulta. |
| Pacientes (persona "María")                | Usuario primario (externo)      | Agendan, cancelan o reprograman citas, completan el pre-triaje y consultan resultados. | Media          | Alto        | Resolver citas y resultados sin llamar ni desplazarse.           |
| Recepcionista (persona "Ing. Jose Lira")   | Usuario primario (interno)      | Gestiona la agenda diaria, registra asistencia y carga los informes.                   | Media          | Alto        | Un panel simple, sin curva de aprendizaje.                       |
| Equipo de desarrollo (3 integrantes)       | Equipo                          | Analiza, diseña, construye y prueba el sistema.                                        | Alta           | Medio       | Requisitos claros y validados con la clienta.                    |
| Docente (MSc. Walter Quintero)             | Académico                       | Evalúa los entregables según el Plan de Ejecución.                                     | Alta           | Bajo        | Artefactos completos, trazables y verificables.                  |
| Proveedor de correo y hosting              | Secundario (externo)            | Entrega los correos y aloja la aplicación.                                             | Baja           | Bajo        | Uso conforme a sus condiciones de servicio.                      |
| Autoridad de protección de datos (Ley 787) | Secundario (regulador)          | Vela por el tratamiento lícito de datos personales sensibles.                          | Media          | Bajo        | Consentimiento, seguridad y derechos ARCO garantizados.          |

## 2.3 Propósito y justificación

La Clínica Rueda no cuenta con una herramienta digital que centralice el agendamiento, el pre-triaje clínico y la entrega de resultados. Esto provoca dobles reservas, pérdida de indicaciones previas al estudio y desplazamientos innecesarios de las pacientes solo para recoger un informe en papel. SIGOP-Rueda busca resolver estos tres puntos de fricción mediante una plataforma web con calculadora obstétrica, agendamiento inteligente, pre-triaje dinámico y un visor seguro de resultados.

## 2.4 Justificación de la solución basada en tecnología web

Antes de elegir una aplicación web se compararon las cuatro alternativas razonables para un consultorio uniprofesional. El criterio decisivo es que la usuaria más numerosa, la paciente, no debe instalar nada ni crear una cuenta para agendar o ver sus resultados, y que la clínica debe poder usar el sistema desde cualquier equipo.

**Tabla 4:** *Comparación de alternativas tecnológicas.*

| **Criterio**                            | **Aplicación web (seleccionada)**                           | **App móvil nativa**                                           | **Software de escritorio**                    | **Sistema comercial (POS / SaaS de clínicas)**                                     |
|-----------------------------------------|-------------------------------------------------------------|----------------------------------------------------------------|-----------------------------------------------|------------------------------------------------------------------------------------|
| Acceso de la paciente                   | Desde cualquier navegador, sin instalación.                 | Debe descargarla de una tienda; barrera para un uso ocasional. | No tiene acceso: solo funciona en la clínica. | Depende del producto; normalmente sin portal propio para la paciente.              |
| Acceso del personal                     | Desde la PC de recepción, laptop o teléfono.                | Solo desde teléfonos.                                          | Solo desde el equipo donde se instala.        | Navegador o app del proveedor.                                                     |
| Costo de desarrollo                     | Un solo código para todos los dispositivos.                 | Dos versiones (Android e iOS) o un framework adicional.        | Bajo, pero sin portal público.                | Sin desarrollo, pero con licencia mensual por usuario.                             |
| Publicación y actualización             | Inmediata en el servidor.                                   | Revisión de las tiendas en cada versión.                       | Reinstalar en cada equipo.                    | Controlada por el proveedor.                                                       |
| Adaptación al pre-triaje y a la Ley 787 | Total: el cuestionario y los controles se diseñan a medida. | Total, con mayor costo.                                        | Total, pero sin acceso remoto.                | Limitada a lo que ofrezca el producto; los datos quedan en servidores de terceros. |
| Conocimiento del equipo                 | Alto (HTML, JavaScript).                                    | Bajo.                                                          | Medio.                                        | No aplica.                                                                         |

**Decisión:** se adopta una aplicación web responsiva. Es la única alternativa que permite a la paciente agendar y consultar resultados sin instalar nada, da acceso al personal desde cualquier dispositivo, mantiene un único código y permite adaptar el pre-triaje y los controles de la Ley 787 sin pagar licencias. La comparación de despliegue (servidor propio frente a nube) se presenta en la sección 3.1.

## 2.5 Objetivo general (SMART)

Desarrollar e implementar la plataforma web SIGOP-Rueda, de modo que la Clínica Rueda pueda automatizar el proceso de agendamiento de citas, el pre-triaje clínico y la entrega segura de resultados médicos, eliminando las dobles reservas y reduciendo a menos de 2 minutos el tiempo de entrega de las indicaciones previas a cada estudio, dentro del calendario oficial de la asignatura (Fase 2 en octubre y entrega final del 4 al 7 de noviembre de 2026).

Para que las metas sean medibles se define la línea base observada durante la elicitación y la forma de medir el resultado:

**Tabla 5:** *Línea base y metas del objetivo general.*

| **Indicador**                                 | **Línea base (situación actual)**                                                                                                                                                                                   | **Meta**                                             | **Cómo se mide**                                                                                                                                                                                                                                                               |
|-----------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Dobles reservas                               | Se presentan choques de horario de forma recurrente, según la entrevista con la recepción y la observación de un día de consulta. El cuaderno no registra los choques, por lo que hoy no es posible cuantificarlos. | 0 dobles reservas al mes.                            | RN-01 impide reservar un turno ocupado. Desde la implantación, cada intento rechazado por turno ocupado (respuesta 409 Conflict, sección 5.1 de la Fase 2) se cuenta como una doble reserva evitada; ese conteo cuantifica el problema y demuestra el cumplimiento de la meta. |
| Tiempo de entrega de las indicaciones previas | No existe entrega escrita: la paciente las recibe solo si llama o asiste a la clínica.                                                                                                                              | Menos de 2 minutos después de confirmar la cita.     | Diferencia entre la fecha de registro de la cita y la fecha de envío de la notificación.                                                                                                                                                                                       |
| Reservas automatizadas                        | 0 % (todas las reservas son telefónicas).                                                                                                                                                                           | 100 % de las reservas registradas con código único.  | Conteo de citas con código CR-#####.                                                                                                                                                                                                                                           |
| Entrega de resultados                         | 100 % presencial y en papel.                                                                                                                                                                                        | 100 % de los informes cargados disponibles en línea. | Registros de InformeResultado consultables en CU-09.                                                                                                                                                                                                                           |

## 2.6 Objetivos específicos

- **OE-01.** Automatizar el 100 % de las reservas de turnos, con confirmación y folio único de atención.

- **OE-02.** Digitalizar el pre-triaje clínico según el motivo de consulta (Papanicolaou, Ecografía Pélvica, Control Prenatal, entre otros).

- **OE-03.** Habilitar la entrega y consulta segura de resultados en PDF sin necesidad de contraseñas complejas.

- **OE-04.** Poner a disposición pública una calculadora obstétrica de Fecha Probable de Parto (Regla de Naegele) como puerta de entrada al agendamiento.

- **OE-05.** Permitir la cancelación, la reprogramación y el registro de asistencia de las citas, liberando el turno para otras pacientes.

## 2.7 Alcance preliminar

**Incluye:**

- Portal público: calculadora obstétrica, agendamiento de turnos, cancelación y reprogramación de citas, pre-triaje e indicaciones, consulta de resultados.

- Panel administrativo: autenticación, agenda diaria con estados de cita (incluida la inasistencia), ficha de triaje, carga de informes, configuración de disponibilidad.

- Notificación automática por correo electrónico (y opcionalmente WhatsApp) con folio de cita e indicaciones.

**No incluye:**

- Gestión de múltiples médicos o especialidades (el modelo es uniprofesional, centralizado en un único especialista).

- Historia clínica electrónica completa ni módulo de facturación o cobros en línea.

- Telemedicina o consulta remota por videollamada.

## 2.8 Restricciones y supuestos

- **Restricción:** el sistema debe ser una aplicación web, desarrollada dentro del calendario oficial de la asignatura (Fase 2 en octubre y entrega final del 4 al 7 de noviembre de 2026), con un esfuerzo estimado de 252 horas-hombre.

- **Restricción:** debe cumplir con la Ley N.º 787, Ley de Protección de Datos Personales de Nicaragua, por tratar datos de salud.

- **Supuesto:** la clínica cuenta con conexión a internet estable y un único especialista activo durante el período del proyecto.

- **Supuesto:** las pacientes otorgan consentimiento informado explícito antes de registrar sus datos personales y de salud.

# Fase 1 – 3. Documento de Viabilidad

## 3.1 Viabilidad técnica

Sí existen la tecnología, las herramientas y el conocimiento necesarios. Para que el sistema sea fácil de programar, mantener y entender por el equipo, se eligió una única tecnología por capa, todas de código abierto, ampliamente documentadas y ya conocidas al menos por un integrante del equipo. No se requiere licenciamiento de software propietario.

**Tabla 6:** *Stack tecnológico seleccionado.*

| **Capa**       | **Tecnología elegida**                             | **Justificación**                                                                                                                                                                                                                                                                          |
|----------------|----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Frontend       | HTML5 + Tailwind CSS + JavaScript puro             | Sin frameworks adicionales: menor curva de aprendizaje y suficiente para formularios, calculadora y visor de resultados.                                                                                                                                                                   |
| Calendario     | FullCalendar.js                                    | Librería gratuita que resuelve la vista de agenda y turnos sin desarrollo propio.                                                                                                                                                                                                          |
| Backend        | Node.js + NestJS (sobre Express) con TypeScript    | Usa JavaScript tipado (TypeScript), el mismo lenguaje del frontend: el equipo trabaja con un solo lenguaje en todo el sistema. NestJS organiza el servidor en módulos con el patrón MVC (controladores, servicios y repositorios) y facilita agregar funciones nuevas (Fase 3, sección 2). |
| Base de datos  | PostgreSQL + TypeORM                               | Relacional, con restricciones UNIQUE para el código de cita y para impedir dobles reservas, migraciones versionadas y columnas cifradas con AES-256 para los datos de salud (Fase 3, sección 3).                                                                                           |
| Notificaciones | Nodemailer (correo)                                | Canal principal y gratuito. Twilio/WhatsApp queda como mejora opcional (prioridad Could).                                                                                                                                                                                                  |
| Despliegue     | VPS en la nube (proveedor tentativo: DigitalOcean) | Ver la comparación servidor propio frente a nube.                                                                                                                                                                                                                                          |

**Tabla 7:** *Comparación: servidor propio frente a nube.*

| **Criterio**            | **Servidor propio (en la clínica)**                  | **VPS en la nube (seleccionado)**                                                  |
|-------------------------|------------------------------------------------------|------------------------------------------------------------------------------------|
| Costo inicial           | Alto: compra del equipo, UPS y licencias de sistema. | Bajo: pago mensual fijo (\$10/mes), sin inversión inicial.                         |
| Mantenimiento           | A cargo de la clínica; requiere personal técnico.    | El proveedor mantiene el hardware; el equipo solo administra el software.          |
| Disponibilidad          | Depende de la electricidad y del internet local.     | Infraestructura del proveedor, adecuada para la meta de 99 % mensual (RNF-05).     |
| Respaldos y seguridad   | Respaldos y protección física a cargo de la clínica. | Respaldos automáticos opcionales, certificado SSL gratuito y acceso remoto seguro. |
| Acceso de las pacientes | Requiere exponer la red de la clínica a internet.    | Accesible desde cualquier lugar con un dominio público.                            |

**Decisión:** VPS en la nube con DigitalOcean como proveedor tentativo, por su bajo costo inicial, menor carga de mantenimiento y mayor disponibilidad, acorde con el presupuesto limitado del consultorio. Cualquier proveedor equivalente (por ejemplo, un VPS de AWS Lightsail o de Azure) cumple los mismos criterios.

## 3.2 Viabilidad económica

### 3.2.1 Costos de infraestructura y desarrollo

Costos estimados para el primer año de operación (valores de referencia en USD):

**Tabla 8:** *Costos estimados del primer año.*

| **Concepto**                                                         | **Costo estimado** | **Periodicidad**                                             |
|----------------------------------------------------------------------|--------------------|--------------------------------------------------------------|
| Hosting / VPS (p. ej. DigitalOcean, 2 vCPU)                          | \$ 10.00           | Mensual (\$120/año)                                          |
| Dominio .com                                                         | \$ 15.00           | Anual                                                        |
| Certificado SSL (Let's Encrypt)                                      | \$ 0.00            | Anual (gratuito)                                             |
| Notificaciones por correo (Nodemailer)                               | \$ 0.00            | Canal principal (gratuito)                                   |
| Notificaciones WhatsApp/SMS opcionales (Twilio, 300 msj/mes)         | \$ 1.50 – 15.00    | Mensual, según volumen (opcional)                            |
| Almacenamiento en la nube para PDF (S3 o equivalente)                | \$ 3.00            | Mensual (\$36/año)                                           |
| Horas-hombre de desarrollo (3 integrantes × 14 semanas × 6 h/semana) | 252 horas-hombre   | Duración del proyecto                                        |
| Costo de operación, primer año (sin horas-hombre)                    | \$ 171 – 351       | \$171 solo con correo; \$351 con WhatsApp opcional           |
| Costo de desarrollo (252 h × \$3.44/h)                               | ≈ \$ 867           | Tarifa nacional de referencia: \$550/mes ≈ \$3.44/h efectivo |
| Inversión total estimada, primer año                                 | \$ 1,038 – 1,218   | Desarrollo + operación (sin WhatsApp / con WhatsApp)         |

El presupuesto de la clínica, un consultorio uniprofesional, es limitado, por lo que el stack se seleccionó priorizando herramientas gratuitas o de bajo costo. El costo de operación que asumiría la clínica es de \$171 al año (≈ \$14.25 al mes) con el canal de correo. El costo de desarrollo (≈ \$867) corresponde al valor monetario de las 252 horas-hombre del equipo.

### 3.2.2 Estimación por Puntos de Función (IFPUG)

Para contrastar la estimación por horas-hombre con un modelo formal, se contaron los puntos de función sin ajustar (PFSA) a partir de las clases de análisis y de los casos de uso de la Fase 2. La complejidad de cada función (baja, media o alta) se asignó según el número de datos y archivos que maneja, con los pesos estándar de IFPUG.

**Tabla 9:** *Conteo de puntos de función sin ajustar.*

| **Tipo de función**                | **Funciones identificadas (complejidad)**                                                                                                                                                      | **Cant.** | **PF**               |
|------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|----------------------|
| Archivos lógicos internos (ALI)    | Cita (media), FichaTriaje con respuestas (media); Paciente, Turno/HorarioLaboral, Servicio con preguntas, InformeResultado, Notificación, CambioEstadoCita, UsuarioAdministrativo (baja)       | 9         | 2×10 + 7×7 = 69      |
| Archivos de interfaz externa (AIE) | Ninguno: el servicio de correo no aporta datos que el sistema mantenga.                                                                                                                        | 0         | 0                    |
| Entradas externas (EE)             | Agendar cita (alta); completar triaje, reprogramar, cancelar/reprogramar desde recepción, subir informe, configurar disponibilidad (media); cancelar, iniciar sesión, actualizar estado (baja) | 9         | 1×6 + 5×4 + 3×3 = 35 |
| Salidas externas (SE)              | Cálculo de FPP con semanas y trimestre, correo de confirmación, agenda diaria con estados (media); correo de reprogramación (baja)                                                             | 4         | 3×5 + 1×4 = 19       |
| Consultas externas (CE)            | Consultar disponibilidad, consultar y descargar resultados (media); validar acceso, consultar triaje, buscar paciente por cédula (baja)                                                        | 5         | 2×4 + 3×3 = 17       |
| Total de PF sin ajustar (PFSA)     |                                                                                                                                                                                                | 27        | 140                  |

**Tabla 10:** *Características generales del sistema (factor de ajuste).*

| **Característica general del sistema** | **Valor (0–5)** | **Característica general del sistema** | **Valor (0–5)** |
|----------------------------------------|-----------------|----------------------------------------|-----------------|
| 1\. Comunicación de datos              | 4               | 8\. Actualización en línea             | 4               |
| 2\. Procesamiento distribuido          | 1               | 9\. Procesamiento complejo             | 2               |
| 3\. Rendimiento                        | 3               | 10\. Reutilización                     | 2               |
| 4\. Configuración muy utilizada        | 2               | 11\. Facilidad de instalación          | 2               |
| 5\. Tasa de transacciones              | 2               | 12\. Facilidad de operación            | 3               |
| 6\. Entrada de datos en línea          | 5               | 13\. Múltiples sitios                  | 1               |
| 7\. Eficiencia del usuario final       | 4               | 14\. Facilidad de cambio               | 3               |
| Grado total de influencia (GTI)        | 38              |                                        |                 |

**Factor de ajuste:** FA = 0.65 + 0.01 × GTI = 0.65 + 0.01 × 38 = **1.03**. **Puntos de función ajustados:** PFA = PFSA × FA = 140 × 1.03 ≈ **144 PF**.

Para convertir los puntos de función en tamaño de código se usa un factor de referencia de ≈ 50 líneas de código por punto de función para JavaScript, valor promedio citado en las tablas de conversión de la industria. Tamaño estimado: 144 × 50 ≈ **7.2 KLDC** (miles de líneas de código).

### 3.2.3 Estimación con COCOMO Básico

Se aplica COCOMO Básico en modo **orgánico** (equipo pequeño, requisitos conocidos y un dominio familiar), con los coeficientes a = 2.4, b = 1.05, c = 2.5 y d = 0.38:

- Esfuerzo: E = 2.4 × (7.2)^1.05 ≈ **19.1 personas-mes**.

- Duración: D = 2.5 × (19.1)^0.38 ≈ **7.7 meses**.

- Personal promedio: P = E / D ≈ **2.5 personas**.

- Costo de referencia: 19.1 personas-mes × \$550/mes ≈ **\$10,500**.

**Tabla 11:** *Comparación de las estimaciones de esfuerzo y costo.*

| **Método**                        | **Esfuerzo**             | **Duración**                | **Costo de desarrollo** | **Uso en este proyecto**                             |
|-----------------------------------|--------------------------|-----------------------------|-------------------------|------------------------------------------------------|
| Horas-hombre del equipo           | 252 h ≈ 1.7 personas-mes | 14 semanas a tiempo parcial | ≈ \$867                 | Presupuesto real del proyecto académico (MVP).       |
| COCOMO Básico (orgánico) desde PF | ≈ 19.1 personas-mes      | ≈ 7.7 meses                 | ≈ \$10,500              | Valor de mercado de referencia del sistema completo. |

**Interpretación:** la diferencia entre ambos métodos es esperable. COCOMO Básico estima el esfuerzo de un desarrollo profesional completo (documentación, pruebas exhaustivas, endurecimiento para producción y gestión), con un modelo calibrado en proyectos tradicionales que no aprovechaban librerías modernas. El proyecto académico, en cambio, construye un MVP acotado a las funciones Must, reutiliza componentes existentes (FullCalendar, Tailwind, Nodemailer) y se trabaja a tiempo parcial. Por eso el presupuesto del proyecto se mantiene en 252 horas-hombre (≈ \$867), y la cifra de COCOMO (≈ \$10,500) se usa como el valor de referencia de lo que la clínica recibe.

### 3.2.4 Retorno de la inversión (ROI) a 12 meses

El ROI se calcula con supuestos conservadores, marcados como propuestos para validarlos con la clienta (sección 7.7 de la Fase 2):

**Tabla 12:** *Supuestos del cálculo de ROI.*

| **Concepto**                             | **Supuesto (propuesto)**                                                                                                         | **Valor anual** |
|------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|-----------------|
| Tiempo de recepción liberado             | 25 llamadas diarias de agenda × 3 min × 22 días ≈ 27.5 h/mes, a ≈ \$2/h (salario de recepción de referencia)                     | ≈ \$660         |
| Citas recuperadas por menor inasistencia | 200 citas/mes; el recordatorio y las indicaciones escritas reducen la inasistencia en 3 puntos (6 citas/mes) a \$20 por consulta | ≈ \$1,440       |
| Beneficio total estimado                 |                                                                                                                                  | ≈ \$2,100       |
| Inversión del primer año                 | Desarrollo (\$867) + operación con correo (\$171)                                                                                | \$1,038         |

**ROI a 12 meses** = (beneficio − inversión) / inversión = (2,100 − 1,038) / 1,038 ≈ **102 %**. **Periodo de recuperación** = 1,038 / (2,100 / 12) ≈ **6 meses**. Aun si los beneficios fueran la mitad de lo estimado, el sistema recuperaría la inversión antes de terminar el primer año. No se cuantifica el ahorro de desplazamientos de las pacientes, que es un beneficio adicional para ellas.

## 3.3 Viabilidad operativa

El sistema resolverá el problema real diagnosticado en la entrevista (agenda telefónica, pérdida de indicaciones, entrega presencial de resultados) y será utilizado tanto por las pacientes (portal público, sin necesidad de registro con contraseña) como por el personal de recepción y la médica (panel administrativo). Ambos perfiles cuentan con alfabetización digital básica (uso habitual de correo y WhatsApp), lo que reduce el riesgo de rechazo al cambio. Para asegurar la adopción se plantea un plan de capacitación y una implantación gradual.

### 3.3.1 Plan de capacitación

**Tabla 13:** *Plan de capacitación.*

| **Sesión**                        | **Participantes**      | **Duración** | **Contenido**                                                                                   | **Material de apoyo**                             |
|-----------------------------------|------------------------|--------------|-------------------------------------------------------------------------------------------------|---------------------------------------------------|
| S1. Panel administrativo y agenda | Recepcionista          | 2 h          | Inicio de sesión, agenda diaria, estados de cita, cancelación y reprogramación (CU-10 a CU-13). | Guía rápida en PDF (2 páginas) y video corto.     |
| S2. Triaje y disponibilidad       | Médica                 | 1 h          | Consulta del triaje, marcar Atendida, configuración de horarios (CU-12, CU-14, CU-16).          | Guía rápida en PDF.                               |
| S3. Carga de resultados           | Recepcionista          | 1 h          | Búsqueda por cédula, carga de PDF y verificación en el visor (CU-15, CU-09).                    | Lista de verificación impresa.                    |
| S4. Orientación a pacientes       | Recepcionista y médica | 30 min       | Cómo explicar a la paciente el agendamiento en línea y el uso del código de cita.               | Afiche con código QR al portal en sala de espera. |

**Soporte post-implantación:** durante las 4 semanas siguientes a la puesta en marcha, el equipo atenderá dudas por WhatsApp en horario laboral y realizará una revisión semanal de incidencias con la recepcionista.

### 3.3.2 Curva de adopción prevista

**Tabla 14:** *Etapas de adopción del sistema.*

| **Etapa**              | **Periodo**       | **Actividades**                                                                                  | **Meta de adopción**                                                                     |
|------------------------|-------------------|--------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| 1\. Marcha en paralelo | Semanas 1–2       | El cuaderno y el sistema conviven; recepción registra en el sistema todas las citas telefónicas. | 100 % de las citas registradas en el sistema; 30 % agendadas en línea por las pacientes. |
| 2\. Sistema principal  | Semanas 3–4       | El cuaderno queda solo como respaldo; se cargan todos los resultados en PDF.                     | 50 % de citas agendadas en línea; 100 % de informes disponibles en el visor.             |
| 3\. Operación normal   | Mes 2 en adelante | Se retira el cuaderno; seguimiento mensual de indicadores (sección 2.5).                         | 70 % de citas en línea; 0 dobles reservas.                                               |

## 3.4 Viabilidad legal

El sistema procesa datos de salud, considerados datos sensibles bajo la Ley N.º 787, Ley de Protección de Datos Personales de Nicaragua. Se identifican los siguientes mecanismos concretos de cumplimiento:

- Consentimiento informado explícito (casilla de aceptación) antes de capturar cualquier dato personal o de salud durante el agendamiento.

- Cifrado en reposo (AES-256) de las respuestas de triaje y de los informes médicos almacenados.

- Cifrado en tránsito mediante HTTPS/TLS 1.2 o superior en todas las comunicaciones cliente-servidor.

- Contraseñas del panel administrativo cifradas con bcrypt; ninguna credencial se almacena en texto plano.

- Política de privacidad publicada en el portal, con mecanismo de contacto para ejercer derechos ARCO (Acceso, Rectificación, Cancelación, Oposición).

- Control de acceso a resultados restringido a la combinación cédula + código único de cita, con límite de intentos para mitigar ataques de fuerza bruta.

- Minimización: la ficha de triaje solo es visible para la médica (RN-16) y ningún dato personal viaja en la dirección (URL) de las peticiones.

## 3.5 Conclusión de viabilidad

**CONTINUAR CON AJUSTES.** El proyecto es técnica, económica, operativa y legalmente viable con el stack definido en 3.1 y los presupuestos de 3.2; el ROI estimado es positivo en el primer año. Los ajustes recomendados en la versión anterior ya se definieron en la Fase 2: el cifrado AES-256 de triaje e informes (RNF-10) y el mecanismo anti-fuerza-bruta del visor (5 intentos fallidos con bloqueo temporal, RN-15, clase IntentoAcceso). Queda pendiente confirmar con la clienta los valores propuestos de la sección 7.7 de la Fase 2.

# Fase 1 – 4. User Personas

Se definen tres personas de usuario, construidas a partir de la entrevista con la clienta, para orientar la redacción de las historias de usuario.

**Tabla 15:** *User Personas.*

| **Persona**                                | **Perfil**                                                                                                          | **Comportamiento**                                                                                                                          | **Frustraciones**                                                                                                                                         | **Necesidad principal**                                                                      | **Frecuencia de uso esperada**                                                         |
|--------------------------------------------|---------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| María — Paciente embarazada                | 28 años, en control prenatal, usa smartphone a diario, prefiere resolver trámites sin llamadas telefónicas.         | Usa correo y WhatsApp a diario; resuelve sus trámites desde el celular y espera confirmaciones inmediatas.                                  | Debe llamar por teléfono para conseguir turno; olvida o no recibe las indicaciones previas al estudio; se desplaza solo para recoger un informe en papel. | Agendar su cita y conocer su semana de gestación sin ir presencialmente a la clínica.        | Mensual (control prenatal) y puntual por cada estudio o resultado: 1 a 3 veces al mes. |
| Dra. Rueda — Médica especialista           | Única gineco-obstetra de la clínica; atiende en consulta y quiere reducir el tiempo administrativo entre pacientes. | Atiende consulta de forma continua y revisa su agenda entre pacientes; hoy depende del cuaderno físico y de lo que le informa la recepción. | Choques de horario y dobles reservas; pacientes que llegan sin la preparación del estudio; no conocer los antecedentes de la paciente antes de que entre. | Ver su agenda del día y el triaje de cada paciente antes de que entre al consultorio.        | Diaria, varias veces por jornada; configuración de horarios semanal o mensual.         |
| Ing. Jose Lira — Recepcionista / Asistente | Gestiona la agenda física y entrega resultados en papel; alfabetización digital básica.                             | Atiende llamadas, anota las citas en el cuaderno y entrega los resultados impresos; usa correo y WhatsApp de forma habitual.                | Atiende llamadas solo para agendar, cancelar o reprogramar; el cuaderno se llena de tachones; buscar y entregar informes en papel le quita tiempo.        | Un panel simple para confirmar citas y subir los PDF de resultados sin curva de aprendizaje. | Diaria y continua durante toda la jornada laboral.                                     |

# Fase 1 – 5. Historias de Usuario

Formato: "Como \[rol\] quiero \[acción\] para \[beneficio\]". Se listan 12 historias que cubren la totalidad del alcance definido en la sección 2.7, en lenguaje del negocio, sin tecnicismos ni diseño. El cumplimiento de la Ley 787 y el cifrado de datos no se redactan como historia de usuario, porque no corresponden a un rol de negocio: se tratan como requerimientos no funcionales (RNF-06 y RNF-10) y como ítem transversal del backlog (PB-12).

## 5.1 Historias de usuario

**Tabla 16:** *Historias de usuario.*

| **ID** | **Historia de usuario**                                                                                                                                                                                                                      |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| HU-01  | Como paciente quiero calcular mi Fecha Probable de Parto ingresando mi FUM para conocer mi semana de gestación sin necesidad de agendar una cita.                                                                                            |
| HU-02  | Como paciente quiero ver los horarios disponibles del especialista para elegir el turno que más me convenga.                                                                                                                                 |
| HU-03  | Como paciente quiero agendar una cita ingresando mis datos personales para reservar mi turno médico sin llamar por teléfono.                                                                                                                 |
| HU-04  | Como paciente quiero completar un formulario de pre-triaje según el servicio elegido para que la médica conozca mis antecedentes antes de la consulta.                                                                                       |
| HU-05  | Como paciente quiero recibir un código único de cita y las indicaciones previas por correo para prepararme adecuadamente al estudio.                                                                                                         |
| HU-06  | Como paciente quiero consultar y descargar mis resultados médicos ingresando mi cédula y código de cita para no tener que recogerlos en persona.                                                                                             |
| HU-07  | Como recepcionista quiero iniciar sesión de forma segura en el panel administrativo para gestionar la agenda diaria.                                                                                                                         |
| HU-08  | Como recepcionista quiero visualizar la lista de citas del día, actualizar su estado (En Espera, Atendida, No asistió, Cancelada) y cancelar o reprogramar una cita a pedido de la paciente para mantener la agenda al día y liberar turnos. |
| HU-09  | Como médica quiero ver rápidamente las respuestas de triaje de cada paciente antes de la consulta para anticipar el caso clínico.                                                                                                            |
| HU-10  | Como recepcionista quiero subir los informes en PDF vinculados a la cédula de la paciente para que queden disponibles en el visor de resultados.                                                                                             |
| HU-11  | Como médica quiero configurar mis días laborales, horarios y duración de turnos para mantener actualizada mi disponibilidad.                                                                                                                 |
| HU-12  | Como paciente quiero cancelar o reprogramar mi cita ingresando mi cédula y código de cita para liberar o cambiar mi turno sin llamar por teléfono.                                                                                           |

## 5.2 Criterios de aceptación

Cada historia se considera terminada cuando cumple todos sus criterios. Se redactan en formato Dado–Cuando–Entonces y se verifican con las pruebas de la Fase 4.

**Tabla 17:** *Criterios de aceptación por historia de usuario.*

<table>
<colgroup>
<col style="width: 9%" />
<col style="width: 90%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>HU</strong></th>
<th><strong>Criterios de aceptación</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>HU-01</td>
<td><p>1. Dado una FUM válida, cuando la paciente calcula, entonces se muestra la FPP según la Regla de Naegele y coincide con el cálculo manual.</p>
<p>2. Dado una FUM futura o anterior a 294 días, cuando intenta calcular, entonces el sistema no calcula e indica el motivo.</p>
<p>3. El resultado muestra semanas y días de gestación, trimestre y al menos un estudio sugerido.</p></td>
</tr>
<tr class="even">
<td>HU-02</td>
<td><p>1. Solo se muestran turnos dentro de los días y horas laborales configurados.</p>
<p>2. Un turno con cita activa no aparece como seleccionable.</p>
<p>3. No se muestran turnos en fechas u horas pasadas.</p></td>
</tr>
<tr class="odd">
<td>HU-03</td>
<td><p>1. Dado un campo obligatorio vacío o con formato inválido, cuando intenta confirmar, entonces no se envía y se indica el campo a corregir.</p>
<p>2. Sin consentimiento aceptado no se guarda ningún dato.</p>
<p>3. Si otra paciente ocupó el turno, se informa y se ofrecen otros turnos sin perder los datos ingresados.</p></td>
</tr>
<tr class="even">
<td>HU-04</td>
<td><p>1. Cada servicio muestra solo sus preguntas, en el orden configurado.</p>
<p>2. No se avanza si falta una respuesta obligatoria.</p>
<p>3. Las respuestas quedan vinculadas a la cita y almacenadas cifradas.</p></td>
</tr>
<tr class="odd">
<td>HU-05</td>
<td><p>1. Al confirmar la reserva se muestra un código CR-##### que no se repite.</p>
<p>2. El correo con código, servicio, fecha, hora e indicaciones llega en menos de 2 minutos.</p>
<p>3. Si el envío falla, la cita se conserva y la notificación queda registrada como Fallida.</p></td>
</tr>
<tr class="even">
<td>HU-06</td>
<td><p>1. Con cédula y código correctos se listan los informes de la cita y se descargan en PDF.</p>
<p>2. Con datos incorrectos el mensaje es genérico y no revela cuál dato falló.</p>
<p>3. Tras 5 intentos fallidos consecutivos el acceso se bloquea temporalmente (15 min, propuesto).</p></td>
</tr>
<tr class="odd">
<td>HU-07</td>
<td><p>1. Con credenciales válidas se accede al panel con las opciones del rol.</p>
<p>2. Tras 5 intentos fallidos consecutivos la cuenta se bloquea temporalmente.</p>
<p>3. La contraseña nunca se muestra ni se almacena en texto plano.</p></td>
</tr>
<tr class="even">
<td>HU-08</td>
<td><p>1. La agenda muestra las citas del día ordenadas por hora, con su estado.</p>
<p>2. Solo se permiten las transiciones de RN-06 y cada cambio registra fecha, hora y usuario.</p>
<p>3. Al cancelar o reprogramar, el turno anterior vuelve a estar disponible en el calendario público.</p></td>
</tr>
<tr class="odd">
<td>HU-09</td>
<td><p>1. Desde la agenda, con un clic se abre la ficha de triaje de la cita.</p>
<p>2. La ficha carga en menos de 3 segundos.</p>
<p>3. Si la cita no tiene ficha, se informa.</p></td>
</tr>
<tr class="even">
<td>HU-10</td>
<td><p>1. Solo se aceptan archivos PDF de hasta 10 MB.</p>
<p>2. El informe queda vinculado a la cita y a la cédula, y aparece en el visor de resultados.</p>
<p>3. Un archivo dañado o una cédula inexistente se rechazan con un mensaje.</p></td>
</tr>
<tr class="odd">
<td>HU-11</td>
<td><p>1. Se pueden definir días laborales, hora de apertura, hora de cierre y duración de turno entre 30 y 45 minutos.</p>
<p>2. La hora de cierre debe ser mayor que la de apertura.</p>
<p>3. Los cambios se reflejan de inmediato en el calendario sin alterar las citas existentes.</p></td>
</tr>
<tr class="even">
<td>HU-12</td>
<td><p>1. Con cédula y código válidos, una cita Confirmada puede cancelarse o reprogramarse.</p>
<p>2. Al reprogramar se conserva el código y se envía por correo el nuevo horario.</p>
<p>3. Una cita Atendida, No asistió o Cancelada no puede modificarse.</p></td>
</tr>
</tbody>
</table>

# Fase 1 – 6. Product Backlog Inicial

Lista priorizada de 14 funciones, agrupadas en 5 épicos, con justificación individual de la prioridad asignada y trazabilidad explícita a la historia de usuario de origen. La prioridad usa la nomenclatura MoSCoW: Must (antes Alta), Should (antes Media) y Could (antes Baja).

## 6.1 Épicos

**Tabla 18:** *Épicos del producto.*

| **ID** | **Épico**                  | **Descripción**                                                                            | **Ítems del backlog**             |
|--------|----------------------------|--------------------------------------------------------------------------------------------|-----------------------------------|
| EP-01  | Portal Público             | Herramientas abiertas al público que atraen a la paciente hacia el agendamiento.           | PB-01                             |
| EP-02  | Agendamiento               | Disponibilidad, reserva, código único, confirmación y cancelación/reprogramación de citas. | PB-02, PB-03, PB-05, PB-13, PB-14 |
| EP-03  | Triaje clínico             | Formulario de pre-triaje por servicio y consulta del triaje por la médica.                 | PB-04, PB-09                      |
| EP-04  | Resultados                 | Carga de informes por recepción y consulta segura por la paciente.                         | PB-06, PB-10                      |
| EP-05  | Administración y Seguridad | Acceso al panel, agenda diaria, configuración de horarios y cumplimiento de la Ley 787.    | PB-07, PB-08, PB-11, PB-12        |

## 6.2 Backlog priorizado (MoSCoW)

**Tabla 19:** *Product Backlog priorizado.*

| **ID** | **Épico** | **Historia / Función**                                            | **Prioridad** | **Justificación**                                                                                                                  |
|--------|-----------|-------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------------------------------------------------------|
| PB-01  | EP-01     | Calculadora obstétrica (FPP)                                      | Must          | Función pública sin backend complejo; es la puerta de entrada y el principal gancho de captación (HU-01).                          |
| PB-02  | EP-02     | Motor de disponibilidad y calendario del especialista             | Must          | Base de la que depende todo el módulo de agendamiento (HU-02).                                                                     |
| PB-03  | EP-02     | Agendamiento con generación de código único de cita               | Must          | Función central del sistema; sin ella no hay reserva ni trazabilidad de citas (HU-03, HU-05).                                      |
| PB-04  | EP-03     | Formulario dinámico de pre-triaje por servicio                    | Must          | Diferenciador clínico del sistema; evita reconsultas por falta de preparación (HU-04).                                             |
| PB-05  | EP-02     | Envío automático de confirmación por correo                       | Must          | Reduce inasistencias y refuerza la entrega de indicaciones (HU-05).                                                                |
| PB-06  | EP-04     | Visor seguro de resultados (cédula + código)                      | Must          | Elimina la entrega física de resultados, uno de los tres problemas raíz identificados (HU-06).                                     |
| PB-07  | EP-05     | Autenticación y panel administrativo                              | Must          | Requisito de seguridad previo a habilitar cualquier función del backoffice (HU-07).                                                |
| PB-08  | EP-05     | Gestión de agenda diaria con estados de cita (incluye No asistió) | Must          | Soporta la operación diaria del consultorio y registra la inasistencia que PB-05 busca reducir (HU-08).                            |
| PB-09  | EP-03     | Ficha rápida de triaje en el panel médico                         | Should        | Mejora la atención, pero no bloquea un primer entregable funcional (HU-09).                                                        |
| PB-10  | EP-04     | Carga de informes PDF vinculados a cédula                         | Must          | Habilita directamente el visor de resultados de PB-06 (HU-10).                                                                     |
| PB-11  | EP-05     | Configuración de disponibilidad/horarios del especialista         | Should        | Necesaria, pero al inicio puede parametrizarse manualmente en la base de datos (HU-11).                                            |
| PB-12  | EP-05     | Cifrado y mecanismos de cumplimiento Ley 787                      | Must          | Requisito legal transversal a todo dato de salud; no negociable (RNF-06, RNF-10).                                                  |
| PB-13  | EP-02     | Notificación complementaria por WhatsApp                          | Could         | Mejora de experiencia; el correo electrónico ya cubre la necesidad mínima (HU-05).                                                 |
| PB-14  | EP-02     | Cancelación y reprogramación de citas (paciente y recepción)      | Must          | Los choques de horario son un problema raíz; sin cancelar o reprogramar, los turnos quedan bloqueados y se pierden (HU-08, HU-12). |

## 6.3 Trazabilidad Épico → Historia → Requerimiento → Caso de uso

La tabla consolida en una sola vista cómo cada épico se descompone hasta los casos de uso de la Fase 2.

**Tabla 20:** *Trazabilidad Épico → HU → RF → CU.*

| **Épico**                        | **Historias de usuario**   | **Ítems del backlog**             | **Requerimientos**                                               | **Casos de uso (Fase 2)**                |
|----------------------------------|----------------------------|-----------------------------------|------------------------------------------------------------------|------------------------------------------|
| EP-01 Portal Público             | HU-01                      | PB-01                             | RF-01, RF-02; RNF-01, RNF-07                                     | CU-01                                    |
| EP-02 Agendamiento               | HU-02, HU-03, HU-05, HU-12 | PB-02, PB-03, PB-05, PB-13, PB-14 | RF-03, RF-04, RF-05, RF-07, RF-14, RF-15; RNF-02, RNF-08, RNF-09 | CU-02, CU-03, CU-05, CU-06, CU-07, CU-08 |
| EP-03 Triaje clínico             | HU-04, HU-09               | PB-04, PB-09                      | RF-06, RF-11; RNF-10                                             | CU-04, CU-14                             |
| EP-04 Resultados                 | HU-06, HU-10               | PB-06, PB-10                      | RF-08, RF-12; RNF-04, RNF-10                                     | CU-08, CU-09, CU-15                      |
| EP-05 Administración y Seguridad | HU-07, HU-08, HU-11        | PB-07, PB-08, PB-11, PB-12        | RF-09, RF-10, RF-13, RF-16, RF-17; RNF-03, RNF-05, RNF-06        | CU-10, CU-11, CU-12, CU-13, CU-16        |

# Fase 1 – 7. Matriz de Requerimientos

Prioridad según MoSCoW (Must / Should / Could). La columna Origen indica el stakeholder que requiere el requisito; la columna Tipo declara su clasificación. Las secciones 7.1 y 7.2 detallan cada requerimiento con su criterio de verificación, y la sección 7.3 los consolida en una matriz única.

## 7.1 Requerimientos Funcionales (RF)

**Tabla 21:** *Requerimientos funcionales.*

| **ID** | **Descripción**                                                                                                   | **Tipo**  | **Origen**            | **HU origen** | **Prioridad** | **Criterio de verificación**                                                                                  |
|--------|-------------------------------------------------------------------------------------------------------------------|-----------|-----------------------|---------------|---------------|---------------------------------------------------------------------------------------------------------------|
| RF-01  | Calcular la FPP aplicando la Regla de Naegele (+7 días, −3 meses, +1 año) a partir de la FUM.                     | Funcional | Paciente              | HU-01         | Must          | El resultado coincide con el cálculo manual en el 100 % de 20 casos de prueba.                                |
| RF-02  | Mostrar semanas y días de gestación actuales y estudios sugeridos según trimestre.                                | Funcional | Paciente              | HU-01         | Must          | Se lista al menos 1 estudio sugerido por cada uno de los 3 trimestres.                                        |
| RF-03  | Mostrar los horarios disponibles del especialista en bloques configurables (30–45 min).                           | Funcional | Paciente, Dra. Rueda  | HU-02         | Must          | Los turnos ya ocupados no aparecen como seleccionables.                                                       |
| RF-04  | Permitir reservar un turno ingresando cédula, nombres, teléfono y correo.                                         | Funcional | Paciente, Recepción   | HU-03         | Must          | El formulario no se envía si algún campo obligatorio está vacío.                                              |
| RF-05  | Generar un código único alfanumérico de cita (formato CR-#####) al confirmar la reserva.                          | Funcional | Recepción             | HU-03, HU-05  | Must          | El código generado nunca se repite (restricción UNIQUE verificada en BD).                                     |
| RF-06  | Presentar un formulario de pre-triaje dinámico según el servicio seleccionado.                                    | Funcional | Dra. Rueda            | HU-04         | Must          | Cada servicio muestra su propio conjunto de preguntas configurado.                                            |
| RF-07  | Enviar automáticamente por correo el comprobante de cita e indicaciones previas.                                  | Funcional | Paciente              | HU-05         | Must          | El correo llega en menos de 2 minutos tras confirmar la cita.                                                 |
| RF-08  | Permitir consultar y descargar resultados ingresando cédula y código de cita.                                     | Funcional | Paciente              | HU-06         | Must          | Acceso denegado si alguno de los dos datos no coincide con el registro.                                       |
| RF-09  | Autenticar de forma segura a los usuarios administrativos (médica/recepción).                                     | Funcional | Dra. Rueda, Recepción | HU-07         | Must          | La cuenta se bloquea temporalmente tras 5 intentos fallidos consecutivos.                                     |
| RF-10  | Mostrar la agenda diaria de citas con estado (Confirmada, En Espera, Atendida, No asistió, Cancelada).            | Funcional | Recepción             | HU-08         | Must          | Los 5 estados posibles se reflejan correctamente al actualizarlos.                                            |
| RF-11  | Permitir visualizar con un clic las respuestas de triaje de una paciente.                                         | Funcional | Dra. Rueda            | HU-09         | Should        | El modal de triaje carga en menos de 3 segundos.                                                              |
| RF-12  | Permitir subir archivos PDF de resultados vinculados a la cédula de la paciente.                                  | Funcional | Recepción             | HU-10         | Must          | Solo se aceptan archivos con extensión .pdf de hasta 10 MB.                                                   |
| RF-13  | Permitir configurar días laborales, horario y duración estándar de los turnos.                                    | Funcional | Dra. Rueda            | HU-11         | Should        | Los cambios se reflejan de inmediato en el calendario público.                                                |
| RF-14  | Permitir a la paciente cancelar su cita ingresando cédula y código de cita.                                       | Funcional | Paciente              | HU-12         | Must          | La cita pasa a Cancelada y el turno vuelve a aparecer disponible; se rechaza si cédula y código no coinciden. |
| RF-15  | Permitir a la paciente reprogramar su cita a otro turno disponible conservando su código.                         | Funcional | Paciente              | HU-12         | Must          | La cita conserva su código CR-#####, el turno anterior queda libre y se envía correo con el nuevo horario.    |
| RF-16  | Permitir a la recepcionista cancelar o reprogramar una cita desde la agenda diaria a pedido de la paciente.       | Funcional | Recepción             | HU-08         | Must          | El cambio se refleja de inmediato en la agenda y en el calendario público de turnos.                          |
| RF-17  | Permitir actualizar el estado de la cita: la recepción registra En Espera y No asistió; la médica marca Atendida. | Funcional | Recepción, Dra. Rueda | HU-08         | Must          | Cada cambio de estado queda registrado con fecha, hora y usuario que lo realizó.                              |

## 7.2 Requerimientos No Funcionales (RNF) — clasificados con FURPS+

**Tabla 22:** *Requerimientos no funcionales (FURPS+).*

| **ID** | **Descripción**                                                                                                                                           | **Tipo**        | **Origen** | **HU origen**       | **Prioridad** | **Criterio de verificación**                                                                 |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------|------------|---------------------|---------------|----------------------------------------------------------------------------------------------|
| RNF-01 | El cálculo de la FPP debe mostrarse en menos de 2 segundos tras enviar el formulario.                                                                     | Rendimiento     | Paciente   | HU-01               | Must          | Prueba de carga: 20 solicitudes concurrentes, tiempo de respuesta promedio \< 2 s.           |
| RNF-02 | El proceso de agendamiento debe completarse en máximo 4 pasos y 3 minutos para un usuario sin experiencia previa.                                         | Usabilidad      | Paciente   | HU-03               | Must          | Prueba con 5 usuarios reales; se registra el tiempo promedio de finalización.                |
| RNF-03 | Las contraseñas del panel administrativo deben cifrarse con bcrypt (factor de costo ≥ 10).                                                                | Seguridad       | Ley 787    | HU-07               | Must          | Revisión de base de datos: ninguna contraseña almacenada en texto plano.                     |
| RNF-04 | Todo el tráfico entre cliente y servidor debe viajar cifrado bajo HTTPS/TLS 1.2 o superior.                                                               | Seguridad       | Ley 787    | HU-06               | Must          | Certificado SSL válido; calificación mínima A en un análisis tipo SSL Labs.                  |
| RNF-05 | El sistema debe estar disponible el 99 % del tiempo mensual (máx. 7.3 h de caída al mes).                                                                 | Disponibilidad  | Dra. Rueda | HU-02               | Should        | Monitoreo de uptime durante 30 días consecutivos.                                            |
| RNF-06 | El sistema debe cumplir con la Ley 787 de Protección de Datos Personales, incluyendo consentimiento informado explícito antes de capturar datos de salud. | Soporte / Legal | Ley 787    | Transversal         | Must          | Checklist legal firmado: casilla de consentimiento presente antes de guardar cualquier dato. |
| RNF-07 | El portal público debe visualizarse correctamente en las 2 últimas versiones de Chrome, Firefox y Safari, desde 360 px de ancho.                          | Compatibilidad  | Paciente   | HU-01, HU-02, HU-03 | Should        | Pruebas manuales en 3 navegadores y al menos 2 tamaños de pantalla.                          |
| RNF-08 | La base de datos debe soportar al menos 500 citas mensuales sin degradación perceptible de rendimiento.                                                   | Escalabilidad   | Dra. Rueda | HU-03               | Could         | Prueba de carga con 500 registros simulados; tiempos de respuesta estables.                  |
| RNF-09 | El código de cita generado debe ser breve y fácil de comunicar verbalmente (máximo 8 caracteres alfanuméricos).                                           | Usabilidad      | Recepción  | HU-05               | Should        | Verificación de formato: CR-##### (8 caracteres en total).                                   |
| RNF-10 | Los datos sensibles de salud (respuestas de triaje e informes) deben almacenarse cifrados en reposo con AES-256.                                          | Seguridad       | Ley 787    | Transversal         | Must          | Verificación técnica: los campos se almacenan cifrados (AES-256), nunca en texto plano.      |

## 7.3 Matriz de trazabilidad unificada (RF, RNF, HU, prioridad y origen)

La matriz integra en una sola tabla cada requerimiento funcional con los requerimientos no funcionales que lo condicionan, la historia de usuario que lo origina, su prioridad y su origen. Cada RNF aparece al menos una vez; los RNF transversales (RNF-04, RNF-05 y RNF-06) aplican además a todo el sistema.

**Tabla 23:** *Matriz de trazabilidad unificada.*

| **ID** | **Requerimiento funcional**                  | **RNF asociados**                      | **HU**       | **Prioridad** | **Origen**            |
|--------|----------------------------------------------|----------------------------------------|--------------|---------------|-----------------------|
| TR-01  | RF-01 Calcular la FPP                        | RNF-01, RNF-07                         | HU-01        | Must          | Paciente              |
| TR-02  | RF-02 Semanas, días y estudios sugeridos     | RNF-01, RNF-07                         | HU-01        | Must          | Paciente              |
| TR-03  | RF-03 Mostrar horarios disponibles           | RNF-02, RNF-05, RNF-07                 | HU-02        | Must          | Paciente, Dra. Rueda  |
| TR-04  | RF-04 Reservar un turno                      | RNF-02, RNF-04, RNF-06, RNF-07, RNF-08 | HU-03        | Must          | Paciente, Recepción   |
| TR-05  | RF-05 Generar código único de cita           | RNF-09                                 | HU-03, HU-05 | Must          | Recepción             |
| TR-06  | RF-06 Pre-triaje dinámico                    | RNF-02, RNF-04, RNF-06, RNF-10         | HU-04        | Must          | Dra. Rueda            |
| TR-07  | RF-07 Enviar comprobante e indicaciones      | RNF-05                                 | HU-05        | Must          | Paciente              |
| TR-08  | RF-08 Consultar y descargar resultados       | RNF-04, RNF-05, RNF-07, RNF-10         | HU-06        | Must          | Paciente              |
| TR-09  | RF-09 Autenticar usuarios administrativos    | RNF-03, RNF-04                         | HU-07        | Must          | Dra. Rueda, Recepción |
| TR-10  | RF-10 Agenda diaria con estados              | RNF-05, RNF-08                         | HU-08        | Must          | Recepción             |
| TR-11  | RF-11 Ver el triaje de una paciente          | RNF-04, RNF-10                         | HU-09        | Should        | Dra. Rueda            |
| TR-12  | RF-12 Subir informes PDF                     | RNF-04, RNF-10                         | HU-10        | Must          | Recepción             |
| TR-13  | RF-13 Configurar la disponibilidad           | RNF-05                                 | HU-11        | Should        | Dra. Rueda            |
| TR-14  | RF-14 Cancelar una cita (paciente)           | RNF-04, RNF-07                         | HU-12        | Must          | Paciente              |
| TR-15  | RF-15 Reprogramar una cita (paciente)        | RNF-04, RNF-07                         | HU-12        | Must          | Paciente              |
| TR-16  | RF-16 Cancelar o reprogramar desde recepción | RNF-04, RNF-05                         | HU-08        | Must          | Recepción             |
| TR-17  | RF-17 Actualizar el estado de una cita       | RNF-04                                 | HU-08        | Must          | Recepción, Dra. Rueda |
