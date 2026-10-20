const reglas = require('../negocio/reglas');
const tablas = { pase: 'pases_salida', permiso: 'permisos_goce' };
const camposSolicitud = {
    pase: ['fecha_uso', 'hora_inicio', 'hora_fin', 'motivo', 'fecha_solicitud'],
    permiso: ['tipo_permiso', 'fecha_inicio', 'fecha_fin', 'cantidad_dias', 'motivo', 'fecha_solicitud']
};
const camposPersona = ['id', 'nombre_completo', 'correo_institucional', 'rfc', 'fecha_nacimiento', 'fecha_ingreso', 'categoria', 'area_adscripcion', 'tipo_contrato'];
const folio = (tipo, id) => `${tipo === 'pase' ? 'PASE' : 'PERM'}-${String(id).padStart(8, '0')}`;
function solicitud(tipo, row) {
    return Object.fromEntries(camposSolicitud[tipo].map(key => [key,
        ['fecha_uso', 'fecha_inicio', 'fecha_fin'].includes(key) ? reglas.sqlFecha(row[key]) : row[key]
    ]));
}
function leerSnapshot(row) {
    return typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
}
function mismoContenido(tipo, actual, guardado) {
    // JSON de DATE/DATETIME debe ser estable antes y después de persistirlo.
    return JSON.stringify(solicitud(tipo, actual)) === JSON.stringify(guardado.solicitud);
}
async function ultimo(connection, tipo, id) {
    const [[row]] = await connection.execute('SELECT * FROM revisiones_tramites WHERE tipo_tramite=? AND tramite_id=? ORDER BY id DESC LIMIT 1', [tipo, id]);
    return row || null;
}
async function registrar(connection, tipo, id, actor, accion, estadoAnterior, anterior = null) {
    const [[row]] = await connection.execute(`SELECT * FROM ${tablas[tipo]} WHERE id=?`, [id]);
    const [[persona]] = await connection.execute(`SELECT ${camposPersona.join(',')} FROM usuarios WHERE id=?`, [row.usuario_id]);
    const fecha = new Date();
    let snapshot = {
        version: 1, tipo, id: Number(id), folio: folio(tipo, id),
        solicitante: Object.fromEntries(camposPersona.map(key => [key,
            ['fecha_nacimiento', 'fecha_ingreso'].includes(key) ? (persona[key] ? reglas.sqlFecha(persona[key]) : null) : persona[key]
        ])),
        solicitud: solicitud(tipo, row), visto_bueno: null, aprobacion: null
    };
    const revision = { nombre: actor.nombre_completo || 'Administración técnica', rol: actor.rol, fecha: fecha.toISOString() };
    if (accion === 'Vo.Bo.') snapshot.visto_bueno = revision;
    if (accion === 'Aprobado') {
        const previo = await ultimo(connection, tipo, id);
        const revisado = previo && leerSnapshot(previo);
        if (previo?.accion !== 'Vo.Bo.' || previo.origen !== 'aplicacion' || !revisado.visto_bueno || !mismoContenido(tipo, row, revisado)) {
            reglas.fallo('Falta un Vo.Bo. verificable sobre este contenido. Administración debe devolver la solicitud a Pendiente para repetir la revisión.', 409);
        }
        snapshot = { ...revisado, aprobacion: revision };
    }
    if (anterior) snapshot.anterior = { estado: anterior.estado, solicitud: solicitud(tipo, anterior) };
    await connection.execute(`INSERT INTO revisiones_tramites
        (tipo_tramite,tramite_id,propietario_id,accion,estado_anterior,estado_nuevo,actor_id,actor_nombre,actor_rol,fecha,origen,snapshot)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [tipo, id, row.usuario_id, accion, estadoAnterior, row.estado, String(actor.id), revision.nombre, actor.rol, fecha,
            actor.rol === 'Sysadmin' ? 'sysadmin' : 'aplicacion', JSON.stringify(snapshot)]);
    return snapshot;
}
module.exports = { tablas, folio, ultimo, registrar, leerSnapshot, mismoContenido };
