# Traspaso del proyecto — contexto para Gemini y trabajo de frontend

Actualizado: 20 de octubre de 2026. Base funcional cerrada en commit `31bc048`.

## 1. Qué necesita el usuario

El proyecto es un sistema de pases de salida y permisos docentes de la Universidad Tecnológica de Morelia. Los profesores solicitaron presentarlo y contemplan una posible implantación escolar. El autor llevaba meses sin revisarlo y había perdido la BD; entregó el PDF de requisitos y un SQL que se recuperó. La presentación es próxima y el criterio acordado fue algo bien hecho y práctico: evitar reescrituras, arquitectura innecesaria y pruebas desproporcionadas.

Se completaron seis fases de recuperación y corrección. **La siguiente tarea solicitada es mejorar el frontend sobre esta base funcional.** No hay un diseño visual nuevo aprobado todavía. Proponer y ejecutar mejoras de presentación/usabilidad conservando reglas, seguridad, contratos y datos. No empezar otra recuperación ni asumir que el diagnóstico inicial describe el estado actual.

Este documento contiene contexto técnico sin contraseñas. Las credenciales permanecen exclusivamente en `.local/ACCESOS_DEMO.md`; no copiarlas a este documento, código, capturas públicas ni commits.

## 2. Estado y arranque

- Directorio de trabajo: `/home/petrov/pases/Proyecto`.
- Backend: Node.js 20+, Express 5, mysql2, JWT, bcryptjs, Socket.IO y PDFKit 0.20.2.
- Frontend: HTML, CSS y JavaScript tradicional, Bootstrap 5, FullCalendar 6.1.10 y Chart.js 4.4.8. No es React/Vue ni requiere introducir un bundler.
- BD local Docker Compose: MariaDB 10.4.32, conservada por compatibilidad con el respaldo original.
- Node sirve directamente `frontend/` y `/api`; conservar peticiones relativas `/api/...`.
- Local: `http://127.0.0.1:3100`. Tailscale: `http://100.109.237.37:3100`.
- BD: `127.0.0.1:33307`, sin publicación en otras interfaces.
- Correo: `EMAIL_ENABLED=false`. No habilitar SMTP para probar interfaz.

Uso diario desde la raíz:

```sh
npm run db:up
npm run db:verify
npm start
```

Si el puerto 3100 ya responde, no iniciar otro servidor ni matar procesos ajenos. La configuración está en `.env`, cargada desde la raíz. Para instalar dependencias en una copia nueva: `npm --prefix backend ci --ignore-scripts`. `npm run setup:local` prepara la recuperación/demo, conserva bases existentes y no debe usarse para reiniciar expedientes.

Tailscale tiene un reenvío TCP en segundo plano a `127.0.0.1:3100`. No cambiar `HOST` a `0.0.0.0` para facilitar diseño ni reemplazar la publicación HTTPS de otro servicio que ya existe en esta computadora.

```sh
tailscale serve status
sudo tailscale serve --bg --tcp=3100 tcp://127.0.0.1:3100
```

## 3. Bases y archivos que se deben conservar

| Base | Contenido y propósito |
| --- | --- |
| `sistema_permisos_respaldo` | Copia original aislada: 39 usuarios, 2 pases, 65 permisos y 9 festivos. Cuatro tablas, tres triggers, cuatro FK y nueve índices. No modificar |
| `sistema_permisos_demo` | Base usada por la app: 4 cuentas ficticias, 2 pases, 3 permisos y 9 festivos al cierre. Cinco tablas, cuatro triggers, cuatro FK y trece índices |

Tablas de la demo: `usuarios`, `pases_salida`, `permisos_goce`, `dias_festivos`, `revisiones_tramites`. Los historiales de fixtures fueron eliminados; los ejemplos heredados no recibieron revisiones inventadas. Si el usuario ha ensayado después, puede haber más registros legítimos: no borrarlos para volver a estos conteos.

Migraciones aplicadas solamente a la demo:

