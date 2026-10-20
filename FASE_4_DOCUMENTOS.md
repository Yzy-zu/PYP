# Fase 4 — historial y documentos confiables

Fecha: 20 de octubre de 2026. Demo local y acceso por Tailscale; correo desactivado.

## Resultado

El Vo.Bo. de jefatura y la aprobación de RH se conservan por separado. Cada decisión registra identidad, rol, fecha UTC, estado anterior/nuevo, origen y una copia del contenido. Las nuevas solicitudes y sus ediciones también quedan registradas. La escritura del trámite y la de su historial se confirman o revierten en la misma transacción.

La aprobación final exige un Vo.Bo. previo registrado sobre el mismo contenido. No basta con cambiar el estado en SQL o en el panel técnico. La copia aprobada conserva los datos del solicitante y del contenido revisados por jefatura, junto con la identidad y fecha de la aprobación final de RH. Cambiar posteriormente nombres o datos del perfil no reescribe esa constancia.

La migración `004_documentos.sql` crea `revisiones_tramites`, con un índice por tipo/solicitud/orden. No inventa revisores para registros históricos. La demo tiene ahora cinco tablas, cuatro triggers, cuatro claves foráneas y trece índices. El SQL original y la base de respaldo conservan su estructura y registros.

## PDF y acceso

El servidor genera un PDF con PDFKit 0.20.2. Recibe únicamente tipo e ID de la solicitud; ignora nombres, motivos o revisores que alguien intente enviar como parámetros. El archivo contiene folio por tipo, periodo calculado desde la fecha solicitada, contenido autorizado y ambas revisiones. Los motivos de hasta 2000 caracteres fluyen a páginas adicionales, sin convertir el documento en una captura recortada. Fechas de revisión mostradas en `America/Mexico_City`.

Folios: `PASE-00000001` y `PERM-00000001`, derivados del identificador persistido y diferenciados por tipo. No se reinician por mes o por usuario. Las pantallas activas dejaron de cargar las plantillas HTML y los firmantes ficticios heredados.

| Recurso | Docente | Jefatura | RH |
| --- | --- | --- | --- |
| Historial | Solo lo propio | Todas las áreas | Todas las áreas |
| PDF de pase aprobado y verificable | Solo lo propio | Sí | Sí |
| PDF de permiso aprobado y verificable | Solo lo propio | No; contiene datos laborales reservados | Sí |

Rutas autenticadas:

- `GET /api/documentos/:tipo/:id`: historial, folio y disponibilidad para ese perfil; no expone snapshots laborales completos.
- `GET /api/documentos/:tipo/:id/pdf`: descarga desde el snapshot aprobado. Tipos válidos: `pase` y `permiso`.

Las respuestas y archivos usan `Cache-Control: no-store`. Un documento no aprobado, un registro antiguo sin evidencia, un ajuste técnico posterior o contenido modificado fuera del flujo causan rechazo de descarga. La edición de un perfil conserva el PDF autorizado; cambiar el contenido del trámite lo invalida.

## Ajustes administrativos

Los overrides registran quién los realizó y copias del contenido anterior/nuevo. Nunca acreditan por sí solos un Vo.Bo. o aprobación institucional. Invalidan la constancia previa aunque mantengan Aprobado como estado. Para emitir otra, el administrador debe devolver a Pendiente y repetir jefatura → RH. Las validaciones de fechas y cupos de fase 3 siguen aplicándose.

Se retiraron los botones de borrado de pases/permisos y sus rutas DELETE responden 409. Se puede dejar un expediente en Cancelado mediante ajuste administrativo conservando su historia. La cuenta técnica compartida se identifica como Administración técnica; esta entrega no incorpora cuentas técnicas individuales.

## Comprobaciones realizadas

- **16/16 pruebas API/BD de documentos:** autenticación, propiedad, permisos por rol, dos etapas, PDF real con nombres/folio, parámetros manipulados, copia estable tras cambios de nombres, ajustes auditados, invalidación, conservación del expediente, históricos sin evidencia, carreras de revisión y rollback ante Vo.Bo. falsificado.
- **25/25 de seguridad y 34/34 de reglas**, repetidas después de integrar esta fase. Fixtures propios y sus historiales eliminados al terminar.
- **12 comprobaciones de interfaz** en Chromium con respuestas controladas de documentos: las tres pantallas muestran ambas revisiones, escapan nombres maliciosos, descargan con token y ocultan PDF sin evidencia.
- **6 comprobaciones reales por la IP Tailscale**, sin mocks ni escrituras sobre la demo: login, Socket.IO, consulta de historial y PDF oculto en ejemplos heredados para docente/jefe/RH. Sin excepciones JavaScript en esos recorridos.
- **Descarga real desde ambos modales en Chromium:** fixtures propios de pase y permiso creados por API, Vo.Bo. y aprobación de RH; historial con los tres eventos y descarga por la IP Tailscale. Los dos archivos coinciden con su folio y contienen solicitante, revisores y motivo correctos. Sin errores JavaScript; fixtures e historiales eliminados.
- PDFs revisados con render y `pdftotext`: acentos, motivo de 2000 caracteres, final íntegro, encabezados/paginación y constancias en páginas adicionales. Auditoría npm de producción sin vulnerabilidades reportadas.
- Preparación repetida sin sobrescribir cuentas ni credenciales; verificación de estructura y conteos originales aprobada. El SHA-256 del SQL recibido sigue siendo `6c6d9a0fa3ea604e296c678aca7fef75726f7dbd5622b92c0215dcfd41e22800`.

## Acceso por Tailscale

URL habilitada y comprobada: **http://100.109.237.37:3100**. El servicio Tailscale reenvía ese puerto al Node local en `127.0.0.1:3100`. El cliente debe estar conectado a la red Tailscale y autorizado para acceder a este equipo. Se conserva la publicación HTTPS preexistente de otro servicio. No se publicó MariaDB ni se cambió el servidor a todas las interfaces.

El reenvío queda en segundo plano; la aplicación requiere que Node siga iniciado. Comandos y referencia de Tailscale en el README. La prueba por IP se realizó desde esta computadora, no acredita la configuración de otro dispositivo.

## Límites

La constancia registra decisiones en la aplicación; no contiene firmas autógrafas ni una firma electrónica certificada. El historial se conserva mediante las rutas de la aplicación, sin sellado criptográfico frente a administradores de BD. Las copias del contenido contienen datos personales y deben incluirse en la política institucional de respaldo y acceso cuando se defina un despliegue real.

Los ejemplos antiguos siguen disponibles como expedientes, sin atribuirles aprobaciones que no se pueden comprobar. Para una demostración completa debe crearse y aprobarse una solicitud nueva. SMTP sigue desactivado. Calendario de intervalos, métricas, aprobación masiva y navegación pendientes quedan para fase 5; ensayo y entrega, para fase 6.
