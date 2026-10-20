const db = require('../bd/base');
const soloRoles = (...roles) => (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) return res.status(403).json({ ok: false, msg: 'Acción no autorizada para este perfil.' });
    next();
};
function tramite(tabla, accion) {
    if (!['pases_salida', 'permisos_goce'].includes(tabla)) throw new Error('Tabla no autorizada.');
    return async (req, res, next) => {
        const id = Number(req.body?.id);
        if (!Number.isSafeInteger(id) || id < 1 || !['number', 'string'].includes(typeof req.body.id)) return res.status(400).json({ ok: false, msg: 'Identificador inválido.' });
        try {
            const [[registro]] = await db.execute(`SELECT id,usuario_id,estado FROM ${tabla} WHERE id=?`, [id]);
            if (!registro) return res.status(404).json({ ok: false, msg: 'Trámite no disponible.' });
            const { rol, id: actor } = req.usuario;
            if (rol === 'Docente' && registro.usuario_id !== actor) return res.status(404).json({ ok: false, msg: 'Trámite no disponible.' });
            const nuevo = req.body.cancelar;
            let permitido = false;
            if (accion === 'editar') permitido = rol === 'Docente' && registro.estado === 'Pendiente';
            else if (rol === 'Docente') permitido = registro.estado === 'Pendiente' && nuevo === 'Cancelado';
            else if (rol === 'Administrador') permitido = registro.estado === 'Pendiente' && ['Vo.Bo.', 'Rechazado'].includes(nuevo);
            else if (rol === 'RRHH') permitido = registro.estado === 'Vo.Bo.' && ['Aprobado', 'Rechazado'].includes(nuevo);
            if (!permitido) return res.status(403).json({ ok: false, msg: 'Acción no permitida para este perfil y estado.' });
            req.tramite = registro;
            next();
        } catch { res.status(503).json({ ok: false, msg: 'No se pudo comprobar el acceso al trámite.' }); }
    };
}
async function cambiarEstado(tabla, estado, id, actor, estadoAnterior) {
    if (!['pases_salida', 'permisos_goce'].includes(tabla)) throw new Error('Tabla no autorizada.');
    const params = [estado, actor.id, id, estadoAnterior];
    let where = 'id=? AND estado=?';
    if (actor.rol === 'Docente') { where += ' AND usuario_id=?'; params.push(actor.id); }
    const [result] = await db.execute(`UPDATE ${tabla} SET estado=?,revisado_por=?,fecha_revision=NOW() WHERE ${where}`, params);
    return result.affectedRows > 0;
}
function notificar(req, evento, data, usuarioId) {
    const destino = req.app.get('socketio').to('revision').to(`usuario:${usuarioId}`);
    destino.emit(evento, data);
    destino.emit('actualizar-contadores');
}
function cuerpoSimple(req, res, next) {
    if (req.body === undefined) req.body = {};
    if (!req.body || Array.isArray(req.body) || Object.values(req.body).some(v => v !== null && !['string', 'number', 'boolean'].includes(typeof v))) {
        return res.status(400).json({ ok: false, msg: 'Formato de datos inválido.' });
    }
    next();
}
module.exports = { soloRoles, tramite, cambiarEstado, notificar, cuerpoSimple };
