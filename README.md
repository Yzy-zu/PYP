# Pases y permisos UTM — recuperación local

Requisitos: Node.js 20 o superior, npm y Docker con Compose. El contenedor usa MariaDB 10.4.32 para reproducir el motor del respaldo; esta elección corresponde a recuperación local, no a una decisión de despliegue escolar.

## Preparación

Desde la raíz del proyecto, conservar el archivo recibido `sistema_permisos_salidas final.sql` y ejecutar:

```sh
npm --prefix backend ci --ignore-scripts
npm run setup:local
npm start
```

Abrir **http://127.0.0.1:3100**. Las cuentas y contraseñas generadas están en [.local/ACCESOS_DEMO.md](.local/ACCESOS_DEMO.md). La administración técnica utiliza `/Rlogin.html`. Ese archivo y `.env` son locales y están excluidos de Git.

La preparación genera `.env` con secretos aleatorios, inicia únicamente el servicio de BD de este proyecto y restaura dos bases:

- `sistema_permisos_respaldo`: copia original con 39 usuarios, 2 pases, 65 permisos y 9 festivos. Accesible solo con la cuenta root del contenedor.
- `sistema_permisos_demo`: misma estructura y triggers, 9 festivos, 4 cuentas ficticias (dos docentes, jefe y RH), 2 pases y 3 permisos de ejemplo. El servidor usa exclusivamente esta base con un usuario independiente.

`setup:local` conserva las bases y las credenciales cuando ya existen; no borra ni reinicia expedientes. Una restauración incompleta se considera un error y requiere revisión. El original SQL permanece intacto y está excluido de Git por sus datos personales y hashes.

## Uso diario

```sh
npm run db:up
npm run db:verify
npm start
```

`npm run dev` inicia el servidor con nodemon. Detener el servidor con Ctrl+C. `npm run db:stop` detiene solamente esta BD, conservando su volumen. Evitar `docker compose down -v`: eliminaría el volumen de estas bases.

El servidor se enlaza a `127.0.0.1:3100` y la BD a `127.0.0.1:33307`. Se pueden configurar en `.env`; cambiar credenciales de un volumen ya creado requiere actualizar también sus usuarios en MariaDB. El script de BD selecciona explícitamente el daemon Docker local, sin cambiar contextos guardados ni otros servicios.

## Configuración y comprobación

Ver [.env.example](.env.example). El servidor carga `.env` desde la raíz, incluso cuando se ejecuta desde `backend`. Comprueba configuración obligatoria y conectividad a BD antes de anunciar que está listo.

`GET /api/salud` debe responder:

```json
{"ok":true,"database":"ready","email":"disabled"}
```

El correo está **desactivado por defecto** (`EMAIL_ENABLED=false`): no se crea transporte SMTP ni se envían mensajes. Activarlo requiere `EMAIL_ENABLED=true`, `EMAIL_USER` y `EMAIL_PASS`; durante la demo debe permanecer desactivado.

El dump necesita un cliente compatible con `DELIMITER`; la herramienta utiliza el cliente del contenedor y verifica cuatro tablas, tres triggers, cuatro claves foráneas y nueve índices en cada base. Para verificación manual, evitar imprimir filas de usuarios, contraseñas, hashes o motivos personales.

## Alcance actual

Fases 1 y 2: recuperación, arranque y controles básicos de seguridad. Mantener la demo en localhost con datos ficticios mientras se completan las reglas y los documentos. Los cupos/cumpleaños y el historial de ambas revisiones siguen pendientes en las fases siguientes. La restauración conserva los triggers originales.

## Seguridad de fase 2

`npm run setup:local` y `npm run db:up` aplican [002_seguridad.sql](backend/bd/migraciones/002_seguridad.sql) solamente a la base demo. Añade cuenta activa, versión de sesión y cambio obligatorio de contraseña; el respaldo conserva sus columnas originales.

| Perfil | Acceso |
| --- | --- |
| Docente | Solicita; consulta lo propio; edita/cancela únicamente lo propio Pendiente |
| Jefatura (`Administrador` en BD) | Consulta todas las áreas, da Vo.Bo. o rechaza Pendiente |
| RH | Consulta el conjunto, aprueba/rechaza después de Vo.Bo.; accede a datos laborales necesarios |
| Administración técnica (`Sysadmin`) | Acceso separado en `/Rlogin.html` para cuentas, festivos y operaciones administrativas |

Cambiar contraseña, resetear, modificar rol o desactivar una cuenta invalida sus tokens anteriores. Cerrar sesión invalida las sesiones de esa cuenta y desconecta sus sockets. La administración técnica mantiene sesiones en memoria: reiniciar Node exige volver a autenticarse en ese panel. Los tokens anteriores a esta fase también requieren nuevo login.

Las contraseñas nuevas requieren 10 caracteres como mínimo y hasta 72 bytes; la clave técnica de `.env` requiere 12 caracteres como mínimo. Altas y resets generan una contraseña temporal si corresponde, que se muestra una sola vez al administrador y obliga al usuario a cambiarla antes de operar. Se desactivan cuentas conservando sus expedientes.

Las pantallas verifican la sesión antes de iniciar, escapan texto de usuarios y autentican sockets. Los avisos de un trámite llegan a su propietario y a revisores; no a otros docentes. El CSV neutraliza fórmulas y escapa celdas. El correo permanece desactivado para la demo.

El login tiene límites en memoria por proceso: 30 intentos por cuenta y 150 por IP en 15 minutos; devuelve 429 al agotarlos. El reinicio vacía esos límites. Se restringen cuerpos JSON a 32 KiB. La CSP estricta y una política de alta institucional/dominio no forman parte de esta entrega; las pantallas todavía tienen acciones inline heredadas.

Con el servidor y la demo activos:

```sh
npm run check:security
```

Ese comando crea fixtures ficticios, comprueba accesos/sesiones/estados y los elimina al terminar. Se niega a ejecutarse contra una base distinta de `_demo`, una API remota o con correo habilitado. Ver [FASE_2_SEGURIDAD.md](FASE_2_SEGURIDAD.md) para resultados y límites.
