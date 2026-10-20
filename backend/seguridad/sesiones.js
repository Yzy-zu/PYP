const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const usuarios = require('../modelos/sqlLogin');
const rootSessions = new Map();
const roles = ['Docente', 'Administrador', 'RRHH'];

function datosPublicos(usuario) {
    const { contraseña, session_version, ...publicos } = usuario;
    return publicos;
}
function tokenUsuario(usuario) {
    return jwt.sign({ id: usuario.id, rol: usuario.rol, sv: usuario.session_version }, process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '4h' });
}
function tokenRoot() {
    const now = Date.now();
    for (const [id, expiry] of rootSessions) if (expiry <= now) rootSessions.delete(id);
    if (rootSessions.size >= 100) rootSessions.delete(rootSessions.keys().next().value);
    const jti = crypto.randomUUID();
    rootSessions.set(jti, now + 4 * 60 * 60 * 1000);
    return jwt.sign({ id: 'SYSADMIN', rol: 'Sysadmin', jti }, process.env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '4h' });
}
async function autenticar(token) {
    if (typeof token !== 'string' || token.length > 4096) throw new Error('INVALID_SESSION');
    const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!Number.isInteger(claims.exp)) throw new Error('INVALID_SESSION');
    if (claims.id === 'SYSADMIN') {
        if (claims.rol !== 'Sysadmin' || !rootSessions.has(claims.jti)) throw new Error('INVALID_SESSION');
        return { usuario: { id: 'SYSADMIN', rol: 'Sysadmin', nombre_completo: 'Administración técnica' }, claims };
    }
    if (!Number.isInteger(claims.id) || !Number.isInteger(claims.sv) || !roles.includes(claims.rol)) throw new Error('INVALID_SESSION');
    const usuario = await usuarios.buscarId(claims.id);
    if (!usuario || !usuario.activo || usuario.session_version !== claims.sv || usuario.rol !== claims.rol) throw new Error('INVALID_SESSION');
    return { usuario: datosPublicos(usuario), claims };
}
function revocarRoot(jti) { rootSessions.delete(jti); }
function cerrarSockets(req, usuarioId) { req.app.get('socketio')?.in(`usuario:${usuarioId}`).disconnectSockets(true); }
module.exports = { datosPublicos, tokenUsuario, tokenRoot, autenticar, revocarRoot, cerrarSockets, roles };
