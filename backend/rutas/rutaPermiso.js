const express = require('express');
const router = express.Router();
//Importamos el archivo del controlador 
const permisosControlador = require('../controladores/conPermiso');
//importamos el archivo para validar tokens(sesion)
const validarToken = require('../validacion/valLogin');
const { soloRoles, tramite, cuerpoSimple } = require('../seguridad/acceso');
router.use(cuerpoSimple);
const validaciones = require('../validacion/valMes');

//primero validamos que tenga token y luego mostramos los permisos que existen
router.get('/ver', validarToken, soloRoles('Docente'), permisosControlador.verPermisos);

//ruta para modificar un permiso mediante el metodo patch 
router.patch('/mod', validarToken, soloRoles('Docente'), tramite('permisos_goce', 'editar'), permisosControlador.modPermisos);
//ruta para crear un permiso mediante el metodo post :v
router.post('/crear', validarToken, soloRoles('Docente'), validaciones.vDia, permisosControlador.crearPermiso);
//ruta para cancelar un permiso mediante el metodo patchhh
router.patch('/cancelar', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), tramite('permisos_goce', 'estado'), permisosControlador.cancelarPermiso);
//ruta para ver todos los permisos
router.get('/todos', validarToken, soloRoles('Administrador', 'RRHH'), permisosControlador.verTodosPermisos);

module.exports = router;
