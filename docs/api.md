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

### `POST /api/v1/calculadora/fpp` (CU-01)

Calcula la Fecha Probable de Parto con la Regla de Naegele (RN-13), las semanas y días de gestación, el trimestre y los estudios sugeridos. **No guarda nada.**

- **Acceso:** pública.
- **Entrada:** `{ "fum": "2026-07-30" }` (fecha de última menstruación, ER-09, debe existir en el calendario).
- **Respuesta 200:**

  ```json
  {
    "fpp": "2027-05-06", "semanas": 14, "dias": 0, "trimestre": 2,
    "estudios": [ { "nombre": "Ecografía morfológica", "descripcion": "..." } ]
  }
  ```

  Trimestre: 1 (0–13 semanas), 2 (14–27), 3 (28 o más). FPP = FUM + 7 días + 9 meses; si el día no existe en el mes destino se usa el último día del mes.
- **Errores:**

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 400 | `DATOS_INVALIDOS` | Falta `fum`, no tiene formato AAAA-MM-DD o la fecha no existe. |
  | 400 | `FUM_FUTURA` | La FUM es posterior a hoy (hora de Managua). |
  | 400 | `FUM_FUERA_DE_RANGO` | La FUM es anterior a 294 días (42 semanas). |

### `GET /api/v1/servicios` (CU-03)

- **Acceso:** pública.
- **Respuesta 200:** servicios activos.

  ```json
  [ { "id": 1, "nombre": "Papanicolaou", "indicaciones": "No tener relaciones sexuales..." } ]
  ```

### `GET /api/v1/servicios/:id/preguntas` (CU-04)

Cuestionario de pre-triaje del servicio, en su orden (RN-08). Solo preguntas activas.

- **Acceso:** pública.
- **Respuesta 200:**

  ```json
  [
    { "id": 1, "texto": "Fecha de su última menstruación", "tipo": "FECHA", "obligatoria": true, "opciones": [] },
    { "id": 3, "texto": "¿Usa algún método anticonceptivo?", "tipo": "SELECCION", "obligatoria": false,
      "opciones": [ { "id": 1, "etiqueta": "Ninguno" }, { "id": 2, "etiqueta": "Pastillas" } ] }
  ]
  ```

  `tipo`: `TEXTO`, `SI_NO`, `NUMERO`, `FECHA` o `SELECCION`.
- **Errores:** 400 `DATOS_INVALIDOS` (id no es un entero positivo); 404 `SERVICIO_NO_DISPONIBLE` (no existe o está inactivo).

### `GET /api/v1/turnos?servicioId&desde&hasta` (CU-02)

Turnos del rango con su disponibilidad. Antes de responder genera con `sp_generar_turnos` los turnos que falten en el rango según el horario laboral (RN-10); si la generación falla, responde con los turnos existentes y lo registra.

- **Acceso:** pública. `Cache-Control: no-store`.
- **Entrada (query):** `servicioId` (entero), `desde` y `hasta` (AAAA-MM-DD). No se aceptan otros parámetros.
- **Reglas:** `hasta` ≥ `desde`; como máximo 31 días por consulta; `hasta` no más de 90 días después de hoy. Si `desde` es anterior a hoy se toma hoy. Se omiten los turnos que ya empezaron (hora de Managua).
- **Respuesta 200:** ordenada por fecha y hora. `disponible: false` = el turno tiene una cita activa (RN-01); la interfaz lo muestra tachado. No incluye ningún dato de la cita.

  ```json
  [ { "id": 41, "fecha": "2026-11-09", "horaInicio": "08:00", "horaFin": "08:40", "disponible": true } ]
  ```
- **Errores:** 400 `DATOS_INVALIDOS`; 400 `RANGO_INVALIDO` (rango invertido, mayor de 31 días o más allá de 90 días); 404 `SERVICIO_NO_DISPONIBLE`.

### `POST /api/v1/citas` (CU-03, CU-04, CU-05)

Agenda una cita. En una sola transacción: bloquea y verifica el turno, registra o actualiza a la paciente por cédula (si ya existe se actualizan teléfono y correo), crea la cita en `CONFIRMADA` con código único `CR-#####` (RN-02), registra el cambio de estado inicial, guarda la ficha de triaje cifrada (RN-14) y deja la notificación `PENDIENTE`. Después del commit envía el correo de confirmación; si falla, la cita se mantiene y la notificación queda `FALLIDA` (E4).

- **Acceso:** pública. Límite: 20 peticiones por minuto por IP. `Cache-Control: no-store`.
- **Entrada (`crearCitaSchema`, no admite campos adicionales):**

  ```json
  {
    "servicioId": 1,
    "turnoId": 41,
    "paciente": {
      "cedula": "001-150390-0012K",
      "nombres": "María José López",
      "telefono": "88123456",
      "correo": "maria.lopez@gmail.com"
    },
    "consentimiento": true,
    "respuestas": [
      { "preguntaId": 1, "valor": "2026-10-01" },
      { "preguntaId": 2, "valor": "SI" },
      { "preguntaId": 3, "valor": "Pastillas" }
    ]
  }
  ```

  - `paciente`: ER-01 a ER-04. La cédula se normaliza a mayúsculas.
  - `consentimiento`: debe ser `true` (RN-05). Se registra la versión de la política vigente (`v1.0`).
  - `respuestas` (texto, máx. 500 caracteres cada una; opcional si el servicio no tiene preguntas): `SI_NO` → `"SI"` o `"NO"`; `NUMERO` → `"2"` o `"2.5"`; `FECHA` → `AAAA-MM-DD`; `SELECCION` → el texto exacto de la opción (se guarda el texto, no el id). Las preguntas opcionales se pueden omitir.
- **Respuesta 201:**

  ```json
  {
    "codigo": "CR-04821", "servicio": "Papanicolaou",
    "fecha": "2026-11-09", "horaInicio": "08:00", "horaFin": "08:40",
    "indicaciones": "No tener relaciones sexuales...", "correoEnviado": true
  }
  ```
- **Errores:**

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 400 | `DATOS_INVALIDOS` | Formato inválido, campos no declarados o consentimiento distinto de `true`. `detalles[].campo`: `paciente.cedula`, `consentimiento`, `respuestas.0.valor`, ... |
  | 400 | `TRIAJE_INVALIDO` | Falta una respuesta obligatoria, un valor no corresponde a su tipo, una pregunta no es del servicio o se repite. `detalles[].campo` = `respuestas.<preguntaId>`. |
  | 404 | `SERVICIO_NO_DISPONIBLE` | El servicio no existe o está inactivo. |
  | 404 | `TURNO_NO_ENCONTRADO` | El turno no existe. |
  | 409 | `TURNO_NO_DISPONIBLE` | El turno ya empezó o pasó, está deshabilitado o está a más de 90 días. |
  | 409 | `TURNO_OCUPADO` | Otra paciente reservó el turno (RN-01). La interfaz vuelve al paso 2 conservando los datos. |
  | 429 | `DEMASIADAS_PETICIONES` | Más de 20 peticiones por minuto desde la misma IP. |
  | 503 | `CODIGO_NO_GENERADO` | No se encontró un código libre tras 10 intentos (muy improbable). |

**Correo en desarrollo:** si `SMTP_HOST` está vacío (solo fuera de producción) se usa un canal simulado que no envía nada; la notificación queda `ENVIADA` y el registro muestra el evento `correo_simulado`.
