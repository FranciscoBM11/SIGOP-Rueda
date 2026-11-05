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

### `POST /api/v1/citas/acceso` (CU-08)

Valida que la cédula y el código correspondan a la misma cita (RN-04) y entrega un **token de cita** para cancelarla o reprogramarla. Se usa en P4 «Mi cita».

- **Acceso:** pública. Límite: 20 peticiones por minuto por IP y, además, bloqueo por cédula (RN-15). `Cache-Control: no-store`.
- **Entrada (`accesoCitaSchema`, no admite campos adicionales):** `{ "cedula": "001-150390-0012K", "codigo": "CR-04821" }` (ER-01 y ER-05; ambos se normalizan a mayúsculas). Un formato inválido responde 400 **sin buscar la cita ni contar el intento** (CU-08, E1).
- **Bloqueo (RN-15):** se cuentan los intentos fallidos de esa cédula en los últimos 15 minutos que sean posteriores a su último acceso exitoso (un acceso correcto reinicia la cuenta). El 5.º fallo ya responde `ACCESO_BLOQUEADO`. Mientras haya 5 fallidos en la ventana no se busca la cita, aunque los datos sean correctos. El acceso se libera cuando el 5.º fallido más reciente cumple 15 minutos. Cada intento (exitoso o fallido) se guarda en `intentos_acceso` con la IP como HMAC-SHA256, nunca en claro.
- **Respuesta 200:**

  ```json
  {
    "cita": {
      "codigo": "CR-04821", "estado": "CONFIRMADA", "servicioId": 2, "servicio": "Control Prenatal",
      "paciente": "María José López", "fecha": "2026-11-09", "horaInicio": "09:30", "horaFin": "10:00"
    },
    "tokenCita": "eyJhbGciOiJIUzI1NiIs..."
  }
  ```

  Sin cédula, correo, teléfono, triaje ni identificadores internos. `servicioId` sirve para consultar `GET /turnos` al reprogramar.
- **Token de cita:** JWT HS256 firmado con `SECRETO_SESION`, audiencia `cita` (no sirve como sesión del personal), válido **15 minutos** y solo para esa cita. Contiene únicamente el id interno y el código de la cita. El navegador lo guarda solo en memoria y lo envía como `Authorization: Bearer <tokenCita>`.
- **Errores:**

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 400 | `DATOS_INVALIDOS` | Cédula o código con formato inválido, o campos no declarados. No cuenta como intento. |
  | 401 | `ACCESO_DENEGADO` | La cédula y el código no corresponden a una cita. Mensaje genérico, sin decir cuál dato falló (E2). Cuenta como intento fallido. |
  | 409 | `CITA_NO_MODIFICABLE` | Los datos coinciden, pero la cita no está `CONFIRMADA` (cancelada, en espera, atendida o no asistió) o su hora ya pasó. El mensaje explica el motivo. No se entrega token; el intento cuenta como exitoso. |
  | 429 | `ACCESO_BLOQUEADO` | 5 intentos fallidos consecutivos con esa cédula en 15 minutos. El mensaje indica los minutos de espera. |
  | 429 | `DEMASIADAS_PETICIONES` | Más de 20 peticiones por minuto desde la misma IP. |

### Errores comunes de las rutas con token de cita

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 401 | `TOKEN_REQUERIDO` | Falta la cabecera `Authorization: Bearer ...`. |
| 401 | `TOKEN_INVALIDO` | El token venció (15 min), fue alterado o no es un token de cita. La interfaz vuelve a pedir cédula y código. |
| 403 | `TOKEN_NO_CORRESPONDE` | El token es de otra cita distinta de la del `:codigo` de la ruta. |
| 404 | `CITA_NO_ENCONTRADA` | La cita del token ya no existe. |
| 409 | `CITA_NO_MODIFICABLE` | La cita ya no está `CONFIRMADA` o su hora ya pasó (CU-06 y CU-07, E2). |

### `POST /api/v1/citas/:codigo/cancelacion` (CU-06)

Cancela la cita: `CONFIRMADA` → `CANCELADA` (RN-06, estado final) y registra el cambio en `cambios_estado_cita` con origen `PACIENTE`. El turno queda libre de inmediato (RN-07), porque la disponibilidad solo cuenta las citas no canceladas. No envía correo.

- **Acceso:** token de cita de esa misma cita. Límite: 20 peticiones por minuto por IP. `Cache-Control: no-store`.
- **Entrada:** ninguna (sin cuerpo).
- **Respuesta 200:** `{ "cita": { ...misma forma que en /citas/acceso, con "estado": "CANCELADA" } }`.
- **Errores:** los comunes de las rutas con token de cita y 429 `DEMASIADAS_PETICIONES`.

