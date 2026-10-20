const pool = require('../bd/base');
const reglas = require('./reglas');
const historial = require('../documentos/historial');
const tablas = { pase: 'pases_salida', permiso: 'permisos_goce' };

async function conUsuario(id, work) {
    const connection = await pool.getConnection();
    try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        // Orden único para las escrituras de un docente: primero su fila, luego el trámite.
        const [[usuario]] = await connection.execute('SELECT id,activo,fecha_nacimiento FROM usuarios WHERE id=? FOR UPDATE', [id]);
        if (!usuario?.activo) reglas.fallo('La cuenta no está disponible.', 409);
        const result = await work(connection, usuario);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { connection.release(); }
}

async function contadores(usuarioId, dia = reglas.hoy(), connection = pool, exclude = {}) {
    const { mes, cuatrimestre, anio } = reglas.periodos(dia);
    const excludedPase = exclude.tipo === 'pase' ? exclude.id : 0;
    const excludedPermiso = exclude.tipo === 'permiso' ? exclude.id : 0;
    const [[data]] = await connection.execute(`SELECT
        (SELECT COUNT(*) FROM pases_salida WHERE usuario_id=? AND fecha_uso>=? AND fecha_uso<? AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>?) AS pases,
        (SELECT COUNT(*) FROM permisos_goce WHERE usuario_id=? AND fecha_inicio>=? AND fecha_inicio<? AND tipo_permiso<>'Cumpleaños' AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>?) AS permisos,
        (SELECT COUNT(*) FROM permisos_goce WHERE usuario_id=? AND fecha_inicio>=? AND fecha_inicio<? AND tipo_permiso='Cumpleaños' AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>?) AS cumpleanos`,
    [usuarioId, ...mes, excludedPase, usuarioId, ...cuatrimestre, excludedPermiso, usuarioId, ...anio, excludedPermiso]);
    const saldo = (usados, limite) => ({ usados: Number(usados), disponibles: Math.max(0, limite - Number(usados)) });
    return { fecha: dia, pases: saldo(data.pases, 3), permisos: saldo(data.permisos, 3), cumpleanos: saldo(data.cumpleanos, 1) };
}

async function disponibilidad(connection, usuarioId, tipo, values, estado, id = 0) {
    if (!reglas.activos.includes(estado)) return;
    const dia = tipo === 'pase' ? values.fecha_uso : values.fecha_inicio;
    const [[ocupado]] = await connection.execute(`SELECT
        EXISTS(SELECT id FROM pases_salida WHERE usuario_id=? AND fecha_uso=? AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>?) AS pase,
        EXISTS(SELECT id FROM permisos_goce WHERE usuario_id=? AND fecha_inicio<=? AND fecha_fin>=? AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>?) AS permiso`,
        [usuarioId, dia, tipo === 'pase' ? id : 0, usuarioId, dia, dia, tipo === 'permiso' ? id : 0]);
    if (ocupado.pase || ocupado.permiso) reglas.fallo('Ya tienes un trámite activo para esta fecha.', 409);
    const saldo = await contadores(usuarioId, dia, connection, { tipo, id });
    if (tipo === 'pase' && saldo.pases.disponibles < 1) reglas.fallo('Límite mensual: solo puedes solicitar 3 pases por mes.', 409);
    if (tipo === 'permiso' && values.tipo_permiso === 'Cumpleaños' && saldo.cumpleanos.disponibles < 1) reglas.fallo('Ya tienes un permiso de cumpleaños activo en ese año.', 409);
    if (tipo === 'permiso' && values.tipo_permiso !== 'Cumpleaños' && saldo.permisos.disponibles < 1) reglas.fallo('Límite cuatrimestral: solo puedes solicitar 3 permisos ordinarios por cuatrimestre.', 409);
}

async function guardar(tipo, body, actor, id = null, administrativo = false) {
    const tabla = tablas[tipo];
    if (!tabla) throw new Error('Tipo de trámite inválido.');
    let owner = actor.id;
    if (administrativo) {
        const [[row]] = await pool.execute(`SELECT usuario_id FROM ${tabla} WHERE id=?`, [id]);
        if (!row) reglas.fallo('Trámite no encontrado.', 404);
        owner = row.usuario_id;
    }
    return conUsuario(owner, async (connection, usuario) => {
        let previo;
        if (id) {
            [[previo]] = await connection.execute(`SELECT * FROM ${tabla} WHERE id=? FOR UPDATE`, [id]);
            if (!previo || previo.usuario_id !== owner) reglas.fallo('Trámite no disponible.', 404);
            if (!administrativo && previo.estado !== 'Pendiente') reglas.fallo('Solo puedes editar solicitudes propias pendientes.', 403);
        }
        const estado = administrativo ? body.estado : 'Pendiente';
        if (!['Pendiente', 'Vo.Bo.', 'Aprobado', 'Rechazado', 'Cancelado'].includes(estado)) reglas.fallo('Estado inválido.');
        const values = await reglas.validar(connection, tipo, body, usuario);
        await disponibilidad(connection, owner, tipo, values, estado, id || 0);
        const keys = Object.keys(values);
        if (id) {
            const [result] = await connection.execute(`UPDATE ${tabla} SET ${keys.map(k => `${k}=?`).join(',')}${administrativo ? ',estado=?' : ''} WHERE id=? AND usuario_id=? AND estado=?`,
                [...Object.values(values), ...(administrativo ? [estado] : []), id, owner, previo.estado]);
            if (!result.affectedRows) reglas.fallo('El trámite cambió. Actualiza la pantalla.', 409);
            await historial.registrar(connection, tipo, id, actor, administrativo ? 'Ajuste administrativo' : 'Edición', previo.estado, previo);
            return { id: Number(id), usuario_id: owner, estado };
        }
        const [result] = await connection.execute(`INSERT INTO ${tabla} (usuario_id,${keys.join(',')}) VALUES (?,${keys.map(() => '?').join(',')})`, [owner, ...Object.values(values)]);
        await historial.registrar(connection, tipo, result.insertId, actor, 'Solicitud', null);
        return { id: result.insertId, usuario_id: owner, estado };
    });
}

async function cambiarEstado(tabla, estado, id, actor, estadoAnterior) {
    const tipo = Object.keys(tablas).find(key => tablas[key] === tabla);
    if (!tipo) throw new Error('Tabla no autorizada.');
    const [[row]] = await pool.execute(`SELECT usuario_id FROM ${tabla} WHERE id=?`, [id]);
    if (!row) return false;
    return conUsuario(row.usuario_id, async connection => {
        const [[previo]] = await connection.execute(`SELECT * FROM ${tabla} WHERE id=? FOR UPDATE`, [id]);
        if (!previo || previo.estado !== estadoAnterior || (actor.rol === 'Docente' && previo.usuario_id !== actor.id)) return false;
        const values = { ...previo, fecha_uso: reglas.sqlFecha(previo.fecha_uso), fecha_inicio: reglas.sqlFecha(previo.fecha_inicio) };
        await disponibilidad(connection, row.usuario_id, tipo, values, estado, Number(id));
        const [result] = await connection.execute(`UPDATE ${tabla} SET estado=?,revisado_por=?,fecha_revision=NOW() WHERE id=? AND estado=?`, [estado, actor.id, id, estadoAnterior]);
        if (result.affectedRows) await historial.registrar(connection, tipo, id, actor, estado, estadoAnterior);
        return result.affectedRows > 0;
    });
}

module.exports = { guardar, cambiarEstado, contadores };
