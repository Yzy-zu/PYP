# Fase 3 — reglas de solicitudes

Fecha: 20 de octubre de 2026. Entorno: API local, MariaDB de demo y correo desactivado.

## Reglas confirmadas

Las respuestas del autor resuelven las contradicciones del PDF y de las pantallas anteriores:

| Concepto | Regla aplicada |
| --- | --- |
| Pases | Tres por mes de la fecha de uso, distinguiendo el año |
| Permisos ordinarios | Tres solicitudes por cuatrimestre; cada una de un solo día completo |
| Tipos ordinarios | Personal, Salud e Institucional comparten el cupo ordinario |
| Cumpleaños | Un permiso adicional por año; exactamente el mes/día del nacimiento registrado; un día completo |
| Cumpleaños inhábil | No se solicita en sábado, domingo ni festivo registrado; no se traslada |
| Revisión | Jefatura da Vo.Bo.; RH aprueba después. Jefatura revisa todas las áreas |
| Reserva de cupo | Pendiente, Vo.Bo. y Aprobado cuentan; Rechazado y Cancelado liberan cupo |

Se conservan los cuatrimestres del sistema original: enero–abril, mayo–agosto y septiembre–diciembre. También se conserva el horario de pases de 07:00 a 20:00 y la duración máxima de tres horas. Estos periodos y horarios deberán contrastarse con el calendario institucional antes de una implantación escolar.

No se admite más de un trámite activo por docente y fecha, incluyendo la combinación de pase y permiso. Las solicitudes nuevas y las ediciones no pueden usar fechas pasadas. La referencia de «hoy» es `America/Mexico_City` y se entrega a la interfaz desde el servidor. La aprobación de una solicitud ya presentada no impone de nuevo el requisito de fecha futura.

## Cambios

La lógica común de `backend/negocio` comprueba creación, edición y ajustes administrativos. Calcula los cupos del periodo solicitado; no usa el mes actual para una solicitud futura. Al editar excluye únicamente el registro que se está cambiando. La cantidad de días enviada por el navegador no decide el beneficio: el servidor calcula uno y exige que inicio y fin coincidan.

Las escrituras de solicitudes y cambios de estado se ejecutan en transacciones, bloqueando primero la fila del solicitante. Se usa aislamiento READ COMMITTED para que una segunda solicitud espere y lea el cupo actualizado. Así se evita aceptar dos peticiones simultáneas para el último espacio o la misma fecha.

La migración 003 reemplaza los tres triggers heredados por cuatro: INSERT y UPDATE de pases y permisos. Comprueba cupos, estados activos, cumpleaños, días hábiles, horarios, duración y colisiones. Añade dos índices por usuario/fecha. `setup:local` y `db:up` la aplican a la demo; la base de respaldo conserva sus triggers originales.

La pantalla docente ofrece el tipo Cumpleaños y permite abrirlo desde su marcador en el calendario. Los permisos muestran un día y mantienen la fecha final igual a la inicial. Las barras distinguen pases, permisos ordinarios y cumpleaños, mostrando a qué periodo corresponden. Se corrigió el cálculo de fechas para navegadores en otra zona horaria y la exclusión del propio registro al editar.

## Validación

Las comprobaciones integradas usan exclusivamente la API local y la BD demo, con correo desactivado. Crean cuentas, trámites y un festivo propios, y los eliminan al terminar. No se ejecutan simultáneamente entre suites.

- Suite de reglas: 34 comprobaciones aprobadas. Cupos por fecha/año, estados, creación/edición, cumpleaños adicional y exacto, días inhábiles, horarios, cantidad manipulada, colisiones, overrides administrativos, escrituras SQL y concurrencia para último cupo/fecha/cumpleaños.
- Suite de seguridad: 25 comprobaciones aprobadas tras integrar las reglas; accesos, sesiones, propiedad y transiciones de revisión.
- Chromium real: 9 comprobaciones aprobadas, sin errores JavaScript, incluyendo permisos de un día, cumpleaños, sábado, contadores, edición y navegador configurado en Asia/Tokyo. Sin crear ni modificar solicitudes demo.
- `db:verify`: aprobado después de limpiar fixtures. Respaldo: 39 usuarios, 2 pases, 65 permisos y 9 festivos; demo: 4 usuarios, 2 pases, 3 permisos y 9 festivos. Estructuras esperadas y separación verificadas. El SHA-256 del SQL recibido sigue siendo `6c6d9a0fa3ea604e296c678aca7fef75726f7dbd5622b92c0215dcfd41e22800`.

Comandos reproducibles desde la raíz, con el servidor iniciado:

```sh
npm run check:security
npm run check:business
npm run db:verify
```

## Límites y siguiente fase

Los festivos se toman de la tabla local; no se descarga ni se presume un calendario institucional actualizado. Un nacimiento el 29 de febrero solo admite esa fecha en un año bisiesto y si es laborable; no hay traslado.

Los triggers no rechazan fechas históricas por sí solos; esa restricción se aplica al crear/editar por API. Tampoco corrigen retroactivamente registros del respaldo. Una futura importación de datos reales requiere revisar su compatibilidad con las reglas confirmadas antes de activar las nuevas validaciones. La garantía de concurrencia comprobada corresponde a las rutas transaccionales de la aplicación; los triggers son una defensa adicional para escrituras SQL.

El registro separado de Vo.Bo. y aprobación final, la conservación del contenido autorizado y la generación de PDF desde datos confiables siguen en fase 4. La corrección de métricas, intervalos de calendario y demás pantallas pendientes sigue en fase 5. Esta fase no acredita todavía un despliegue escolar.