### `PATCH /api/v1/citas/:codigo` (CU-07)

Reprograma la cita a otro turno libre, **conservando su código**. Todo en una transacción: bloquea la cita, reserva el turno nuevo con las mismas reglas que al agendar (RN-01, turno habilitado, no pasado, hasta 90 días), cambia `turno_id`, suma 1 a `reprogramaciones`, registra el cambio `CONFIRMADA` → `CONFIRMADA` (RN-06) y deja la notificación `REPROGRAMACION` `PENDIENTE`. El turno anterior queda libre (RN-07). Después del commit envía el correo con el nuevo horario; si falla, el cambio se mantiene y la notificación queda `FALLIDA`.

- **Acceso:** token de cita de esa misma cita. Límite: 20 peticiones por minuto por IP. `Cache-Control: no-store`.
- **Entrada (`reprogramarCitaSchema`):** `{ "turnoId": 41 }`. El servicio no cambia.
- **Sin límites por ahora:** no hay anticipación mínima ni máximo de reprogramaciones (Fase 2, parámetros «por definir»). La única condición es que la hora de la cita actual no haya empezado.
- **Respuesta 200:**

  ```json
  {
    "codigo": "CR-04821", "servicio": "Control Prenatal",
    "nuevoHorario": { "fecha": "2026-11-12", "horaInicio": "08:00", "horaFin": "08:40" },
    "indicaciones": "Traer carné prenatal.", "correoEnviado": true
  }
  ```
- **Errores:** los comunes de las rutas con token de cita, y además:

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 400 | `DATOS_INVALIDOS` | `turnoId` no es un entero positivo o hay campos no declarados. |
  | 404 | `TURNO_NO_ENCONTRADO` | El turno no existe. |
  | 409 | `MISMO_TURNO` | El turno elegido ya es el de la cita. |
  | 409 | `TURNO_NO_DISPONIBLE` | El turno ya empezó, está deshabilitado o está a más de 90 días. |
  | 409 | `TURNO_OCUPADO` | Otra paciente lo reservó (RN-01, E4). La interfaz vuelve a mostrar los turnos. |
  | 429 | `DEMASIADAS_PETICIONES` | Más de 20 peticiones por minuto desde la misma IP. |

## Panel administrativo (Iteración 3)

### Sesión del personal

Las rutas `/admin` (salvo `POST /admin/sesion`) exigen la cookie de sesión. La cookie `sigop_sesion` es **HttpOnly**, **SameSite=Strict**, **Secure** en producción y solo viaja a `/api/v1/admin`. Contiene un JWT HS256 (audiencia `personal`, distinta del token de cita) que apunta a una fila de `sesiones`. La sesión **vence tras 30 minutos sin actividad** (cada petición la renueva) y como máximo a las 12 horas. Al cerrar sesión se revoca. El navegador nunca ve el token: la página pregunta quién está conectado con `GET /admin/sesion`. Todas las respuestas del panel llevan `Cache-Control: no-store`.

#### Errores comunes de las rutas con sesión

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 401 | `SESION_REQUERIDA` | No hay cookie de sesión. |
| 401 | `SESION_EXPIRADA` | La sesión venció por inactividad, fue cerrada, el usuario está inactivo o la cookie fue alterada. La respuesta borra la cookie; la interfaz vuelve al inicio de sesión. |
| 403 | `ROL_NO_AUTORIZADO` | El rol del usuario no tiene permiso para la ruta o la acción (RN-11, RN-16). |
| 400 | `DATOS_INVALIDOS` | `:codigo` no cumple ER-05, o el cuerpo/la query no cumplen el esquema. |
| 404 | `CITA_NO_ENCONTRADA` | No existe una cita con ese código. |

### `POST /api/v1/admin/sesion` (CU-10)

Inicia sesión. Compara la contraseña con su hash bcrypt (RNF-03). Si el usuario no existe se compara igual contra un hash ficticio, para que el tiempo de respuesta no revele qué usuarios existen.

