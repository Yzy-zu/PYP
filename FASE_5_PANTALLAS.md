# Fase 5 — calendario, folios, autorización e informe

Fecha: 20 de octubre de 2026. API y MariaDB demo locales; navegación comprobada por Tailscale. Sin migraciones ni dependencias nuevas en esta fase.

## Calendarios y folios

El helper compartido `frontend/js/tramites.js` mantiene fechas civiles, folios e intervalos en docente, jefatura y RH. Los pases tienen inicio y fin con horas. Los permisos se muestran como día completo con final exclusivo, de forma que un rango histórico conserve todos sus días, incluso al cruzar de mes o año. Las nuevas solicitudes siguen limitadas a un solo día por fase 3. Referencia: [final exclusivo de eventos en FullCalendar](https://fullcalendar.io/docs/event-object).

Cada evento de trámite se identifica por tipo e ID: un pase y un permiso con el mismo número no se confunden. Los marcadores de festivo y cumpleaños no abren un expediente vacío. El docente conserva la acción de solicitar su beneficio desde el cumpleaños, con validación de fecha y día hábil del servidor.

Los cumpleaños se generan para el rango visible, sin depender del año en que se cargó la página ni duplicarse por múltiples expedientes del mismo usuario. El 29 de febrero se omite en años no bisiestos. Se usan fechas civiles y el día escolar de México para evitar desplazamientos en navegadores de otra zona.

Las pantallas y listados API usan `PASE-` o `PERM-` más el ID con un mínimo de ocho dígitos, igual que el PDF. Se eliminó el contador personal que agrupaba incorrectamente usuarios por `id_usuario` y cambiaba al ordenar. Los listados de pases ahora incluyen área de adscripción para informes y alertas.

## Autorización de RH

La vista canónica es `vistaRH.html`, con solicitudes por autorizar e historial. `vistaRHS.html` redirige a `vistaRH.html?view=autorizar`; no mantiene un DOM diferente con el mismo script. Los enlaces a autorizar e historial funcionan también en móvil.

Solo las solicitudes con Vo.Bo. muestran selección. «Seleccionar visibles» respeta los filtros. El lote se captura antes de enviarse, bloquea controles y dobles envíos, y mantiene la selección ante avisos de sockets. Los cambios pendientes se indican para actualizar la consulta.

Se reutiliza el PATCH protegido de cada trámite: cada aprobación tiene su propia transacción, verificación de Vo.Bo. e historial. No se añadió un segundo camino para saltarse las reglas. Se presenta resultado por folio, incluidos conflictos y aprobaciones parciales.

Si se pierde una respuesta, no se supone que la operación falló: se consulta el estado sin reenviar. Si falla también esa consulta, se informa la incertidumbre y se bloquean nuevos cambios hasta actualizar. Un lote no es una transacción global; las aprobaciones confirmadas permanecen aunque otra solicitud falle.

## Informe de RH

Se alinearon los controles HTML y JavaScript. Filtros, totales, gráficas, tablas y CSV utilizan los mismos registros. La fecha de referencia procede del servidor en `America/Mexico_City`. El periodo corresponde a uso del pase o inicio del permiso; los rangos históricos se atribuyen completos al periodo de inicio, sin prorratear.

| Indicador | Cálculo |
| --- | --- |
| Con inicio hoy | Trámites filtrados cuya fecha de uso/inicio es el día escolar |
| Días de permiso aprobados | Suma de `cantidad_dias` solo de permisos Aprobados |
| Horas de pase aprobadas | Suma de duración de pases Aprobados, expresada en horas |
| Trámites del periodo | Cantidad de registros que cumplen los filtros |
| Tasa de aprobación | Aprobados / (Aprobados + Rechazados); sin decisiones se indica expresamente |
| Vo.Bo. pendiente de RH | Registros con estado Vo.Bo., separado de Aprobado |

Se retiró la equivalencia inventada de un pase a 0.1 días. La tendencia agrupa todas las fechas filtradas en orden. Las personas se distinguen por ID, aunque compartan nombre. Las coincidencias comparan usuarios distintos de la misma área, fechas y horarios, incluyendo rangos históricos y estados Pendiente/Vo.Bo./Aprobado por separado; excluyen Cancelado/Rechazado y días inhábiles registrados. Son alertas de solicitudes, no evidencia de ausencia real ni deducciones de nómina.

El CSV contiene únicamente los registros filtrados, con folios estables, escape de comillas, comas y saltos de línea, y neutralización de fórmulas. Una consulta fallida no deja cifras parciales ni permite exportarlas. Si no carga Chart.js, permanecen los totales y tablas con aviso. El informe conserva el acceso exclusivo de RH.

## Navegación

La página informativa dirige al login. Las antiguas pantallas públicas de registro ahora explican cómo solicitar una cuenta institucional y no recogen datos para un alta que no pueden completar. La administración técnica sigue siendo quien crea cuentas. El clima tiene enlace de vuelta según perfil y representa respuestas externas como texto; no se probaron consultas reales a su proveedor externo.

Credenciales: `.local/ACCESOS_DEMO.md`, archivo local excluido de Git. No se modificaron las cuentas ni contraseñas demo. Se corrigió el recurso de favicon del docente.

## Validación

- **75 pruebas API/BD aprobadas** tras integrar los cambios: 25 de seguridad, 34 de reglas y 16 de documentos. Fixtures e historiales propios eliminados.
- **15 comprobaciones de calendario en Chromium UTC+9:** horarios, rango histórico entre años, fin exclusivo, mismo ID en dos tipos, folios, detalles, confirmación, cumpleaños por año y 29 de febrero, marcadores informativos y texto malicioso seguro. Sin escrituras en la demo.
- **9 bloques del informe en Chromium por Tailscale:** carga real, métricas controladas, filtros, CSV real, periodo vacío, móvil de 390 px, homónimos, horarios contiguos, ausencia de autochoques, errores de API y biblioteca gráfica no disponible.
- **RH controlado:** selección por filtros, sockets, doble clic, controles bloqueados, éxito + 409 + respuesta perdida con operación aplicada; pérdida simultánea de respuesta y recarga bloquea reenvío hasta actualizar. Paneles accesibles en móvil.
- **Lote real desde la interfaz:** pase y permiso con Vo.Bo. registrado aprobados; tercer trámite antiguo sin evidencia rechazado 409; solicitud Pendiente intacta. Exactamente tres PATCH, resultado 2/3 por folio y sin errores JavaScript. Fixtures limpiados.
- **Navegación adicional en navegador:** regreso del clima por los tres perfiles y sin sesión; texto externo sin ejecutar etiquetas; acceso público y redirección de registro. Recursos y enlaces locales revisados en doce páginas.
- Sintaxis JavaScript, `git diff --check`, separación de bases y estructura/conteos comprobados. Respaldo original conservado.

Las pruebas de navegador usan respuestas controladas para casos límite y API real para carga y aprobación; no constituyen una prueba de carga institucional. La fase 6 queda para ensayo completo, preparación de la presentación y recuperación. SMTP sigue desactivado y las limitaciones de despliegue señaladas en fases anteriores siguen vigentes.
