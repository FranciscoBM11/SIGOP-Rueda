# API de SIGOP-Rueda

Documentación de las rutas implementadas. Se mantiene a partir de la Tabla 57 de `docs/fase3-diseno.md` (sección 5); cada ruta nueva se agrega aquí en el mismo cambio que la implementa.

## Convenciones

- **Prefijo:** todas las rutas cuelgan de `/api/v1`. Las del personal, de `/api/v1/admin`.
- **Formato:** JSON en UTF-8 (`Content-Type: application/json`). Cuerpo máximo: 100 kB (los PDF usan multipart, con su propio límite de 10 MB).
- **Datos personales:** nunca en la URL ni en la query string; la cédula viaja en el cuerpo.
- **Fechas:** ISO 8601 (`2026-11-09`, `09:30`), zona `America/Managua`.
- **Identificador de petición:** cada respuesta incluye la cabecera `X-Id-Peticion` (UUID), que también aparece en el registro del servidor. Sirve para rastrear un error reportado sin pedir datos personales.

## Formato de error

Todas las respuestas de error tienen la misma forma (Fase 3, sección 2.7):

```json
{ "codigo": "TURNO_OCUPADO", "mensaje": "El turno ya fue reservado. Elige otro.", "detalles": [] }
```

- `codigo`: identificador estable en MAYÚSCULAS para que el frontend decida qué mostrar.
- `mensaje`: texto en español listo para mostrar a la persona usuaria.
- `detalles`: lista (vacía si no aplica). En errores de validación: `[{ "campo": "cedula", "mensaje": "..." }]`.

Un error inesperado nunca expone el detalle técnico: responde `ERROR_INTERNO` y el detalle se guarda en el registro, sin datos personales.

### Códigos generales

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | El cuerpo o la query no cumplen el esquema (zod) o tienen campos no declarados. `detalles` indica cada campo. |
| 400 | `JSON_INVALIDO` | El cuerpo no es un JSON válido. |
| 404 | `RUTA_NO_ENCONTRADA` | La ruta de la API no existe. |
| 413 | `CUERPO_DEMASIADO_GRANDE` | El cuerpo JSON supera 100 kB. |
| 500 | `ERROR_INTERNO` | Error no previsto del servidor. |
| 503 | `BD_NO_DISPONIBLE` | No se pudo conectar con SQL Server tras 3 intentos (p. ej. Azure SQL tardó demasiado en despertar). Se puede reintentar. |

Los códigos de negocio de cada módulo (`TURNO_OCUPADO`, `CUENTA_BLOQUEADA`, …) se documentan junto a su ruta.

## Rutas

### `GET /api/v1/salud`

Comprobación de disponibilidad para UptimeRobot (RNF-05). **No consulta la base de datos**, para no despertar Azure SQL (Fase 3, sección 7.1).

- **Acceso:** pública.
- **Entrada:** ninguna.
- **Respuesta 200:**

  ```json
  { "estado": "ok" }
  ```

  Con `Cache-Control: no-store`.
- **Errores:** ninguno propio.