- `backend/bd/migraciones/002_seguridad.sql`: activo, versión de sesión y cambio obligatorio de contraseña.
- `003_reglas.sql`: reemplazo de triggers heredados, INSERT/UPDATE, cupos y validaciones.
- `004_documentos.sql`: historial y snapshots del contenido revisado.

El SQL recibido `sistema_permisos_salidas final.sql` conserva SHA-256 `6c6d9a0fa3ea604e296c678aca7fef75726f7dbd5622b92c0215dcfd41e22800`. Está excluido de Git porque contiene datos personales y hashes. No importarlo encima de la demo ni aplicar cambios al original.

Otros archivos aportados por el usuario permanecen sin añadir a Git: `Pases y Permisos UTM.pdf`, `ANALISIS_PDF_SQL_2026-10-20.md`, `REPORTE_AUDITORIA_2026-10-20.md`. No borrarlos, sobrescribirlos ni hacer `git add .` indiscriminadamente. Los informes iniciales contienen problemas ya resueltos y preguntas ya contestadas.

## 4. Reglas de negocio definitivas para la interfaz

Estas aclaraciones del autor prevalecen sobre contradicciones del PDF y del código antiguo:

1. **Tres pases por mes de uso**, distinguiendo el año.
2. **Tres permisos ordinarios por cuatrimestre**, cada uno de **un solo día completo**. Personal, Salud e Institucional comparten ese cupo.
3. **Un permiso adicional por cumpleaños al año**, de un día completo, exactamente en el mes/día de nacimiento registrado. No consume el cupo ordinario.
4. Si cumpleaños cae en sábado, domingo o festivo registrado, **no se solicita ni se traslada**. El 29 de febrero no se convierte en 28 de febrero o 1 de marzo.
5. **Jefe da Vo.Bo.; RH aprueba definitivamente. Los jefes revisan todas las áreas**, no solo la suya.
6. Pendiente, Vo.Bo. y Aprobado reservan cupo. Rechazado y Cancelado lo liberan.
7. Solo un trámite activo por docente y fecha, incluida combinación pase/permiso.
8. Crear y editar vuelven a validar fecha, día hábil, horarios, cupos y colisiones. No se solicitan ni trasladan trámites a fechas pasadas.
9. El servidor calcula siempre un día por permiso: `fecha_inicio === fecha_fin`, `cantidad_dias=1`. No confiar en un cálculo del navegador.
10. El día escolar usa `America/Mexico_City`. Los contadores se consultan para la fecha elegida, no necesariamente el mes actual.

Se conservaron de la implementación los cuatrimestres enero–abril, mayo–agosto y septiembre–diciembre, y pases de máximo tres horas entre 07:00 y 20:00. Están implementados, pero falta su validación institucional formal. El frontend no debe cambiarlos por su cuenta.

## 5. Roles y estados

| Valor del rol | Presentación | Permisos principales |
| --- | --- | --- |
| `Docente` | Docente | Crear, ver lo propio, editar/cancelar lo propio mientras esté Pendiente |
| `Administrador` | Jefatura | Ver todas las áreas; Pendiente → Vo.Bo. o Rechazado |
| `RRHH` | Recursos Humanos | Ver el conjunto; Vo.Bo. → Aprobado o Rechazado |
| `Sysadmin` | Administración técnica | Login separado, cuentas/festivos/ajustes privilegiados |

**`Administrador` NO es el administrador técnico.** No renombrar esos enums ni mezclar sus accesos para simplificar menús.

El backend verifica roles, propietario, estado actual y sesión. La interfaz debe orientar, pero no sustituir esa autorización. Un docente no se aprueba, RH no salta Vo.Bo. y jefatura no aprueba definitivamente.

## 6. Qué se hizo en cada fase