- **Acceso:** pública. Límite: 20 peticiones por minuto por IP y bloqueo por cuenta (RN-12).
- **Entrada (`iniciarSesionSchema`, no admite campos adicionales):** `{ "usuario": "dra.rueda", "contrasena": "Clinica2026" }`. El usuario se normaliza a minúsculas y debe cumplir ER-06; la contraseña, de 1 a 64 caracteres (no se le aplica ER-07 al ingresar).
- **Bloqueo (RN-12):** cada fallo suma 1 a `intentos_fallidos`. El 5.º fallo consecutivo bloquea la cuenta 15 minutos (`bloqueado_hasta`) y ya responde `CUENTA_BLOQUEADA`. Mientras dure el bloqueo no se valida la contraseña (CU-10 E3). Un ingreso correcto reinicia el contador; si el bloqueo ya venció, el siguiente fallo vuelve a contar desde 1.
- **Respuesta 200:** `{ "nombre": "Dra. Rueda", "rol": "MEDICO" }` y la cookie de sesión. `rol`: `MEDICO` o `RECEPCIONISTA`.
- **Errores:**

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 400 | `DATOS_INVALIDOS` | Falta el usuario o la contraseña, el usuario no cumple ER-06 o hay campos no declarados. No cuenta como intento. |
  | 401 | `CREDENCIALES_INVALIDAS` | Usuario inexistente o inactivo, o contraseña incorrecta. Mensaje genérico: «Usuario o contraseña incorrectos.» (CU-10 E1). |
  | 423 | `CUENTA_BLOQUEADA` | 5 intentos fallidos consecutivos. El mensaje indica los minutos de espera (E2, E3). |
  | 429 | `DEMASIADAS_PETICIONES` | Más de 20 peticiones por minuto desde la misma IP. |

### `GET /api/v1/admin/sesion`

Usuario conectado. Cada página del panel la consulta al cargar.

- **Acceso:** sesión (cualquier rol).
- **Respuesta 200:** `{ "nombre": "José Lira", "rol": "RECEPCIONISTA" }`.
- **Errores:** los comunes de las rutas con sesión.

### `DELETE /api/v1/admin/sesion` (CU-10 A1)

Cierra la sesión: revoca la fila de `sesiones` y borra la cookie. Responde **204** siempre, aunque la sesión ya hubiera vencido o no hubiera cookie.

### `GET /api/v1/admin/citas/agenda?fecha` (CU-11)

Citas de una fecha (incluidas las canceladas), ordenadas por hora.

- **Acceso:** sesión (médica y recepción).
- **Entrada (query):** `fecha` opcional (AAAA-MM-DD, ER-09); por defecto, hoy en Managua. No se aceptan otros parámetros.
- **Respuesta 200:** lista vacía si no hay citas (E1).

  ```json
  [
    {
      "codigo": "CR-04821", "estado": "CONFIRMADA",
      "fecha": "2026-11-09", "horaInicio": "10:00", "horaFin": "10:40",
      "paciente": "María José López", "cedula": "001-150390-0012K",
      "servicioId": 3, "servicio": "Control Prenatal",
      "transiciones": ["EN_ESPERA", "CANCELADA"],
      "puedeReprogramar": true,
      "tieneTriaje": true
    }
  ]
  ```

  - `transiciones`: estados a los que **este rol** puede llevar la cita **ahora** (igual que `GET /transiciones`).
  - `puedeReprogramar`: solo `true` para la recepción, con la cita `CONFIRMADA` y su hora sin empezar.
  - `tieneTriaje`: solo aparece para la médica (RN-16). La agenda nunca incluye respuestas del triaje.
  - Sin correo, teléfono ni identificadores internos.

### `GET /api/v1/admin/citas/:codigo/transiciones` (CU-12)

- **Acceso:** sesión (médica y recepción).
- **Respuesta 200:** `["EN_ESPERA", "NO_ASISTIO"]` (puede ser `[]`).
- **Reglas (RN-06, RN-11 y condiciones de tiempo):**

  | Rol | Desde | Hacia | Condición |
  |---|---|---|---|
  | Recepción | `CONFIRMADA` | `EN_ESPERA` | Solo el día de la cita. |
  | Recepción | `CONFIRMADA` | `NO_ASISTIO` | Solo cuando la hora de la cita ya empezó. |
  | Recepción | `CONFIRMADA` | `CANCELADA` | Solo mientras la hora de la cita no haya empezado. |
  | Médica | `EN_ESPERA` | `ATENDIDA` | Sin condición. |

  `ATENDIDA`, `NO_ASISTIO` y `CANCELADA` son finales.

### `PATCH /api/v1/admin/citas/:codigo/estado` (CU-12)

Cambia el estado. En una transacción bloquea la cita, valida transición, rol y tiempo, actualiza y registra el cambio en `cambios_estado_cita` con origen `PERSONAL` y el id del usuario (RF-17).

