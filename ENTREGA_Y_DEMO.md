# Entrega y demostración — 20 de octubre de 2026

Las seis fases están cerradas para presentar la demo. El recorrido final se ensayó en Chromium por Tailscale: crear pase y permiso, Vo.Bo. de jefe, aprobación de RH y descarga de ambos PDF, con folios y revisores correctos. Sin errores JavaScript; usuarios, trámites e historiales de prueba eliminados.

## Acceso

- En esta computadora: **http://127.0.0.1:3100**.
- Desde un dispositivo conectado a tu Tailscale: **http://100.109.237.37:3100**.
- Cuentas y contraseñas: [.local/ACCESOS_DEMO.md](.local/ACCESOS_DEMO.md), carpeta oculta. Incluye dos docentes, jefe, RH y administración técnica.
- Docente, jefe y RH entran por `/login.html`. Administración técnica entra por `/Rlogin.html`.

El servidor está iniciado al cerrar esta entrega. Tailscale reenvía únicamente el puerto de la aplicación; la BD sigue local. No se han comprobado los permisos de otro dispositivo de tu red: abre la URL desde el que usarás para presentar.

## Arrancar si reinicias la computadora

Desde `/home/petrov/pases/Proyecto`, con Docker disponible:

```sh
npm run db:up
npm run db:verify
npm start
```

Mantén esa terminal abierta. Si ya funciona el servidor, no inicies otro: el puerto estará ocupado. Comprueba `/api/salud`; debe indicar `database: ready` y `email: disabled`.

Si falta Tailscale, revisar `tailscale serve status`; para restablecer solo este reenvío:

```sh
sudo tailscale serve --bg --tcp=3100 tcp://127.0.0.1:3100
```

## Recorrido de presentación, 5–7 minutos

1. Abre tres pestañas e inicia sesión como docente, jefe y RH respectivamente.
2. **Docente:** elige un día hábil libre y crea un pase con horario válido, por ejemplo 09:00–10:00. Muestra su folio, estado Pendiente y cupo actualizado.
3. **Jefe:** encuentra ese folio y da **Vo.Bo.**. Explica que revisa todas las áreas y que todavía falta la autorización final.
4. **RH:** aprueba el mismo folio. Abre el detalle para mostrar ambas revisiones con sus nombres y fechas.
5. **Docente:** abre el expediente y descarga el PDF autorizado. Muestra folio, horario, solicitante y revisores.
6. Repite con un permiso ordinario en otro día hábil libre: inicio y fin coinciden; el servidor calcula un día completo.
7. En RH muestra el informe, aplica un filtro y exporta el CSV. Si queda tiempo, demuestra la selección de varios trámites con Vo.Bo. y sus resultados por folio.

Reglas para explicar: tres pases por mes de uso; tres permisos ordinarios de un día por cuatrimestre; un día adicional exactamente en cumpleaños, solo hábil. Pendiente/Vo.Bo./Aprobado reservan cupo. Cancelado/Rechazado liberan cupo. El cumpleaños no se traslada. Pases de hasta tres horas entre 07:00 y 20:00.

Los ejemplos heredados no tienen evidencia completa de revisiones y **no generan PDF autorizado**. Presenta una solicitud nueva siguiendo ambos pasos. El informe distingue horas y días; no es un sistema de nómina ni un registro de asistencia.

## Respaldo preparado

Carpeta creada y comprobada:

`backups/demo-2026-10-20T23-08-09-516Z-7d14b3/`

Incluye SQL de la demo con triggers e historial, configuración, accesos y manifiesto SHA-256. Se restauró en una base temporal y coincidieron cinco tablas, cuatro triggers, cuatro claves foráneas, trece índices y los conteos de las cinco tablas. La base temporal se eliminó; la demo y el respaldo original se conservaron.

Para guardar los movimientos de tu ensayo, sin solicitudes en curso:

```sh
npm run db:backup
```

**Copia la carpeta de respaldo fuera de esta computadora de forma privada.** Esta entrega deja una copia local; no se envió a servicios externos. Conserva también el código, el SQL original recibido, `.env` y `.local/ACCESOS_DEMO.md`. No publiques esos archivos privados.

Si pierdes el volumen, `setup:local` vuelve a preparar bases desde el SQL original y una demo inicial; no recupera los movimientos recientes. Para conservar el último estado, importa `demo.sql` del respaldo privado en una BD vacía y configura el usuario de aplicación y `DB_NAME` antes de iniciar Node. Conserva la BD dañada hasta verificar la recuperada. El respaldo no incluye código ni configuración global de Docker/Tailscale.

## Comprobación y límites de entrega

En fase 5 pasaron 75 comprobaciones API/BD, pruebas de calendarios, informe y lote real de RH. En fase 6 se repitió el recorrido completo con ambos PDF y se verificó la restauración del respaldo. La estructura y conteos originales permanecen intactos; el SQL recibido conserva SHA-256 `6c6d9a0fa3ea604e296c678aca7fef75726f7dbd5622b92c0215dcfd41e22800`.

Para repetir las comprobaciones automáticas, con servidor iniciado y correo desactivado, ejecutar consecutivamente:

```sh
npm run check:security
npm run check:business
npm run check:documents
npm run db:verify
```

La entrega es una demo funcional con datos ficticios. Antes de uso institucional faltan validación de calendario/horarios por RH, política de datos y respaldos externos, prueba con carga representativa y configuración de despliegue. SMTP permanece desactivado; no se validó el proveedor del clima ni funcionamiento sin internet de los recursos CDN. Los PDF son constancias del flujo de la aplicación, sin firma electrónica certificada.