| Fase / commit | Resultado |
| --- | --- |
| 1 · `31c1e54` | Recuperación del SQL, original aislado, demo ficticia, Docker, secretos locales, arranque reproducible y correo apagado |
| 2 · `5d151bf` | Rutas protegidas, roles/propiedad, sesión revocable, contraseñas temporales, baja lógica, XSS/CSV y sockets autenticados, dependencias actualizadas |
| 3 · `00f5645` | Cupos por periodo de uso, cumpleaños adicional, permiso de un día, reglas compartidas en servidor, validaciones al editar y protección ante concurrencia |
| 4 · `53bbc19` | Vo.Bo. y RH separados, historial y snapshots transaccionales, PDF del servidor, folios, ajustes auditados e invalidación del PDF anterior |
| 5 · `8f57c40` | Calendarios con horas/rangos, cumpleaños por año visible, folios uniformes, lote RH real y sus errores, informe/CSV/filtros, navegación móvil y páginas antiguas |
| 6 · `31bc048` | Ensayo final real con ambos PDF, guía de presentación, respaldo privado y restauración aislada verificada |

Detalles en `README.md`, `FASE_1_RECUPERACION.md`, `FASE_2_SEGURIDAD.md`, `FASE_3_REGLAS.md`, `FASE_4_DOCUMENTOS.md`, `FASE_5_PANTALLAS.md` y `ENTREGA_Y_DEMO.md`. Las secciones «pendiente» de informes de fases anteriores describen su momento histórico; contrastarlas con los posteriores.

## 7. Mapa del frontend activo

| Vista | Lógica | CSS particular / observación |
| --- | --- | --- |
| `login.html` | `js/login.js` | `recursos/css/login.css` |
| `principal.html` | `js/principal.js` | `recursos/css/principal.css`; docente |
| `vista_jefe_inmediato.html` | `js/vista_jefe.js` | `recursos/css/jefes.css` |
| `vistaRH.html` | `js/vista_rh.js` | `recursos/css/rh.css`; autorización e historial canónicos |
| `informeRH.html` | `js/informeRH.js` | RH; estilos compartidos y locales |
| `Rlogin.html`, `root.html` | Login inline / `js/root.js` | Administración técnica separada |
| `vistaRHS.html` | Redirección | Lleva a `vistaRH.html?view=autorizar`; no reconstruir otra pantalla duplicada |
| `registro.html`, `registroAv.html` | Información / redirección | No hay alta pública; explica cómo solicitar cuenta |
| `paginaInformativa/index.html` | Presentación del proyecto | CTA dirige al login |
| `clima.html` | `js/clima.js` | Opcional, proveedor externo no probado; regreso según perfil |

`recursos/css/estilos.css` contiene estilos compartidos. Usar logos/recursos existentes en `frontend/imagenes/` y `frontend/recursos/imagenes/`. Hay estilos heredados, valores inline y diferencias entre pantallas; ahí hay trabajo visual útil.

Helpers que deben conservarse:

- **`js/seguridad.js`**: valida/renueva sesión antes de cargar la vista, fuerza cambio de contraseña temporal, actualiza el token usado por fetch, trata 401, logout y sockets. Las vistas se cargan con `Seguridad.cargar(script, rol)` y arrancan con `Seguridad.alCargar`. No reemplazarlo por confiar solo en sessionStorage.
- **`js/tramites.js`**: `Tramites.folio`, `evento`, `coinciden`, `cumpleanos`, fechas civiles y día escolar. Los eventos usan identidad tipo+ID y permisos con fin exclusivo. No volver a `toISOString()` indiscriminadamente sobre fechas locales del calendario.
- **`js/pdfsito.js`**: descarga autenticada desde servidor y muestra historial seguro. No vuelve a generar PDF en el navegador.

Los scripts dependen de IDs y listeners de sus HTML. Antes de renombrar/eliminar un elemento, actualizar todas sus referencias y comprobar carga, modal, formulario y móvil. Conservar el arranque protegido y el orden de scripts compartidos.

Quedan archivos legacy sin uso en las vistas activas, como `js/admins.js` y `pdfsito.html`. El primero conserva nombres de autoridades ficticios y un periodo fijo antiguo: **no volver a importarlo**. Una limpieza de archivos debe comprobar referencias primero, sin resucitar módulos antiguos como solución a una función ausente.

## 8. Contratos importantes del backend

