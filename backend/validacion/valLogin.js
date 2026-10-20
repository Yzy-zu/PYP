const { autenticar } = require('../seguridad/sesiones');

async function validarToken(req, res, next) {
    try {
        const { usuario, claims } = await autenticar(req.header('x-token'));
        req.usuario = usuario;
        req.sesion = claims;
        const permitidas = ['/api/login/perfil', '/api/login/ntoken', '/api/login/npassword', '/api/login/logout'];
        if (usuario.debe_cambiar_password && !permitidas.includes(req.originalUrl.split('?')[0])) {
            return res.status(403).json({ ok: false, code: 'PASSWORD_CHANGE_REQUIRED', msg: 'Debes cambiar la contraseña temporal.' });
        }
        next();
    } catch (error) {
        if (error.code?.startsWith('ER_') || ['ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)) {
            return res.status(503).json({ ok: false, msg: 'No se pudo comprobar la sesión.' });
        }
        res.status(401).json({ ok: false, msg: 'Sesión inválida o vencida. Inicia sesión de nuevo.' });
    }
}
module.exports = validarToken;
