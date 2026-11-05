# Primer mensaje para Claude Code (Iteración 0)

Abre la carpeta `sigop-rueda` en Antigravity, inicia Claude Code y pega esto:

---

Vamos a construir SIGOP-Rueda siguiendo el diseño de `docs/`. Lee primero `CLAUDE.md`, y luego solo estas secciones de `docs/fase3-diseno.md`: 2 (arquitectura y stack), 3 (modelo de datos), 7 (despliegue) y 9 (plan de iteraciones). Los scripts de la base de datos ya existen en `database/`.

**Tarea: Iteración 0 – Base del proyecto.** Debe quedar:
- Proyecto Node.js + Express (JavaScript) con la estructura de la sección 2.6, `package.json` con `npm start`, `npm run dev` y `npm test`.
- `.env.example` documentado (conexión a SQL Server, CLAVE_CIFRADO, secreto de sesión, SMTP).
- Conexión a SQL Server con `mssql` (con reintento por si Azure SQL está pausado) y ayudante de transacciones.
- Helmet, manejador global de errores con el formato JSON de la sección 2.7 y `GET /api/v1/salud` (sin tocar la base).
- Archivos estáticos desde `public/` y una página `index.html` mínima.
- GitHub Actions que instale dependencias y ejecute las pruebas.

**Antes de escribir código, entra en modo plan** y dime: (1) el orden de pasos, (2) qué debo instalar o crear yo (Node LTS, SQL Server, SSMS, base SIGOP y cómo ejecutar los 3 scripts), y (3) cualquier punto del diseño ambiguo. No hagas commits. Espera mi confirmación.

---

## Antes de empezar (tú, en tu computadora)
1. Instala Node.js LTS y SQL Server (Express o Developer). Ya tienes SSMS 22.
2. En SSMS crea una base llamada `SIGOP` y ejecuta en orden `database/01_esquema.sql`, `02_datos_demo.sql` y `03_pruebas.sql` (debe mostrar OK en todas).
3. Habilita TCP/IP en SQL Server para que Node pueda conectarse (Claude Code te guía en la Iteración 0).

## Mensajes siguientes (uno por iteración)
1. **Iteración 1 – Agendar cita** (CU-01 a CU-05): catálogo, disponibilidad, pacientes, citas, triaje y correo; frontend P1–P3.
2. **Iteración 2 – Gestión de la paciente** (CU-06, 07, 08).
3. **Iteración 3 – Panel administrativo** (CU-10 a CU-14).
4. **Iteración 4 – Resultados y disponibilidad** (CU-09, 15, 16).
5. **Iteración 5 – Calidad y despliegue** (Render + Azure SQL + monitor + QR).

Fórmula para cada una: "Lee las secciones relevantes de `docs/`, propón un plan, espera mi OK, implementa con pruebas y no hagas commits."

## Cambios después de la primera versión
Pídelos directo ("cambia el color del botón de agendar", "agrega este campo al triaje"). Si afectan una tabla, ruta o regla, añade: "y actualiza el archivo correspondiente de `docs/`".
