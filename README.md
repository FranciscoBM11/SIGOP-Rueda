# SIGOP-Rueda

Sistema web de agendamiento de citas, pretriaje y entrega de resultados de la clínica de la Dra. Rueda (proyecto del curso Ingeniería de Software I, UNI).

- Diseño completo: `docs/fase1-estudio-preliminar.md`, `docs/fase2-analisis.md`, `docs/fase3-diseno.md`.
- API: `docs/api.md`.
- Construcción con Claude Code: ver `CLAUDE.md` y `PROMPT_INICIAL.md`.
- Diagramas editables (Graphviz): `docs/diagramas/*.dot`.

Solo datos de demostración; nunca datos reales de pacientes (Ley 787).

## Requisitos

- Node.js 24 LTS o superior (`node -v`).
- SQL Server 2019+ (Express o Developer) y SSMS 22.

## 1. Preparar SQL Server (una sola vez)

1. **Autenticación mixta:** en SSMS, clic derecho en el servidor → Propiedades → Seguridad → *Modo de autenticación de SQL Server y Windows*. Reinicia el servicio de SQL Server. (El paquete `mssql` se conecta con un login de SQL Server, no con la cuenta de Windows.)
2. **TCP/IP:** en *SQL Server Configuration Manager* → Configuración de red → Protocolos → habilita **TCP/IP** y reinicia el servicio. Si tu instancia tiene nombre (p. ej. `SQLEXPRESS`), haz una de dos cosas:
   - fija el puerto 1433 (TCP/IP → Direcciones → IPAll → *Puerto TCP* = 1433, *Puertos dinámicos* vacío), o
   - inicia el servicio **SQL Server Browser** y pon `DB_INSTANCIA=SQLEXPRESS` en el `.env`.
3. **Base de datos:** crea una base vacía `SIGOP` y ejecuta en orden `database/01_esquema.sql`, `02_datos_demo.sql` y `03_pruebas.sql` (todas las comprobaciones deben decir OK).
4. **Login de la aplicación** (cambia la contraseña):

   ```sql
   CREATE LOGIN sigop_app WITH PASSWORD = 'Una-clave-larga-2026!';
   USE SIGOP;
   CREATE USER sigop_app FOR LOGIN sigop_app;
   ALTER ROLE db_datareader ADD MEMBER sigop_app;
   ALTER ROLE db_datawriter ADD MEMBER sigop_app;
   GRANT EXECUTE TO sigop_app;   -- para sp_generar_turnos
   ```

## 2. Configurar y ejecutar

```bash
npm install
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
# Genera CLAVE_CIFRADO y SECRETO_SESION y pégalos en .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:verificar        # comprueba conexión y datos de demostración
npm run dev                 # servidor con recarga automática en http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servidor (producción / Render). |
| `npm run dev` | Inicia el servidor y lo reinicia al guardar cambios. |
| `npm test` | Ejecuta las pruebas (Jest + Supertest). No necesita base de datos. |
| `npm run test:bd` | Pruebas de integración contra la base SIGOP local (usa el `.env`). Crean y borran pacientes ficticias con cédulas `999-010100-000xZ`. No corren en la CI. |
| `npm run css` | Compila Tailwind: `public/css/tailwind.css` → `public/css/app.css`. |
| `npm run css:watch` | Igual, recompilando al guardar. |
| `npm run db:verificar` | Conecta a SQL Server y cuenta las filas de los datos de demostración. |

`public/css/app.css` es un archivo generado pero **se sube al repositorio**, para que Render solo tenga que ejecutar `npm install` y `npm start`. Después de cambiar clases en el HTML ejecuta `npm run css`.

Comprobación rápida: abre http://localhost:3000/api/v1/salud → `{"estado":"ok"}`.

Agendar de punta a punta: abre http://localhost:3000/agendar.html. Sin SMTP configurado el correo no se envía (canal simulado) y el comprobante se muestra en pantalla igualmente. El usuario `sigop_app` necesita `GRANT EXECUTE` (paso 4) para que la consulta de turnos genere los días que falten.

## Usuarios de demostración

- Médica: `dra.rueda` / `Clinica2026`
- Recepción: `recepcion.lira` / `Recepcion2026`
