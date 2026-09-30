# API de Postulaciones

API REST para gestionar postulaciones de candidatos a vacantes. Cada postulación recibe automáticamente un puntaje y una prioridad para que los reclutadores atiendan primero los perfiles más afines.

Stack: Node.js, Express 5, MySQL 8 (mysql2/promise), Jest, Supertest, dotenv.

## Requisitos

- Node.js 18 o superior (probado con Node 22)
- Docker, para levantar MySQL 8
- npm

## Instalación

```bash
npm install
```

## Levantar MySQL con Docker

El contenedor se llama `mysql-postulaciones` y expone MySQL en el puerto **3307** del host (3306 dentro del contenedor), para no chocar con un MySQL local.

```bash
docker run --name mysql-postulaciones \
  -e MYSQL_ROOT_PASSWORD=root_password \
  -e MYSQL_DATABASE=applications_db \
  -e MYSQL_USER=app_user \
  -e MYSQL_PASSWORD=app_password \
  -p 3307:3306 \
  -d mysql:8.0
```

Espera a que termine de inicializar. En los logs debe aparecer `ready for connections` con `port: 3306`:

```bash
docker logs -f mysql-postulaciones
```

Carga el esquema y los datos de prueba:

```bash
docker exec -i mysql-postulaciones mysql -uroot -proot_password < db/database.sql
```

En PowerShell la redirección `<` no funciona. Usa en su lugar:

```powershell
docker cp db/database.sql mysql-postulaciones:/tmp/database.sql
docker exec mysql-postulaciones sh -c "mysql -uroot -proot_password < /tmp/database.sql"
```

El script es re-ejecutable: borra y recrea las tablas. Los datos de prueba usan fechas relativas a `NOW()` (por ejemplo, "rechazado hace 10 días"), así que conviene recargarlo antes de probar a mano.

Si el contenedor ya existe, basta con `docker start mysql-postulaciones`.

## Configuración (.env)

```bash
cp .env.example .env
```

| Variable | Valor para el contenedor de arriba | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto de la API (3000 si se deja vacío) |
| `DB_HOST` | `127.0.0.1` | Host de MySQL |
| `DB_PORT` | `3307` | Puerto publicado por Docker |
| `DB_USER` | `app_user` | Usuario de la aplicación |
| `DB_PASSWORD` | `app_password` | Contraseña (puede estar vacía) |
| `DB_NAME` | `applications_db` | Base de datos |

`.env` está en `.gitignore`; nunca se versiona.

## Ejecución

```bash
npm start      # produccion
npm run dev    # desarrollo, reinicia con nodemon al guardar
```

Al arrancar, la API verifica la conexión a MySQL y termina con código 1 si falla. Comprobación rápida:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Tests

```bash
npm test
```

Los tests **no necesitan MySQL**: los repositorios se mockean con Jest. Hay dos tipos:

- `tests/unit/`: reglas de puntaje, prioridad, reingreso tras rechazo y manejo de transacciones.
- `tests/integration/`: endpoints completos con Supertest sobre `app.js`, sin levantar el servidor.

## Endpoints

Todos los errores tienen el mismo formato:

```json
{
  "error": {
    "statusCode": 400,
    "message": "Datos de la postulacion invalidos",
    "details": [{ "field": "source", "message": "Valor no permitido. Valores validos: REFERRAL, INTERNAL, JOB_BOARD, OTHER" }]
  }
}
```

`details` solo aparece cuando aporta información: campos inválidos, id existente, fecha de reingreso, etc. Los errores inesperados responden 500 con un mensaje genérico, sin detalles internos.

Valores permitidos:

- `source`: `REFERRAL`, `INTERNAL`, `JOB_BOARD`, `OTHER`
- `status`: `RECEIVED`, `IN_REVIEW`, `REJECTED`, `HIRED` (los dos primeros son activos; los dos últimos son finales)
- `priority`: `LOW`, `MEDIUM`, `HIGH`, `TOP`

### POST /applications

