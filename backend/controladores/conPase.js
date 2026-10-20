//importamos el modelo sql de pases
const pasesSql = require('../modelos/sqlPase');
const { enviarNotificacionEstado } = require('../correos/correo');
const sqlValidaciones = require('../modelos/sqlDias');
const { notificar } = require('../seguridad/acceso');


const pasesControlador = {
    //para crearpases
    crearPase: async (req, res) => {
        try {
            const { fecha_uso, hora_inicio, hora_fin, motivo } = req.body;
            const { id: usuario_id } = req.usuario;

            if (!fecha_uso || !hora_inicio || !motivo) {
                return res.status(400).json({
                    ok: false, msg: "Faltan campos obligatorios :v"
                });
            }

            const pasesEsteMes = await pasesSql.contarPasesMensuales(usuario_id);
            if (pasesEsteMes >= 3) {

                return res.status(403).json({ ok: false, msg: "limite alcanzado: solo puedes pedir 3 pases por mes" });
            }

            const infoFecha = await sqlValidaciones.fechaEspecial(fecha_uso, usuario_id);

            if (infoFecha.esFestivo) {
                return res.status(400).json({
                    ok: false,
                    msg: `Es día festivo: ${infoFecha.esFestivo}`
                });
            }

            if (infoFecha.esCumple) {
                return res.status(400).json({
                    ok: false,
                    msg: "Feliz cumpleaños!!!"
                });
            }

            const traslape = await sqlValidaciones.verificarT(usuario_id, fecha_uso);
            if (traslape) {
                return res.status(400).json({
                    ok: false,
                    msg: "Ya tienes un trámite registrado o pendiente para esta fecha"
                });
            }

            const resultado = await pasesSql.crearPase(usuario_id, fecha_uso, hora_inicio, hora_fin, motivo);
            req.app.get('socketio').to('revision').emit('nuevo-pase-creado', { msg: 'Un docente solicitó un pase' });
            res.json({ ok: true, msg: "Pase creado con éeito" });


        } catch (error) {
            console.error('Error de operación:', error.code || 'UNKNOWN');
            res.status(500).json({ ok: false, msg: "error de servidor al crear pase" });
        }
    },

    //ver pases
    verMisPases: async (req, res) => {
        try {
            const { id } = req.usuario;
            const pases = await pasesSql.obtenerPases(id);
            res.json({ ok: true, data: pases });
        } catch (error) {
            res.status(500).json({ ok: false, msg: "error al obtener pases" });
        }
    },

    //ver todos
    verTodos: async (req, res) => {
        try {
            const pases = await pasesSql.obtenerTodos();
            res.json({ ok: true, data: pases });
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
            console.error("Error en cancelarPase:", error.code);
            res.status(500).json({ ok: false, msg: "Error al actualizar estado" });
        }
    },

    //modificar un pase
    modificarPase: async (req, res) => {
        try {
            const { id, fecha_uso, hora_inicio, hora_fin, motivo } = req.body;
            const result = await pasesSql.modPase(fecha_uso, hora_inicio, hora_fin, motivo, id, req.usuario.id);
            if (!result.affectedRows) return res.status(409).json({ ok: false, msg: 'El trámite cambió. Actualiza la pantalla.' });
            notificar(req, 'pase-actualizado', { id, nuevoEstado: 'Pendiente' }, req.usuario.id);
            res.json({ ok: true, msg: "Pase modificado correctamente" });
        } catch (error) {
            if (error.errno === 1644 || error.sqlState === '45000') {
                return res.status(400).json({ ok: false, msg: error.sqlMessage });
            }
            console.error('Error de operación:', error.code || 'UNKNOWN');
            res.status(500).json({ ok: false, msg: "Error del server al modificar" });
        }
    },
};


module.exports = pasesControlador;
