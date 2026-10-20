const bcrypt = require('bcryptjs');
const usersql = require('../modelos/sqlLogin');
const db = require('../bd/base');
const { datosPublicos, tokenUsuario, cerrarSockets } = require('../seguridad/sesiones');
const { passwordValida } = require('../seguridad/credenciales');

const loginControlador = {
    verPerfil: (req, res) => res.json({ ok: true, data: req.usuario }),
    iniciarLogin: async (req, res) => {
        const { correo, password } = req.body || {};
        if (typeof correo !== 'string' || correo.length > 250 || typeof password !== 'string' || Buffer.byteLength(password) > 72) {
            return res.status(400).json({ ok: false, msg: 'Correo o contraseña inválidos.' });
        }
        try {
            const usuario = await usersql.buscarCorreo(correo.trim());
            if (!usuario || !usuario.activo || !await bcrypt.compare(password, usuario.contraseña)) {
                return res.status(401).json({ ok: false, msg: 'Datos incorrectos.' });
            }
            res.json({ ok: true, usuario: datosPublicos(usuario), token: tokenUsuario(usuario) });
        } catch { res.status(503).json({ ok: false, msg: 'No se pudo iniciar sesión.' }); }
    },
    nuevoToken: async (req, res) => {
        if (req.usuario.id === 'SYSADMIN') return res.status(403).json({ ok: false, msg: 'Usa el acceso de administración técnica.' });
        try {
            const usuario = await usersql.buscarId(req.usuario.id);
            if (!usuario?.activo || usuario.session_version !== req.sesion.sv || usuario.rol !== req.sesion.rol) {
                return res.status(401).json({ ok: false, msg: 'La sesión cambió. Ingresa de nuevo.' });
            }
            res.json({ ok: true, usuario: datosPublicos(usuario), token: tokenUsuario(usuario) });
        } catch { res.status(503).json({ ok: false, msg: 'No se pudo renovar la sesión.' }); }
    },
    acContraseña: async (req, res) => {
        const { password, npassword } = req.body || {};
        if (typeof password !== 'string' || Buffer.byteLength(password) > 72 || !passwordValida(npassword) || password === npassword) {
            return res.status(400).json({ ok: false, msg: 'Usa una contraseña diferente, de al menos 10 caracteres y hasta 72 bytes.' });
        }
        try {
            const usuario = await usersql.buscarId(req.usuario.id);
            if (!usuario || !await bcrypt.compare(password, usuario.contraseña)) {
                return res.status(401).json({ ok: false, msg: 'Contraseña actual incorrecta.' });
            }
            const hash = await bcrypt.hash(npassword, 10);
            const [changed] = await db.execute(`UPDATE usuarios SET contraseña=?,session_version=session_version+1,debe_cambiar_password=0
                WHERE id=? AND activo=1 AND session_version=?`, [hash, usuario.id, req.sesion.sv]);
            if (!changed.affectedRows) return res.status(409).json({ ok: false, msg: 'La cuenta cambió. Ingresa de nuevo.' });
            cerrarSockets(req, usuario.id);
            const actual = await usersql.buscarId(usuario.id);
            res.json({ ok: true, msg: 'Contraseña actualizada.', token: tokenUsuario(actual), usuario: datosPublicos(actual) });
        } catch { res.status(503).json({ ok: false, msg: 'No se pudo cambiar la contraseña.' }); }
    },
    logout: async (req, res) => {
        await db.execute('UPDATE usuarios SET session_version=session_version+1 WHERE id=? AND session_version=?', [req.usuario.id, req.sesion.sv]);
        cerrarSockets(req, req.usuario.id);
        res.json({ ok: true });
    },
    obtenerContadores: async (req, res) => {
        try {
            const [pases, permisos] = await Promise.all([
                require('../modelos/sqlPase').contarPasesMensuales(req.usuario.id),
                require('../modelos/sqlPermiso').contarPermisosCuatrimestrales(req.usuario.id)
            ]);
            res.json({ ok: true, pases: { usados: pases, disponibles: Math.max(0, 3 - pases) }, permisos: { usados: permisos, disponibles: Math.max(0, 3 - permisos) } });
        } catch { res.status(503).json({ ok: false, msg: 'No se pudieron obtener los contadores.' }); }
    }
};
module.exports = loginControlador;
