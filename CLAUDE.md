# SIGOP-Rueda — instrucciones para Claude

Sistema de Información Gineco-Obstétrica y Pre-triaje de la Clínica Rueda (Ingeniería de Software I, UNI). Web simple: la paciente agenda/cancela/reprograma citas, completa un pre-triaje y consulta resultados en PDF; el personal (médica y recepción) gestiona la agenda en un panel.

## Fuente de verdad
El diseño está en `docs/`. **Lee solo la sección que necesites; no cargues todo el documento.**
- `docs/fase3-diseno.md` — arquitectura, stack, MER, clases, API, seguridad, despliegue gratuito, UI, plan de iteraciones (lo principal para construir).
- `docs/fase2-analisis.md` — casos de uso CU-01..16, reglas RN-01..16, diccionario de datos, expresiones regulares ER-01..10, SRS.
- `docs/fase1-estudio-preliminar.md` — historias de usuario, criterios de aceptación, RF/RNF.
- `database/` — `01_esquema.sql`, `02_datos_demo.sql`, `03_pruebas.sql` (SQL Server). Son la referencia del modelo de datos.
- Si propones algo distinto al diseño (otra tabla, ruta o librería), **detente y pregunta**.
- Nota: la Fase 1 menciona PostgreSQL, NestJS y VPS; **prevalece la Fase 3** (SQL Server, Express, hosting gratuito).

## Stack (no cambiar sin preguntar)
- Servidor: Node.js LTS + Express, **JavaScript** (sin TypeScript, sin ORM, sin Docker).
- Base de datos: **SQL Server** (paquete `mssql`, consultas parametrizadas, transacciones). Administrada con SSMS 22. En la nube: Azure SQL Database (oferta gratuita).
- Validación: `zod` + `src/common/validadores.js` (ER-01..ER-10).
- Seguridad: `bcryptjs` (costo 12), `jsonwebtoken` en cookie HttpOnly, `helmet`, `express-rate-limit`, AES-256-GCM con `node:crypto`.
- Correo: Nodemailer (interfaz `CanalNotificacion`). PDF: `multer` en memoria, guardados cifrados en `VARBINARY(MAX)`.
- Frontend: HTML5 + Tailwind CSS (CSS compilado) + JavaScript en módulos ES + FullCalendar (solo agenda). Sin framework ni empaquetador.
- Pruebas: Jest + Supertest. Publicación: Render + Azure SQL + UptimeRobot (ver sección 7 de la Fase 3).

## Estructura
Un solo proyecto: `src/` (server.js, app.js, config/, common/, modules/*), `public/` (páginas, css, js), `database/`, `docs/`, `tests/`. Ver sección 2.6 de la Fase 3.

## Convenciones
- Dominio en español sin tildes (`cedula`, `codigoMinsa`); clases PascalCase, funciones camelCase, tablas/columnas snake_case plural, archivos kebab-case con rol (`citas.service.js`).
- API bajo `/api/v1`, rutas del personal bajo `/admin`, sin datos personales en la URL.
- Fechas ISO 8601, zona `America/Managua`; en la base, auditoría en UTC (`DATETIME2`).
- Errores JSON: `{ "codigo": "...", "mensaje": "...", "detalles": [] }` con el HTTP correcto.
- Commits: Conventional Commits en español.
- `GET /api/v1/salud` NO consulta la base de datos (para no despertar Azure SQL).

## Reglas de trabajo
1. **Una tarea por vez** (una iteración o parte). Primero propón un plan breve y espera confirmación.
2. Una tarea termina cuando sus **pruebas pasan**. Cada regla RN tocada lleva prueba.
3. **No hagas commits ni push.** Los hace el integrante tras revisar.
4. Cambios de esquema: nuevo script SQL numerado en `database/` y actualizar el MER en `docs/`. Configuración variable solo en `.env` (mantén `.env.example`).
5. Documenta cada ruta nueva en `docs/api.md`.
6. Terminado = cumple criterios de aceptación, tiene pruebas, errores claros, funciona en móvil (desde 360 px) y escritorio, documentado.

## Seguridad y datos de salud (Ley 787)
- Triaje y PDF cifrados con AES-256-GCM; la clave vive en variable de entorno, nunca en el repositorio.
- Límite de intentos en el acceso público (5 en 15 min por cédula; 20 peticiones/min por IP).
- Sin datos personales en logs ni URL; IP guardadas como hash. La recepción no ve el triaje.
- **En desarrollo, pruebas y demos usa solo datos de `02_datos_demo.sql`. Nunca datos reales.**
- Usuarios de demo: `dra.rueda` / `Clinica2026` (médica), `recepcion.lira` / `Recepcion2026` (recepción).

## Mantener el diseño vivo
Si una decisión cambia durante la construcción, actualiza el archivo correspondiente de `docs/` en el mismo cambio y avísalo al final de la tarea.
