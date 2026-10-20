//importamos el modelo sql de pases
const pasesSql = require('../modelos/sqlPase');
const { enviarNotificacionEstado } = require('../correos/correo');
const negocio = require('../negocio/tramites');
const { responderError } = require('../negocio/reglas');
const { notificar } = require('../seguridad/acceso');
const { folio } = require('../documentos/historial');


const pasesControlador = {
    //para crearpases
    crearPase: async (req, res) => {
        try {
            const result = await negocio.guardar('pase', req.body, req.usuario);
            notificar(req, 'nuevo-pase-creado', { msg: 'Nueva solicitud de pase.' }, result.usuario_id);
            res.json({ ok: true, msg: 'Pase creado.', id: result.id });
        } catch (error) { responderError(res, error); }
    },

    //ver pases
    verMisPases: async (req, res) => {
        try {
            const { id } = req.usuario;
            const pases = await pasesSql.obtenerPases(id);
            res.json({ ok: true, data: pases.map(p => ({ ...p, folio: folio('pase', p.id) })) });
        } catch (error) {
            res.status(500).json({ ok: false, msg: "error al obtener pases" });
        }
    },

    //ver todos
    verTodos: async (req, res) => {
        try {
            const pases = await pasesSql.obtenerTodos();
            res.json({ ok: true, data: pases.map(p => ({ ...p, folio: folio('pase', p.id) })) });
        } catch (error) {
            res.status(500).json({ ok: false, msg: "error al obtener todos los pases" });
        }
    },

    //cancelar un pase (Aprobar/Rechazar/Cancelar)
    cancelarPase: async (req, res) => {
        const { id, cancelar } = req.body; // 'id' es el del pase, 'cancelar' es el nuevo estado
        try {
            //extraemos el id de quien realiza la accion (el admin) desde el token
            const paseActualizado = await pasesSql.cancelarPase(cancelar, id, req.usuario, req.tramite.estado);

            if (!paseActualizado) {
                return res.status(409).json({ ok: false, msg: 'El trámite cambió. Actualiza la pantalla.' });
            }

            const docente = await pasesSql.obtenerInfoDocentePorPase(id);

            //socket para avisar en tiempo real
            notificar(req, 'pase-actualizado', { id, nuevoEstado: cancelar }, req.tramite.usuario_id);

            if (docente) {
                enviarNotificacionEstado(
                    docente.correo_institucional,
                    docente.nombre_completo,
                    "Pase de Salida",
                    cancelar
                );
            }

            res.json({ ok: true, msg: 'Pase actualizado.' });

        } catch (error) {
            responderError(res, error);
        }
    },

    //modificar un pase
    modificarPase: async (req, res) => {
        try {
            const result = await negocio.guardar('pase', req.body, req.usuario, Number(req.body.id));
            notificar(req, 'pase-actualizado', { id: result.id, nuevoEstado: result.estado }, result.usuario_id);
            res.json({ ok: true, msg: 'Pase modificado.' });
        } catch (error) { responderError(res, error); }
    }
};
module.exports = pasesControlador;
