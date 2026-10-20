# Fase 1 completada: recuperación y arranque local

Fecha: 20 de octubre de 2026.

## Resultado

Se restauró el SQL recibido en MariaDB 10.4.32 dentro del servicio Docker exclusivo `proyecto-pases-local`. No se modificó el archivo original ni otros servicios Docker. El servidor usa una segunda BD con datos ficticios; el usuario de aplicación no puede consultar el respaldo original.

| Verificación | Respaldo conservado | Demo |
| --- | ---: | ---: |
| Tablas | 4 | 4 |
| Triggers originales | 3 | 3 |
| Claves foráneas | 4 | 4 |
| Índices, incluidas PK | 9 | 9 |
| Usuarios | 39 | 4 |
| Pases | 2 | 2 |
| Permisos | 65 | 3 |
| Festivos | 9 | 9 |

El respaldo queda en `sistema_permisos_respaldo` y la aplicación en `sistema_permisos_demo`. La demo incluye dos docentes, un jefe y RH, más acceso técnico con credenciales generadas. Sus direcciones usan el dominio reservado `demo.invalid`. Las credenciales están exclusivamente en `.env` y `.local/ACCESOS_DEMO.md`, excluidas de Git.

## Cambios

- Corregidos `start`, `dev` y `main` del backend; añadidos comandos desde la raíz.
- Variables cargadas desde la raíz, con validación de campos obligatorios y puertos.
- Conexión con usuario independiente de root; comprobación real antes de anunciar servidor disponible.
- Servidor enlazado por defecto a `127.0.0.1:3100`, BD a `127.0.0.1:33307`.
- Correo desactivado por defecto, sin construir transporte SMTP.
- Preparación conservadora: repetirla mantiene datos/credenciales; separa el esquema de los INSERT originales para la demo y verifica objetos/conteos.
- Salud de MariaDB comprobada por consulta TCP para evitar confundir el servidor temporal de inicialización con el definitivo.
- Endpoint `/api/salud` con 200 cuando la BD responde y 503 cuando no está disponible.
- Instrucciones en [README.md](README.md); SQL recibido, secretos y archivos locales excluidos de Git.

## Comprobaciones realizadas

1. Instalación real mediante `npm ci` con scripts de instalación desactivados, conservando versiones de dependencias.
2. Restauración con el cliente MySQL del contenedor, incluyendo DELIMITER y triggers; conteos y objetos de la tabla anterior verificados.
3. Segunda ejecución de `setup:local`: no reimporta ni duplica datos, ni cambia contraseñas.
4. Inicio mediante `npm start` de la raíz y su comando del backend.
5. HTTP real: login y perfil de las cuatro cuentas; consultas personales y contadores de docentes; login técnico; página de acceso y salud.
6. El archivo SQL no se sirve desde la carpeta pública: su URL devuelve 404.
7. Consulta desde el usuario de aplicación a la BD de respaldo rechazada por MariaDB.
8. Modo de correo desactivado comprobado haciendo que la construcción de transporte SMTP fallase si se intentaba; el envío se omitió sin construirlo.
9. Arranque con BD inaccesible y configuración obligatoria incompleta: salida con error, sin anunciar disponibilidad.
10. Detención de esta BD: salud HTTP 503. Reinicio conservando volumen: salud HTTP 200 y mismos conteos verificados.
11. Sintaxis y diferencias sin errores de whitespace; integridad del SQL original conservada.

Estas son comprobaciones de recuperación/arranque y conexión. No acreditan que se hayan corregido los controles de autorización o las reglas de negocio.

## Uso

```sh
npm run db:up
npm run db:verify
npm start
```

En este entorno se dejó el servidor disponible en **http://127.0.0.1:3100**. Revisar [.local/ACCESOS_DEMO.md](.local/ACCESOS_DEMO.md) para entrar.

## Siguiente fase

Fase 2: cerrar administración anónima, autorización por rol/expediente, representación segura del texto y sesiones/credenciales. Esta fase 1 conserva los triggers y flujos originales como punto de partida. Mantener el uso en localhost con datos ficticios hasta corregir esos defectos.