Autenticación escolar: `POST /api/login/login` con `{correo,password}`. Token en header `x-token`; almacenamiento actual `sessionStorage.token` y `sessionStorage.usuario`. La administración técnica usa `sys_tkn`/`sys_usuario` y `/api/root/login`. El helper maneja el token vigente.

| Ruta | Uso |
| --- | --- |
| `GET /api/login/ntoken`, `/perfil` | Renovación/perfil |
| `PATCH /api/login/npassword` | `{password,npassword}`; no perder el token nuevo |
| `POST /api/login/logout` | Revoca sesiones de esa cuenta y sockets |
| `GET /api/login/contadores?fecha=AAAA-MM-DD` | Docente: `pases`, `permisos`, `cumpleanos`, cada uno con `usados`/`disponibles` |
| `GET /api/negocio/config` | `hoy`, `zonaHoraria`, `maxDiasPermiso:1`, `cumpleanosInhabil:false` |
| `GET /api/dias/ver` | Array de festivos registrados |
| `GET /api/pases/ver`, `/api/permisos/ver` | Solicitudes propias del docente |
| `GET /api/pases/todos`, `/api/permisos/todos` | Listados para jefe/RH; `usuario_id`, no `id_usuario`; incluyen folio canónico |
| `POST /api/pases/crear` | `{fecha_uso,hora_inicio,hora_fin,motivo}` |
| `POST /api/permisos/crear` | `{tipo_permiso,fecha_inicio,fecha_fin,cantidad_dias,motivo}` |
| `PATCH /api/pases/mod`, `/api/permisos/mod` | Campos de solicitud e `id`, solo dueño Pendiente |
| `PATCH /api/pases/cancelar`, `/api/permisos/cancelar` | `{id,cancelar:nuevoEstado}` para decidir/cancelar según rol; el nombre de la ruta es heredado |
| `GET /api/documentos/:tipo/:id` | `{ok,data:{historial,documento_disponible,folio}}`; tipos `pase`/`permiso` |
| `GET /api/documentos/:tipo/:id/pdf` | Archivo PDF autorizado; no recibir nombres/revisores del cliente |

El historial entrega `accion`, `estado_anterior`, `estado_nuevo`, `actor_nombre`, `actor_rol`, `fecha`, `origen`. Mostrar mediante `textContent` o escape correcto; no insertar datos de personas en HTML/event handlers sin escape.

HTTP 400 indica entrada inválida; 401 sesión; 403 acción prohibida; 404 no disponible; 409 conflicto/reglas/evidencia; 503 fallo temporal. Mostrar mensajes seguros del servidor y estados de error reales; no convertir una petición fallida en una lista vacía o éxito.

Sockets escolares mediante `Seguridad.socket()`: `nuevo-pase-creado`, `nuevo-permiso-creado`, `pase-actualizado`, `permiso-actualizado`, `actualizar-contadores`. Avisos restringidos al propietario y revisores, no globales para todos los docentes.

## 9. Documentos e invariantes que no debe romper el rediseño

- Folios: `PASE-00000001` y `PERM-00000001`, derivados del ID persistido. No recalcular números por posición, docente, mes o filtro.
- PDF solo después de aprobación final verificable. Aprobado histórico sin snapshot no acredita las dos revisiones: el botón debe seguir oculto y el servidor rechaza descarga.
- Propietario y RH pueden descargar ambos tipos; jefatura puede descargar pases, pero no PDF laboral de permisos. Jefatura sí consulta el historial.
- La aprobación conserva contenido y nombres revisados. Editar el perfil después no reescribe el PDF autorizado.
- Un ajuste técnico queda auditado e invalida el PDF incluso manteniendo estado Aprobado. Para otra constancia: devolver a Pendiente y repetir jefe → RH.
- No hay borrado administrativo de trámites; DELETE responde 409. Cancelado conserva el expediente.
- Los snapshots/auditoría viven en servidor. No inventar aprobaciones, firmas ni nombres para embellecer un comprobante.

## 10. Lote RH e informe: comportamiento que ya funciona

