const db = require('../bd/base');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { tokenRoot, datosPublicos, cerrarSockets, roles } = require('../seguridad/sesiones');
const { passwordValida } = require('../seguridad/credenciales');

const areas = ['Tecnologías de la Información', 'Gastronomía', 'Enfermería', 'Energías Renovables', 'Mantenimiento Industrial', 'Contabilidad'];
const categorias = ['Profesor de Asignatura', 'Profesor de Tiempo Completo', 'Técnico Académico', 'Administrativo'];
const contratos = ['Determinado', 'Indeterminado'];
const estados = ['Pendiente', 'Vo.Bo.', 'Aprobado', 'Rechazado', 'Cancelado'];
const tipos = ['Cumpleaños', 'Personal', 'Salud', 'Institucional'];

function invalid(message = 'Datos inválidos') {
    const error = new Error(message);
    error.status = 400;
    throw error;
}

function texto(value, max = 250) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) invalid();
    return value.trim();
}

function fecha(value, nullable = false) {
    if (nullable && (value === null || value === '')) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Fecha inválida');
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('Fecha inválida');
    return value;
}

function seleccion(value, list, nullable = false) {
    if (nullable && (value === null || value === '')) return null;
    if (typeof value !== 'string' || !list.includes(value)) invalid();
    return value;
}

function hora(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) invalid('Hora inválida');
    return value;
}

function claveTemporal() {
    return `Tmp-${crypto.randomBytes(15).toString('base64url')}`;
}

function secretoIgual(value, expected) {
    if (typeof value !== 'string' || typeof expected !== 'string') return false;
    const digest = text => crypto.createHash('sha256').update(text).digest();
    return crypto.timingSafeEqual(digest(value), digest(expected));
}

function camposUsuario(body, partial = false) {
    const rules = {
        nombre_completo: value => texto(value),
        correo_institucional: value => {
            const correo = texto(value).toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) invalid('Correo inválido');
            return correo;
        },
        rol: value => seleccion(value, roles),
        rfc: value => value === null || value === '' ? null : texto(value, 13),
        fecha_nacimiento: value => fecha(value, true),
        fecha_ingreso: value => fecha(value, true),
        categoria: value => seleccion(value, categorias, true),
        area_adscripcion: value => seleccion(value, areas, true),
        tipo_contrato: value => seleccion(value, contratos, true),
        activo: value => {
            if (![true, false, 0, 1].includes(value)) invalid();
            return Number(value);
        }
    };
    const result = {};
    if (!partial) Object.assign(result, { rol: 'Docente', rfc: null, fecha_nacimiento: null, fecha_ingreso: null,
        categoria: categorias[0], area_adscripcion: areas[0], tipo_contrato: contratos[0], activo: 1 });
    for (const [key, transform] of Object.entries(rules)) {
        if (Object.hasOwn(body, key)) result[key] = transform(body[key]);
    }
    if (!partial && (!result.nombre_completo || !result.correo_institucional)) invalid('Nombre y correo son obligatorios');
    return result;
}

function endpoint(work) {
    return async (req, res) => {
        try { await work(req, res); }
        catch (error) {
            if (error.status === 400) return res.status(400).json({ ok: false, msg: error.message });
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, msg: 'El registro ya existe' });
            res.status(500).json({ ok: false, msg: 'No se pudo completar la operación' });
        }
    };
}

