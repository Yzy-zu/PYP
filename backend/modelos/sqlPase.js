const db = require('../bd/base');

const pasesql = {
    //consulta para obtener pases de un usuario especifico
    obtenerPases: async (id) => {
        try {
            const sql = `SELECT p.*, u.nombre_completo, u.area_adscripcion,
                        DATE_FORMAT(p.fecha_uso, '%d/%m/%Y') AS fecha_uso_h,
                        DATE_FORMAT(p.fecha_solicitud, '%d/%m/%Y %H:%i') AS fecha_solicitud_h
                        FROM pases_salida p
                        INNER JOIN usuarios u ON p.usuario_id = u.id
                        WHERE p.usuario_id = ?
                        ORDER BY p.fecha_solicitud DESC`;
            const [datos] = await db.execute(sql, [id]);
            return datos;
        } catch (error) {
            console.error("Error al obtener pases docente", error.code);
            throw error;
        }
    },

    //consulta para obtener todos los pases sin importar el usuario
    obtenerTodos: async () => {
        try {
            const sql = `SELECT 
    p.*, 
    u.nombre_completo,
    u.area_adscripcion,
    ur.nombre_completo AS revisado_por_nombre, 
    DATE_FORMAT(p.fecha_uso, '%d/%m/%Y') AS fecha_uso_h,
    DATE_FORMAT(p.fecha_solicitud, '%d/%m/%Y %H:%i') AS fecha_solicitud_h,
    DATE_FORMAT(p.fecha_revision, '%d/%m/%Y %H:%i') AS fecha_revision_h
FROM pases_salida p
INNER JOIN usuarios u ON p.usuario_id = u.id
LEFT JOIN usuarios ur ON p.revisado_por = ur.id 
ORDER BY p.fecha_solicitud DESC`;
            const [datos] = await db.execute(sql);
            return datos;
        } catch (error) {
            console.error("Error en obtenerTodos", error.code);
            throw error;
        }
    },
    obtenerTodosPases: async function () { return await this.obtenerTodos(); },

    contarPasesMensuales: async (usuario_id, fecha) => (await require('../negocio/tramites').contadores(usuario_id, fecha)).pases.usados,

    //consulta para cancelar un pase
    // En tu archivo de modelos SQL:
    cancelarPase: (estado, id, actor, previo) => require('../seguridad/acceso').cambiarEstado('pases_salida', estado, id, actor, previo),

    //consulta para buscar pase por id
    buscarPasePorId: async (id) => {
        try {
            const sql = `SELECT p.*, u.nombre_completo, 
                        DATE_FORMAT(p.fecha_uso, '%d/%m/%Y') AS fecha_uso_h, 
                        DATE_FORMAT(p.fecha_solicitud, '%d/%m/%Y %H:%i') AS fecha_solicitud_h 
                        FROM pases_salida p 
                        INNER JOIN usuarios u ON p.usuario_id = u.id 
                        WHERE p.id = ?`;
            const [datos] = await db.execute(sql, [id]);
            return datos[0] || null;
        } catch (error) {
            console.error("Error al buscar por id", error.code);
            throw error;
        }
    },
    obtenerInfoDocentePorPase: async (paseId) => {

        const sql = `
            SELECT u.correo_institucional, u.nombre_completo 
            FROM pases_salida p 
            JOIN usuarios u ON p.usuario_id = u.id 
            WHERE p.id = ?`;
        const [rows] = await db.execute(sql, [paseId]);
        return rows[0];
    }
};

module.exports = pasesql;