RH selecciona únicamente solicitudes con Vo.Bo. visibles con sus filtros. Se captura la selección, bloquean controles y dobles clics y se difieren recargas por sockets. Cada PATCH tiene su propia transacción: puede haber resultado parcial, mostrado por folio. Una respuesta perdida no se reenvía automáticamente; se consulta estado. Si también falla la recarga, se informa incertidumbre y se bloquean cambios hasta actualizar.

El informe comparte filtros de mes de uso/inicio, tipo y estado entre métricas, tablas y CSV. Días = cantidad de días de permisos Aprobados; horas = duración de pases Aprobados. No convertir pases a 0.1 días. Tasa = Aprobados/(Aprobados+Rechazados), sin decisiones si denominador cero. Vo.Bo. se cuenta aparte. Rangos históricos se atribuyen completos al mes de inicio, sin prorratear.

Coincidencias: distintas personas por `usuario_id`, misma área, intervalos superpuestos, estados activos identificados. Excluir cancelados/rechazados y días inhábiles registrados. Dos horarios contiguos no se solapan; dos personas pueden llamarse igual. No es nómina ni asistencia real.

CSV: mismos filtros, comillas/comas/saltos correctos, neutralización de fórmulas y descarga Blob. Un fallo API limpia cifras engañosas y desactiva exportación. Si falta Chart.js, totales y tablas siguen disponibles.

## 11. Pendientes reales y límites actuales

**No se dejó identificado un bloqueo crítico del recorrido ensayado. Eso no significa que todos los botones y escenarios posibles estén auditados.** Separar problemas actuales de mejoras para producción:

- **Frontend:** falta homogeneizar diseño, componentes visuales, espaciado, tipografía, formularios, mensajes, navegación activa, modales y accesibilidad. El panel técnico mantiene presentación y textos muy rudimentarios. Hubo pruebas a 390 px, pero falta una revisión visual/accesible completa de todas las pantallas y resoluciones.
- **Legacy:** quedan CSS/JS/plantillas y comentarios desactualizados. Los nombres ficticios de `admins.js` ya no se usan, pero el archivo sigue presente. Limpiar cuidadosamente.
- **CSP:** la política estricta está desactivada en Helmet por scripts/acciones inline heredadas. No afirmar que ya existe una CSP estricta. Primero retirar inline y probar compatibilidad si se aborda.
- **Dependencias externas:** Bootstrap, iconos, FullCalendar, Chart.js y otros recursos se cargan por CDN. No se acreditó funcionamiento sin internet; considerar servir localmente las mismas versiones si se requiere una demo offline.
- **Clima:** proveedor no probado y credencial incrustada heredada en su JS. No copiarla a documentación ni considerarla una función institucional lista. Su eliminación/rotación/configuración segura queda pendiente si se conserva ese módulo.
- **Correo:** SMTP apagado, sin envío real validado. No mostrar envío exitoso como hecho real en el frontend.
- **Normativa:** falta validar formalmente festivos, cuatrimestres y horario conservados con la escuela. El PDF académico no acredita por sí solo una política institucional definitiva.
- **Históricos:** no tienen revisiones demostrables; no inventarlas ni habilitar PDF a partir del estado solamente. Importación de datos reales requeriría revisar compatibilidad con reglas nuevas.
- **Sesiones/límites:** login limitado en memoria por proceso; reiniciar limpia el contador. Las sesiones técnicas están en memoria y reiniciar Node exige login técnico nuevo. Logout revoca la cuenta, no únicamente una pestaña; son comportamientos actuales, no fallos visuales.
- **Despliegue:** Node se inicia en una terminal; no se configuró servicio de arranque automático, infraestructura productiva ni prueba de carga institucional. El motor actual se eligió para recuperación, no como decisión final de producción.
- **Respaldo:** copia local y restauración SQL aislada verificadas; falta copia externa/automatización y ensayo de recuperación de una máquina completa. No se hizo un borrado real del volumen de trabajo para probarla.
- **Auditoría/PDF:** historial protegido por los caminos de aplicación, sin sellado criptográfico contra administradores de BD. PDF sin firma electrónica certificada. Se conserva el alcance declarado.

