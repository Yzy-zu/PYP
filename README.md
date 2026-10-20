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

Fase 1: recuperación y arranque local. Los defectos de autorización, HTML, cupos y aprobaciones descritos en [el análisis](ANALISIS_PDF_SQL_2026-10-20.md) se corregirán en las fases siguientes. Mantener esta versión en localhost y usar las cuentas ficticias. La restauración conserva los triggers originales para tener un punto de partida verificable.
