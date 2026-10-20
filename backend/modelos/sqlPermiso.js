//importamos la bd para crear las consultas
const db = require('../bd/base');


//creamo el objeto con las consultas
const usersql = {

    //obtener permisos 
    obtenerPermisos: async (id) => {
        try {
            //creamos la consulta donde obtendremos todos los registros de un usuario
            const sql = `SELECT 
    pg.*, 
    u.nombre_completo, 
    DATE_FORMAT(pg.fecha_inicio, '%d/%m/%Y') AS fecha_inicio_h, 
    DATE_FORMAT(pg.fecha_fin, '%d/%m/%Y') AS fecha_fin_h, 
    DATE_FORMAT(pg.fecha_solicitud, '%d/%m/%Y %H:%i') AS fecha_solicitud_h 
    FROM permisos_goce pg 
    INNER JOIN usuarios u ON pg.usuario_id = u.id 
    WHERE pg.usuario_id = ? 
    ORDER BY pg.fecha_solicitud DESC`;
            //ejecutamos la consulta mysql con los parametros dados
            const [datos] = await db.execute(sql, [id]);
            //regresamos "datos" pero solo la primera fila 
            return datos;
        } catch (error) {
            console.error("Error al obtener permisos", error.code);
            throw error;
        }
    },
    //funcion para cancelar un permiso
    //funcion para cancelar o aprobar el permiso en la db
    cancelarPermiso: (estado, id, actor, previo) => require('../seguridad/acceso').cambiarEstado('permisos_goce', estado, id, actor, previo),
    obtenerTodos: async () => {
        try {
            const sql = `SELECT 
    pg.*, 
    u.nombre_completo, 
    u.rfc,                 
    u.area_adscripcion,    
    u.fecha_ingreso,      
    u.categoria,           
    u.tipo_contrato,       
    u.fecha_nacimiento,    
    ur.nombre_completo AS revisado_por_nombre,
    DATE_FORMAT(pg.fecha_inicio, '%d/%m/%Y') AS fecha_inicio_h,
    DATE_FORMAT(pg.fecha_fin, '%d/%m/%Y') AS fecha_fin_h,
    DATE_FORMAT(pg.fecha_solicitud, '%d/%m/%Y %H:%i') AS fecha_solicitud_h,
    DATE_FORMAT(pg.fecha_revision, '%d/%m/%Y %H:%i') AS fecha_revision_h
FROM permisos_goce pg
INNER JOIN usuarios u ON pg.usuario_id = u.id
LEFT JOIN usuarios ur ON pg.revisado_por = ur.id
ORDER BY pg.fecha_solicitud DESC;`;
            const [datos] = await db.execute(sql);
            return datos;
        } catch (error) {
            console.error("Error al obtener todos los permisos", error.code);
            throw error;
        }
    },
    obtenerInfoDocentePorPermiso: async (permisoId) => {
        const sql = `
        SELECT u.correo_institucional, u.nombre_completo 
        FROM permisos_goce p 
        JOIN usuarios u ON p.usuario_id = u.id 
        WHERE p.id = ?`;
        const [rows] = await db.execute(sql, [permisoId]);
        return rows[0];
    },
    contarPermisosCuatrimestrales: async (usuario_id, fecha) => (await require('../negocio/tramites').contadores(usuario_id, fecha)).permisos.usados
};
module.exports = usersql;
