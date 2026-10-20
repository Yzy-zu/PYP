//importamos el modelo sql propio de permisos
const usersql = require('../modelos/sqlPermiso');
const { enviarNotificacionEstado } = require('../correos/correo');
const negocio = require('../negocio/tramites');
const { responderError } = require('../negocio/reglas');
const { notificar } = require('../seguridad/acceso');
const { folio } = require('../documentos/historial');

////creamos el objeto con las funciones 
const permisosControlador = {
    // Para que el docente vea solo los suyos
    verPermisos: async (req, res) => {
        const { id } = req.usuario;
        try {
            //mandamos id en la consulta sql
            const permisos = await usersql.obtenerPermisos(id);
            if (!permisos) {
                return res.status(404).json({ ok: false, msg: "ALgo salio mal :v" });
            }
            res.json({ ok: true, data: permisos.map(p => ({ ...p, folio: folio('permiso', p.id) })) });
        } catch (error) {
            res.status(500).json({ ok: false, msg: "Error de server" });
        }
    },

    //funcion para ver todos los permisos sin importar id
    verTodosPermisos: async (req, res) => {
        try {
            const permisos = await usersql.obtenerTodos();
            const data = req.usuario.rol === 'Administrador' ? permisos.map(({ rfc, fecha_nacimiento, fecha_ingreso, categoria, tipo_contrato, ...solicitud }) => solicitud) : permisos;
            res.json({ ok: true, data: data.map(p => ({ ...p, folio: folio('permiso', p.id) })) });
        } catch (error) {
            res.status(500).json({ ok: false, msg: "Error de server" });
        }
    },

    //funcion para modificar permisos
    modPermisos: async (req, res) => {
        try {
            const result = await negocio.guardar('permiso', req.body, req.usuario, Number(req.body.id));
            notificar(req, 'permiso-actualizado', { id: result.id, nuevoEstado: result.estado }, result.usuario_id);
            res.json({ ok: true, msg: 'Permiso modificado.' });
        } catch (error) { responderError(res, error); }
    },
    crearPermiso: async (req, res) => {
        try {
            const result = await negocio.guardar('permiso', req.body, req.usuario);
            notificar(req, 'nuevo-permiso-creado', { msg: 'Nueva solicitud de permiso.' }, result.usuario_id);
            res.json({ ok: true, msg: 'Permiso creado.', id: result.id });
        } catch (error) { responderError(res, error); }
    },
    //cancelar un permiso (Aprobar/Rechazar/Cancelar)
    cancelarPermiso: async (req, res) => {
        const { cancelar, id } = req.body;
        try {
            //sacamos el ID del admin que esta haciendo el movimiento

            //intentamos actualizar el estado incluyendo quien revisa
            const permisos = await usersql.cancelarPermiso(cancelar, id, req.usuario, req.tramite.estado);

            if (!permisos) {
                return res.status(409).json({ ok: false, msg: 'El trámite cambió. Actualiza la pantalla.' });
            }
            const docente = await usersql.obtenerInfoDocentePorPermiso(id);

            //socket para avisar en tiempo real
            notificar(req, 'permiso-actualizado', { id, nuevoEstado: cancelar }, req.tramite.usuario_id);
            if (docente && docente.correo_institucional) {
                enviarNotificacionEstado(
                    docente.correo_institucional,
                    docente.nombre_completo,
                    "Permiso de Inasistencia",
                    cancelar
                );
            }

            res.json({ ok: true, msg: 'Permiso actualizado.' });

        } catch (error) {
            responderError(res, error);
        }
    }
}

module.exports = permisosControlador;