async function actualizarUsuario(req, res, values) {
    const keys = Object.keys(values);
    if (!keys.length) invalid('No hay cambios válidos');
    const [result] = await db.execute(`UPDATE usuarios SET ${keys.map(key => `${key} = ?`).join(', ')},
        session_version = session_version + 1 WHERE id = ?`, [...Object.values(values), req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
    await cerrarSockets(req, Number(req.params.id));
    res.json({ ok: true });
}

const rootControlador = {
    loginSysadmin: endpoint(async (req, res) => {
        const { user, pass } = req.body;
        const validUser = secretoIgual(user, process.env.ROOT_USER);
        const validPass = secretoIgual(pass, process.env.ROOT_PASS);
        if (!validUser || !validPass) return res.status(401).json({ ok: false, msg: 'Credenciales incorrectas' });
        res.json({ ok: true, token: tokenRoot(), usuario: { id: 'SYSADMIN', rol: 'Sysadmin', nombre_completo: 'Administración técnica' } });
    }),
    getUsuarios: endpoint(async (req, res) => {
        const [data] = await db.query(`SELECT id, nombre_completo, correo_institucional, rol,
            area_adscripcion, activo, debe_cambiar_password FROM usuarios ORDER BY id`);
        res.json({ ok: true, data });
    }),
    getUsuarioId: endpoint(async (req, res) => {
        const [data] = await db.execute('SELECT * FROM usuarios WHERE id = ?', [req.params.id]);
        if (!data.length) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
        res.json({ ok: true, data: datosPublicos(data[0]) });
    }),
    crearUsuario: endpoint(async (req, res) => {
        const values = camposUsuario(req.body);
        const provided = req.body.contraseña;
        const temporary = provided === undefined || provided === '' ? claveTemporal() : null;
        const password = temporary || provided;
        if (!passwordValida(password)) invalid('La contraseña debe tener al menos 10 caracteres y hasta 72 bytes');
        values.contraseña = await bcrypt.hash(password, 10);
        values.debe_cambiar_password = 1;
        const keys = Object.keys(values);
        const [created] = await db.execute(`INSERT INTO usuarios (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, Object.values(values));
        res.json({ ok: true, id: created.insertId, debe_cambiar_password: true, ...(temporary ? { passwordTemporal: temporary } : {}) });
    }),
    editarUsuario: endpoint(async (req, res) => {
        const values = camposUsuario(req.body, true);
        if (req.body.contraseña !== undefined && req.body.contraseña !== '') {
            if (!passwordValida(req.body.contraseña)) invalid('La contraseña debe tener al menos 10 caracteres y hasta 72 bytes');
            values.contraseña = await bcrypt.hash(req.body.contraseña, 10);
            values.debe_cambiar_password = 1;
        }
        await actualizarUsuario(req, res, values);
    }),
    resetPass: endpoint(async (req, res) => {
        const passwordTemporal = claveTemporal();
        const hash = await bcrypt.hash(passwordTemporal, 10);
        const [result] = await db.execute(`UPDATE usuarios SET contraseña = ?, debe_cambiar_password = 1,
            session_version = session_version + 1 WHERE id = ?`, [hash, req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });
        await cerrarSockets(req, Number(req.params.id));
        res.json({ ok: true, passwordTemporal, debe_cambiar_password: true });
    }),
    cambiarRol: endpoint(async (req, res) => {
        await actualizarUsuario(req, res, { rol: seleccion(req.body.rol, roles) });
    }),
    eliminarUsuario: endpoint(async (req, res) => {
        await actualizarUsuario(req, res, { activo: 0 });
    }),
    getPases: endpoint(async (req, res) => {
        const [data] = await db.query('SELECT * FROM pases_salida');
        res.json({ ok: true, data });
    }),
    overridePase: endpoint(async (req, res) => {
        const b = req.body;
        const [result] = await db.execute(`UPDATE pases_salida SET fecha_uso = ?, hora_inicio = ?, hora_fin = ?, estado = ?, motivo = ? WHERE id = ?`,
            [fecha(b.fecha_uso), hora(b.hora_inicio), hora(b.hora_fin), seleccion(b.estado, estados), texto(b.motivo, 10000), req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Pase no encontrado' });
        res.json({ ok: true });
    }),
    eliminarPase: endpoint(async (req, res) => {
        const [result] = await db.execute('DELETE FROM pases_salida WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Pase no encontrado' });
        res.json({ ok: true });
    }),
    getPermisos: endpoint(async (req, res) => {
        const [data] = await db.query('SELECT * FROM permisos_goce');
        res.json({ ok: true, data });
    }),
    overridePermiso: endpoint(async (req, res) => {
        const b = req.body;
        const cantidad = typeof b.cantidad_dias === 'string' && /^\d+$/.test(b.cantidad_dias)
            ? Number(b.cantidad_dias) : b.cantidad_dias;
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 366) invalid('Cantidad de días inválida');
        const [result] = await db.execute(`UPDATE permisos_goce SET tipo_permiso = ?, fecha_inicio = ?, fecha_fin = ?, cantidad_dias = ?, estado = ? WHERE id = ?`,
            [seleccion(b.tipo_permiso, tipos), fecha(b.fecha_inicio), fecha(b.fecha_fin), cantidad, seleccion(b.estado, estados), req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Permiso no encontrado' });
        res.json({ ok: true });
    }),
    eliminarPermiso: endpoint(async (req, res) => {
        const [result] = await db.execute('DELETE FROM permisos_goce WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Permiso no encontrado' });
        res.json({ ok: true });
    }),
    getDias: endpoint(async (req, res) => {
        const [data] = await db.query('SELECT * FROM dias_festivos');
        res.json({ ok: true, data });
    }),
    crearDia: endpoint(async (req, res) => {
        await db.execute('INSERT INTO dias_festivos (fecha, descripcion) VALUES (?, ?)', [fecha(req.body.fecha), texto(req.body.descripcion)]);
        res.json({ ok: true });
    }),
    eliminarDia: endpoint(async (req, res) => {
        const [result] = await db.execute('DELETE FROM dias_festivos WHERE id = ?', [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Festivo no encontrado' });
        res.json({ ok: true });
    })
};

module.exports = rootControlador;