- **Acceso:** sesión (médica y recepción; el rol lo valida la máquina de estados).
- **Entrada (`cambiarEstadoSchema`):** `{ "estado": "EN_ESPERA" }`. Valores: `EN_ESPERA`, `ATENDIDA`, `NO_ASISTIO`, `CANCELADA` (cancelar por aquí equivale a `POST /cancelacion`, con las reglas de la tabla anterior).
- **Respuesta 200:** `{ "cita": { ...ítem de la agenda con el estado nuevo } }`.
- **Errores:** los comunes, y además:

  | HTTP | `codigo` | Cuándo |
  |---|---|---|
  | 403 | `TRANSICION_NO_PERMITIDA` | La transición no existe en RN-06 (p. ej. de Cancelada a En espera), es el mismo estado o no cumple la condición de tiempo. El mensaje explica el motivo (E1). |
  | 403 | `ROL_NO_AUTORIZADO` | El rol no puede hacer ese cambio (p. ej. la recepción marca Atendida) (E2, RN-11). |

### `POST /api/v1/admin/citas/:codigo/cancelacion` (CU-13)

Cancela a pedido de la paciente, sin cédula ni código. `CONFIRMADA` → `CANCELADA`; el turno queda libre de inmediato (RN-07). Registra el cambio con origen `PERSONAL` y el usuario. No envía correo.

- **Acceso:** sesión, **solo recepción**.
- **Entrada:** ninguna.
- **Respuesta 200:** `{ "cita": { ...ítem de la agenda, "estado": "CANCELADA" } }`.
- **Errores:** los comunes y 409 `CITA_NO_MODIFICABLE` (la cita no está Confirmada o su hora ya empezó, E1).

### `PATCH /api/v1/admin/citas/:codigo` (CU-13)

Reprograma a otro turno libre del mismo servicio, **conservando el código**. Mismas reglas y transacción que `PATCH /citas/:codigo` (CU-07): RN-01, turno habilitado, no pasado y hasta 90 días. Registra el cambio `CONFIRMADA` → `CONFIRMADA` con el usuario y el horario anterior y nuevo, suma 1 a `reprogramaciones` y envía el correo `REPROGRAMACION` después del commit. Los turnos se eligen con `GET /turnos`.

- **Acceso:** sesión, **solo recepción**.
- **Entrada (`reprogramarCitaSchema`):** `{ "turnoId": 41 }`.
- **Respuesta 200:** `{ "cita": { ...ítem de la agenda con el nuevo horario }, "correoEnviado": true }`.
- **Errores:** los comunes, 409 `CITA_NO_MODIFICABLE`, 404 `TURNO_NO_ENCONTRADO`, 409 `MISMO_TURNO`, 409 `TURNO_NO_DISPONIBLE` y 409 `TURNO_OCUPADO` (E2: la interfaz vuelve a mostrar los turnos).

### `GET /api/v1/admin/citas/:codigo/triaje` (CU-14)

Ficha de triaje de la cita, con las respuestas descifradas (RN-14) en el orden del cuestionario. Incluye las respuestas a preguntas que después se desactivaron. Cada consulta queda en el registro del servidor (`triaje_consultado`) solo con el id del usuario y de la cita.

- **Acceso:** sesión, **solo la médica** (RN-16).
- **Respuesta 200:**

  ```json
  {
    "cita": { "...": "ítem de la agenda" },
    "fechaRegistro": "2026-11-05T15:00:00Z",
    "respuestas": [
      { "pregunta": "Fecha de su última menstruación (FUM)", "tipo": "FECHA", "valor": "2026-03-02" },
      { "pregunta": "¿Presenta sangrado, dolor intenso o falta de movimiento fetal?", "tipo": "SI_NO", "valor": "NO" }
    ]
  }
  ```

  `fechaRegistro` en UTC. `valor` es `null` si una respuesta no se pudo descifrar (clave distinta o dato alterado); el error se registra sin el contenido.
- **Errores:** los comunes (403 `ROL_NO_AUTORIZADO` para la recepción, E2) y 404 `FICHA_NO_ENCONTRADA` (la cita no tiene ficha, E1).

### Páginas del panel

- `/admin/login.html` (A1) y `/admin/agenda.html` (A2, con la ficha de triaje A3 en un diálogo). `/admin` redirige a la agenda, y la agenda redirige al inicio de sesión si no hay sesión.
- **Citas de demostración:** `npm run db:citas-demo` crea citas ficticias para hoy (o el próximo día hábil) y el siguiente día hábil, con estados variados y triaje cifrado. Las pacientes tienen cédula `000-…` y correo `@ejemplo.com`. No se ejecuta en producción.