Crea una postulación con estado `RECEIVED`, y calcula su puntaje y prioridad.

```bash
curl -i -X POST http://localhost:3000/applications \
  -H "Content-Type: application/json" \
  -d '{"candidateId": 1, "vacancyId": 2, "source": "REFERRAL", "coverLetter": "Desarrollo APIs con Node.js"}'
```

Respuesta `201` (con cabecera `Location: /applications/6`):

```json
{
  "id": 6,
  "candidateId": 1,
  "vacancyId": 2,
  "coverLetter": "Desarrollo APIs con Node.js",
  "source": "REFERRAL",
  "score": 9,
  "priority": "TOP",
  "status": "RECEIVED",
  "createdAt": "2026-09-30T19:14:36.000Z",
  "statusUpdatedAt": "2026-09-30T19:14:36.000Z"
}
```

| Campo | Regla |
|---|---|
| `candidateId`, `vacancyId` | Obligatorios, enteros positivos (el string `"1"` se rechaza) |
| `source` | Obligatorio, uno de los valores permitidos |
| `coverLetter` | Opcional, texto de hasta 10.000 caracteres; si falta o es `null` se guarda NULL |
| `score`, `priority`, `status`, `id` | Se ignoran si vienen en el body |

Reglas de puntaje:

| Regla | Puntos |
|---|---|
| Años del candidato >= mínimo de la vacante | +4 |
| Fuente `REFERRAL` / `INTERNAL` | +3 / +2 |
| La carta contiene "node", "sql" o "api" (sin distinguir mayúsculas, una sola vez) | +2 |
| La carta tiene más de 500 caracteres | +1 |
| El candidato tiene 3 o más postulaciones activas en otras vacantes | -2 |
| Mínimo | 0 |

Prioridad: 0-2 `LOW`, 3-4 `MEDIUM`, 5-6 `HIGH`, 7 o más `TOP`.

| Código | Caso |
|---|---|
| 201 | Creada |
| 400 | Body que no es objeto JSON, JSON mal formado, campos obligatorios ausentes, tipos incorrectos o `source` no permitido |
| 404 | El candidato o la vacante no existen |
| 409 | Vacante `CLOSED` |
| 409 | El candidato ya tiene en esa vacante una postulación `RECEIVED`, `IN_REVIEW` o `HIRED` (`details.existingApplicationId`) |
| 409 | Fue rechazado en esa vacante hace menos de 30 días (`details.reapplyAvailableAt`, fecha UTC) |

### GET /applications

Lista postulaciones con el nombre y email del candidato y el título de la vacante. Orden: `score` descendente, luego `createdAt` ascendente (a igual puntaje, primero la más antigua), luego `id` ascendente.

```bash
curl "http://localhost:3000/applications"
curl "http://localhost:3000/applications?status=RECEIVED"
curl "http://localhost:3000/applications?vacancyId=1"
curl "http://localhost:3000/applications?status=IN_REVIEW&vacancyId=5"
```

Respuesta `200`, siempre un array (vacío si no hay resultados):

```json
[
  {
    "id": 3,
    "candidateId": 3,
    "vacancyId": 1,
    "coverLetter": "Construyo APIs REST con Node.js desde hace ocho temporadas.",
    "source": "REFERRAL",
    "score": 9,
    "priority": "TOP",
    "status": "RECEIVED",
    "createdAt": "2026-09-25T19:31:37.000Z",
    "statusUpdatedAt": "2026-09-25T19:31:37.000Z",
    "candidate": { "name": "Lucia Herrera", "email": "lucia.herrera@example.com" },
    "vacancy": { "title": "Backend Developer Node.js" }
  }
]
```

| Filtro | Regla |
|---|---|
| `status` | Opcional, uno de los estados permitidos (distingue mayúsculas) |
| `vacancyId` | Opcional, entero positivo |

Los filtros se combinan con AND. Los parámetros desconocidos se ignoran.

