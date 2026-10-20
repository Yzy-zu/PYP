const express = require('express');
const router = express.Router();
//importamos el archivo del controlador donde sucede la logica
const loginControlador = require('../controladores/conLogin');
const validarToken = require('../validacion/valLogin');
const { soloRoles, cuerpoSimple } = require('../seguridad/acceso');
const { limitarLogin } = require('../seguridad/credenciales');
router.use(cuerpoSimple);
//en el archivo anterior server.js, tomo /api/login... este archivo se queda con el resto de la url que es "2" 
//por ser el id de ejemplo de un usuario
//si ves, manda la solicitud ahora a loginControlador y usa la funcion verPerfil que esa dentro de ese archivo
router.post('/login', limitarLogin, loginControlador.iniciarLogin);
//ruta para obtener los datos por medio del id, pero primero verificamos que este logueado
router.get('/perfil', validarToken, loginControlador.verPerfil);
//ruta para actualizar contraseña pero primero verificamos que este logueado :v
router.patch('/npassword', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), loginControlador.acContraseña);
//ruta para revalidar los tokem si es que bam a expirar
router.get('/ntoken', validarToken, loginControlador.nuevoToken);
router.get('/contadores', validarToken, soloRoles('Docente'), loginControlador.obtenerContadores);
router.post('/logout', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), loginControlador.logout);


module.exports = router;
