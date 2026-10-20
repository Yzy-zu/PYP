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
- `sistema_permisos_demo`: estructura del respaldo con las migraciones de seguridad, reglas e historial, 9 festivos, 4 cuentas ficticias (dos docentes, jefe y RH), 2 pases y 3 permisos de ejemplo. El servidor usa exclusivamente esta base con un usuario independiente.

`setup:local` conserva las bases y las credenciales cuando ya existen; no borra ni reinicia expedientes. Una restauración incompleta se considera un error y requiere revisión. El original SQL permanece intacto y está excluido de Git por sus datos personales y hashes.

## Uso diario

```sh
npm run db:up
npm run db:verify
npm start
```

`npm run dev` inicia el servidor con nodemon. Detener el servidor con Ctrl+C. `npm run db:stop` detiene solamente esta BD, conservando su volumen. Evitar `docker compose down -v`: eliminaría el volumen de estas bases.

El servidor se enlaza a `127.0.0.1:3100` y la BD a `127.0.0.1:33307`. Se pueden configurar en `.env`; cambiar credenciales de un volumen ya creado requiere actualizar también sus usuarios en MariaDB. El script de BD selecciona explícitamente el daemon Docker local, sin cambiar contextos guardados ni otros servicios.

### Acceso por Tailscale

En esta computadora está habilitado **http://100.109.237.37:3100** mediante un reenvío TCP de Tailscale al servidor local. El dispositivo cliente debe estar conectado a la red Tailscale y tener acceso permitido a este equipo. Se comprobó la carga, login y Socket.IO de las tres vistas por esa IP. Node debe seguir ejecutándose con `npm start`.

El reenvío se configuró en segundo plano y conserva la publicación HTTPS preexistente de otro servicio. Comandos para inspeccionar, habilitar nuevamente o retirar solo este puerto:

```sh
tailscale serve status
sudo tailscale serve --bg --tcp=3100 tcp://127.0.0.1:3100
sudo tailscale serve --tcp=3100 off
```

No es necesario cambiar `HOST` a `0.0.0.0` ni publicar MariaDB. Referencia: [reenvío TCP de Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Configuración y comprobación

Ver [.env.example](.env.example). El servidor carga `.env` desde la raíz, incluso cuando se ejecuta desde `backend`. Comprueba configuración obligatoria y conectividad a BD antes de anunciar que está listo.

`GET /api/salud` debe responder:

```json
{"ok":true,"database":"ready","email":"disabled"}
```

El correo está **desactivado por defecto** (`EMAIL_ENABLED=false`): no se crea transporte SMTP ni se envían mensajes. Activarlo requiere `EMAIL_ENABLED=true`, `EMAIL_USER` y `EMAIL_PASS`; durante la demo debe permanecer desactivado.

El dump necesita un cliente compatible con `DELIMITER`; la herramienta utiliza el cliente del contenedor. El respaldo conserva cuatro tablas, tres triggers, cuatro claves foráneas y nueve índices; la demo tiene cinco tablas, cuatro triggers de reglas, cuatro claves foráneas y trece índices. Para verificación manual, evitar imprimir filas de usuarios, contraseñas, hashes o motivos personales.

## Alcance actual

Fases 1 a 4: recuperación, arranque, controles básicos de seguridad, reglas de solicitudes, historial de revisión y PDF generado por el servidor. La demo usa datos ficticios y acceso local o por Tailscale. Calendario de intervalos, métricas y otras funciones pendientes corresponden a la fase 5.

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

## Reglas de fase 3

`setup:local` y `db:up` también aplican [003_reglas.sql](backend/bd/migraciones/003_reglas.sql) solamente a la demo. El SQL recibido y la base de respaldo conservan su contenido original.

- Tres pases por mes de uso, de hasta tres horas entre 07:00 y 20:00.
- Tres permisos ordinarios por cuatrimestre, cada uno de un día completo. Periodos: enero–abril, mayo–agosto y septiembre–diciembre.
- Un permiso adicional de cumpleaños por año, de un día completo, exactamente en la fecha registrada. Si cae en sábado, domingo o festivo registrado, no se solicita ni se traslada.
- Pendiente, Vo.Bo. y Aprobado reservan cupo; Rechazado y Cancelado lo liberan. Un docente solo puede tener un trámite activo por fecha.
- Creación y edición validan fechas, días hábiles, horarios y cupos en el servidor. Los contadores usan el periodo de la fecha elegida. El servidor calcula siempre un día por permiso.

Con servidor y demo activos, ejecutar las comprobaciones de forma consecutiva:

```sh
npm run check:security
npm run check:business
npm run db:verify
```

La segunda suite comprueba reglas y solicitudes simultáneas con datos ficticios propios que elimina al terminar. Ver [FASE_3_REGLAS.md](FASE_3_REGLAS.md) para decisiones, resultados y límites.

## Historial y documentos de fase 4

La migración [004_documentos.sql](backend/bd/migraciones/004_documentos.sql), aplicada por `setup:local` y `db:up`, añade el historial solamente en la demo. Las nuevas solicitudes, ediciones, decisiones y ajustes técnicos conservan actor, rol, fecha, estado y contenido. Vo.Bo. y aprobación final quedan en entradas independientes.

Los PDF se generan en Node desde el contenido guardado y las dos revisiones verificables. Solo se descargan después de la aprobación final: propietario y RH acceden a ambos tipos; jefatura accede a pases y al historial de permisos. El documento laboral de permisos se reserva al propietario y RH. Las pantallas ya no construyen un PDF con datos del navegador.

Los ejemplos heredados **no tienen constancia de ambas revisiones** y no generan PDF autorizado. Para presentar el flujo, crear una solicitud nueva como docente, dar Vo.Bo. como jefe y aprobar como RH. Los ajustes técnicos quedan auditados e invalidan el PDF previo, incluso si se deja el estado Aprobado. Para obtener una nueva constancia, devolver a Pendiente y repetir ambas revisiones. Se conservan expedientes mediante Cancelado; se retiró el borrado administrativo de trámites.

```sh
npm run check:documents
```

La suite crea y elimina fixtures propios. Con `pdftotext` instalado también comprueba el contenido del PDF. Ejecutar las suites consecutivamente, con servidor iniciado y correo desactivado. Ver [FASE_4_DOCUMENTOS.md](FASE_4_DOCUMENTOS.md) para resultados y límites.