| Código | Caso |
|---|---|
| 200 | OK |
| 400 | `status` no permitido o vacío, `vacancyId` no es entero positivo, o parámetro repetido (`?status=A&status=B`) |

### PUT /applications/:id/status

Cambia el estado de una postulación y actualiza `statusUpdatedAt`.

```bash
curl -X PUT http://localhost:3000/applications/3/status \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_REVIEW"}'
```

Respuesta `200` con la postulación actualizada, en el mismo formato que el POST.

| Código | Caso |
|---|---|
| 200 | Actualizada. Si el estado pedido es el actual, responde 200 sin cambios y `statusUpdatedAt` no se modifica |
| 400 | `id` no es entero positivo, o `status` ausente o no permitido |
| 404 | La postulación no existe |
| 409 | La postulación está en `REJECTED` o `HIRED` (`details.currentStatus`) |

## Decisiones técnicas y supuestos

**Arquitectura.** La API se organiza en capas: routes, controllers, validators, services y repositories. Los controllers solo traducen HTTP. Los validators rechazan datos inválidos antes de tocar la base. Los services contienen las reglas de negocio. Los repositories contienen solo SQL parametrizado, incluidos los `IN (...)`, que se generan con un `?` por valor. `app.js` no llama a `listen()`, así que los tests usan la app sin abrir puertos.

**Puntaje como funciones puras.** `scoring.service.js` no accede a la base de datos. Todos los puntos, umbrales y palabras clave son constantes, y las reglas se prueban caso por caso, incluidas las fronteras.

**Palabras clave por subcadena.** Así cuentan "Node.js", "MySQL" o "APIs". La contrapartida es que "api" también aparece en palabras como "rapidez" o "capital"; está documentado con un test.

**El puntaje se calcula una sola vez, al crear.** Las postulaciones activas en otras vacantes se cuentan en ese momento y el puntaje no se recalcula después. Esto mantiene estable el orden de atención.

**Concurrencia.** El POST corre en una transacción con `SELECT ... FOR UPDATE` sobre el candidato, que serializa sus postulaciones simultáneas, y `FOR SHARE` sobre la vacante, para que no se cierre durante la operación. El PUT bloquea la fila de la postulación. Ambos casos están probados con peticiones simultáneas contra MySQL.

**Fechas en UTC.** El pool usa `timezone: 'Z'` y `SET time_zone = '+00:00'`, y `database.sql` también fija UTC. Así la regla de 30 días no se desplaza si Node y MySQL están en zonas horarias distintas.

**Reingreso tras rechazo.** Se consideran todas las postulaciones previas del candidato a esa vacante. Cualquier `RECEIVED`, `IN_REVIEW` o `HIRED` bloquea. Si todas son `REJECTED`, los 30 días cuentan desde el `status_updated_at` más reciente, y al cumplirse exactamente los 30 días ya puede postular.

**Transiciones de estado.** Solo se bloquea salir de un estado final, como pide el enunciado. Entre estados activos se permite cualquier cambio, incluido `IN_REVIEW` a `RECEIVED`. Repetir el estado actual es idempotente.

**Orden de validación en el PUT.** El `id` y el `status` se validan antes de consultar la base. Por eso, un `status` inválido sobre un id inexistente responde 400, no 404.

**Sin índice UNIQUE para duplicados.** La regla depende del estado y de la fecha, así que se aplica en el service. El índice `(candidate_id, vacancy_id)` acelera la búsqueda.

**Express 5.** Los errores de los handlers `async` llegan solos al middleware de errores, sin necesidad de un wrapper.

**Pendiente.** Falta paginación en el GET, endpoints de candidatos y vacantes, autenticación, y un posible flujo de transiciones más estricto (por ejemplo, exigir pasar por `IN_REVIEW` antes de `HIRED`).

## Uso de herramientas de IA

Durante el desarrollo se utilizó Claude como asistente. El historial completo de la conversación está disponible en:

https://claude.ai/share/3151907c-2f95-488c-9e1b-42d83434e00c
