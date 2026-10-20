# Fase 2: controles de acceso y seguridad básica

Fecha: 20 de octubre de 2026. Se conserva el punto de partida de fase 1 (`31c1e54`).

## Cambios implementados

- Corregida la importación que omitía la protección de administración. Todas las rutas root salvo login requieren sesión técnica `Sysadmin`, distinta de la jefatura `Administrador`.
- Docentes limitados a solicitudes propias; modificación y cancelación solo mientras estén Pendientes. Listados generales reservados a jefatura y RH.
- Según aclaración del autor, **los jefes revisan todas las áreas**. Su decisión permite Pendiente → Vo.Bo./Rechazado; RH permite Vo.Bo. → Aprobado/Rechazado. No se permite autoaprobación docente ni salto de etapa.
- Los UPDATE vuelven a condicionar por propietario/estado cuando corresponde. Dos decisiones concurrentes no se aceptan sobre el mismo estado original.
- Sesiones verificadas contra la cuenta actual, con cuenta activa, rol vigente y versión de sesión. Cambiar contraseña, resetear, editar cuenta/rol, desactivar o cerrar sesión invalida las credenciales anteriores. Los sockets se desconectan al revocar.
- Eliminada la definición duplicada de renovación. La interfaz valida/renueva al cargar y usa el token vigente tras cambiar contraseña.
- Altas y resets con claves temporales aleatorias y cambio obligatorio; contraseñas nuevas distintas de la actual, mínimo 10 caracteres y máximo 72 bytes. Clave técnica mínima de 12 caracteres en configuración.
- Detalles de usuario sin hash ni versión interna de sesión. Jefatura recibe solicitudes de todas las áreas pero sin RFC, nacimiento, ingreso, categoría o contrato de la consulta de permisos; RH conserva esos datos para su función.
- Baja de cuenta mediante desactivación, conservando expedientes. Se valida tipo de entrada, rol y campos administrativos; errores SQL no se devuelven al cliente.
- Límites de intentos de login, tamaño JSON de 32 KiB, respuestas API sin almacenamiento en caché y retirada del CORS abierto de la API.
- Socket.IO autenticado, con caducidad y canales por propietario/revisores. Los docentes ajenos dejan de recibir IDs/cambios de otros expedientes.
- Texto de usuarios escapado en las cinco vistas activas; apertura de detalles con callbacks, sin incrustar JSON en atributos HTML. Código real del administrador centralizado en `root.js`.
- CSV con escape de celdas, neutralización de fórmulas y descarga Blob que conserva caracteres especiales.
- Registro de cuentas reservado a administración; el formulario público informa esa condición y ya no inventa RFC/fecha de ingreso ausentes.
- HTML de correo escapado y sin direcciones personales en logs. Envíos reales siguen desactivados en la demo.
- Dependencias de servidor actualizadas, incluida Nodemailer compatible con Node 20. `npm audit --omit=dev` terminó con **cero avisos reportados**; no es una garantía de ausencia de vulnerabilidades desconocidas.

La migración `002_seguridad.sql` añade tres columnas solo en `sistema_permisos_demo`. La base `sistema_permisos_respaldo` y el SQL original permanecen intactos. Los campos se añaden conservando las cuentas/contraseñas ficticias ya creadas.

## Comprobaciones realizadas

1. **25 comprobaciones integradas API + MariaDB**, mediante `npm run check:security`, después de actualizar dependencias: rutas root anónimas, separación de roles, propiedad, edición, cancelación, dos etapas, carreras de decisiones, contraseñas, reset temporal, renovación, logout, cambios de rol y cuentas inactivas/eliminadas. Fixtures eliminados al terminar.
2. **Chromium contra la API real:** login y carga inicial de docente, jefe, RH y administración, sin excepciones JS en ese recorrido. No se modificaron los datos de las cuentas demo para estas pruebas.
3. **Chromium aislado, cinco vistas:** apóstrofos, comillas y etiquetas con eventos maliciosos se conservan como texto/input/title y no se ejecutan. Se comprobó la apertura de detalles de jefe/RH.
4. **Helper de sesión aislado:** renovación antes de cargar pantalla, petición con token actualizado, cambio de contraseña y autenticación del socket.
5. **WebSocket real:** conexión anónima rechazada; cambio de trámite recibido por propietario/revisores y no por otro docente; logout desconecta y el token revocado no reconecta. Fixtures propios limpiados.
6. **CSV:** siete casos con fórmulas, espacios/tabs, comas, comillas, saltos de línea, `#` y valores vacíos.
7. **Nodemailer actualizado:** composición con transporte JSON simulado y nombres con HTML; ningún envío SMTP real.
8. Auditoría de producción, sintaxis, `git diff --check`, preparación repetible y verificación de bases.

Las comprobaciones de carga inicial no equivalen a una validación completa de todos los botones. El informe de métricas conserva su fallo funcional previo de elementos HTML ausentes, reservado para la fase 5; sus funciones de render se probaron de forma aislada para seguridad.

## Uso y decisiones prácticas

```sh
npm run db:up
npm start
# En otra terminal:
npm run check:security
```

Accesos ficticios en `.local/ACCESOS_DEMO.md`. Una sesión anterior a estos cambios debe iniciar sesión de nuevo. Las cuentas docentes/jefe/RH conservan sesión mientras su versión siga vigente; el panel técnico exige nuevo login tras reiniciar Node porque sus sesiones se mantienen en memoria. No hay cambio de rol del jefe en el enum existente: se conserva el valor `Administrador`, rotulado Jefatura en la interfaz, separado del privilegio técnico.

Los límites de intentos usan memoria del proceso, adecuados para esta preparación local; no se añadió almacenamiento distribuido. Cerrar sesión revoca las sesiones de la cuenta, no únicamente una pestaña.

## Pendiente para las siguientes fases

- **Fase 3:** cupos por periodo solicitado, estados que reservan cupo, cumpleaños adicional y validaciones comunes de fechas/horas/días en creación/edición. Los triggers originales aún excluyen Vo.Bo.
- **Fase 4:** conservar ambas revisiones y contenido autorizado, PDF respaldado por el servidor y corrección de sus nombres/periodos/folios. Los overrides técnicos continúan siendo operaciones privilegiadas pendientes de bitácora.
- **Fase 5:** calendario de intervalos, folios, aprobación masiva, métricas y navegación pendientes.
- **Fase 6:** ensayo completo, recuperación e instrucciones finales. No se ha acreditado una implantación escolar ni capacidad bajo carga.
- CSP estricta pendiente por acciones inline heredadas. El alta institucional depende de administración; no se inventó una lista de dominios permitidos.
- El envío SMTP real no se probó ni habilitó. Cero avisos npm no sustituyen las comprobaciones de aplicación.