No ampliar estos pendientes a una reescritura de backend dentro de una tarea visual. Si se encuentra un fallo reproducible, documentar pasos, corregir lo necesario y conservar los controles existentes.

## 12. Qué se recomienda hacer ahora en frontend

1. Abrir las vistas reales por rol y revisar escritorio/móvil; definir con el usuario el estilo visual antes de un cambio grande. Preservar identidad/logos de la escuela.
2. Unificar jerarquía visual, botones, tablas/tarjetas, badges de estados, inputs y mensajes. Distinguir claramente «Dar Vo.Bo.» de «Aprobar RH».
3. Mejorar calendario, formularios de un día y cupos por fecha, detalles con historial y disponibilidad del PDF; conservar eventos, selectores y validaciones.
4. Pulir RH y métricas, filtros visibles, estados vacíos/carga/error, resultados parciales, navegación y accesibilidad de teclado/foco/contraste.
5. Mejorar el panel técnico sin volver a permitir borrados o aprobar documentos saltando etapas. No convertir textos de éxito en promesas no confirmadas por API.
6. Retirar recursos legacy solo tras comprobar referencias. Evitar cambiar framework o introducir dependencias para lograr estilos corrientes.
7. Verificar el recorrido real después de cambios: docente crea → jefe Vo.Bo. → RH aprueba → docente descarga PDF; filtros/CSV, lote parcial, sesión y móvil.

Los cambios deben ser concretos y revisables. La autorización de frontend no incluye publicar en internet, enviar correos, usar datos reales, borrar bases o reemplazar la configuración de otros servicios.

## 13. Pruebas y respaldo

Con servidor y demo activos, ejecutar consecutivamente:

```sh
npm run check:security
npm run check:business
npm run check:documents
npm run db:verify
```

Pasaron 25+34+16 = **75 comprobaciones API/BD**. Los scripts crean y limpian fixtures propios, exigen API/BD locales demo y correo apagado. Evitar ejecutarlos mientras otro proceso cambia fixtures o datos usados para comparaciones.

También se comprobaron: 15 casos de calendario en Chromium UTC+9, nueve bloques del informe, lote real RH con resultado 2/3 y legado rechazado 409, pérdida de respuesta/recarga, móvil 390 px, XSS/CSV y ambos PDF descargados desde modales. Son pruebas dirigidas, no certificación de todos los escenarios.

Los scripts de navegador usados están en `/tmp/phase5-calendar-browser.cjs`, `/tmp/phase5-informe-browser.cjs`, `/tmp/phase5-rh-controlled.cjs`, `/tmp/phase5-rh-real.cjs` y `/tmp/phase4-real-pdf-browser.cjs`. Son artefactos locales, dependen de Playwright/Chromium instalado en este equipo y podrían no existir en una copia nueva. No introducir una suite enorme para un cambio de CSS; probar lo que afecte al cambio.

```sh
npm run db:backup
```

Respaldo ya verificado: `backups/demo-2026-10-20T23-08-09-516Z-7d14b3/`. Incluye `demo.sql`, `config.env`, accesos y manifiesto SHA-256, con permisos privados. El comando importa en una base temporal, compara estructura/conteos y elimina solo la temporal. No restaura automáticamente la demo ni copia archivos fuera del equipo. Mantener `backups/`, `.env`, `.local/` y SQL original fuera de Git.

## Mensaje sugerido para iniciar con el siguiente asistente

«Lee CONTEXTO_PARA_FRONTEND.md y revisa las vistas activas antes de editar. Quiero mejorar el frontend para presentar el proyecto; la recuperación, seguridad, reglas, historial y PDF ya están corregidos. Conserva backend, contratos, roles, helpers, datos y validaciones. Empieza por una revisión visual breve y realiza mejoras prácticas y coherentes. No migres de framework, no uses datos reales ni publiques nada. Prueba los flujos que afectes y explica qué cambiaste y qué queda pendiente.»
