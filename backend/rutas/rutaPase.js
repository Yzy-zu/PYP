const express = require('express');
const router = express.Router();
// Importamos el archivo del controlador de pases
const pasesControlador = require('../controladores/conPase');
// Importamos el archivo para validar tokens (sesión)
const validarToken = require('../validacion/valLogin');
const { soloRoles, tramite, cuerpoSimple } = require('../seguridad/acceso');
router.use(cuerpoSimple);
// Importamos validaciones específicas (por ejemplo, el límite de 3 pases o días festivos)
const validaciones = require('../validacion/valMes');
// Ruta para ver los pases del usuario logueado
router.get('/ver', validarToken, soloRoles('Docente'), pasesControlador.verMisPases);
// Ruta para crear un pase de salida mediante el método POST :v  Se incluye la validación de mes/día antes de llegar al controlador
router.post('/crear', validarToken, soloRoles('Docente'), pasesControlador.crearPase);
// Ruta para modificar un pase mediante el método patch 
router.patch('/mod', validarToken, soloRoles('Docente'), tramite('pases_salida', 'editar'), pasesControlador.modificarPase);
// Ruta para cancelar un pase mediante el método patchhh
router.patch('/cancelar', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), tramite('pases_salida', 'estado'), pasesControlador.cancelarPase);
router.get('/todos', validarToken, soloRoles('Administrador', 'RRHH'), pasesControlador.verTodos);

module.exports = router;
