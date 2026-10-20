const { Router } = require('express');
const rootCtrl = require('../controladores/conRoot');
const validarToken = require('../validacion/valLogin');
const { cuerpoSimple } = require('../seguridad/acceso');
const { limitarLogin } = require('../seguridad/credenciales');
const { revocarRoot } = require('../seguridad/sesiones');

const router = Router();

router.use(cuerpoSimple);
router.post('/login', limitarLogin, rootCtrl.loginSysadmin);

const checkSysadmin = (req, res, next) => {
    if (req.usuario.rol !== 'Sysadmin' || req.usuario.id !== 'SYSADMIN') {
        return res.status(403).json({ ok: false, msg: 'SYS_DENIED' });
    }
    next();
};

router.use(validarToken, checkSysadmin);
router.get('/sesion', (req, res) => res.json({ ok: true, usuario: req.usuario }));
router.post('/logout', (req, res) => { revocarRoot(req.sesion.jti); res.json({ ok: true }); });
router.param('id', (req, res, next, value) => {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ ok: false, msg: 'Identificador inválido.' });
    next();
});

router.get('/usuarios', rootCtrl.getUsuarios);
router.get('/usuarios/:id', rootCtrl.getUsuarioId);
router.post('/usuarios', rootCtrl.crearUsuario);
router.patch('/usuarios/:id', rootCtrl.editarUsuario);
router.patch('/usuarios/resetpass/:id', rootCtrl.resetPass);
router.patch('/usuarios/rol/:id', rootCtrl.cambiarRol);
router.delete('/usuarios/:id', rootCtrl.eliminarUsuario);
router.get('/pases', rootCtrl.getPases);
router.patch('/pases/override/:id', rootCtrl.overridePase);
router.delete('/pases/:id', rootCtrl.eliminarPase);
router.get('/permisos', rootCtrl.getPermisos);
router.patch('/permisos/override/:id', rootCtrl.overridePermiso);
router.delete('/permisos/:id', rootCtrl.eliminarPermiso);
router.get('/dias', rootCtrl.getDias);
router.post('/dias', rootCtrl.crearDia);
router.delete('/dias/:id', rootCtrl.eliminarDia);

module.exports = router;
