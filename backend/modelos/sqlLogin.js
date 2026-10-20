//importamos "bd" para hacer la conexion
const db = require('../bd/base');

//Creamos
const usersql = {

    //creamos la funcion :v
    buscarCorreo: async (correo) => {
        //intentamos ejecutar todo lo dentro de try
        try {
            //creamos la consulta sql
            //hacemos correo = ? para seguridad y luego se le pondra el dato
            const sql = 'select * from usuarios where correo_institucional = ?';
            
            //ejecutamos la consulta mysql con los parametros dados sql y correo
            const [datos] = await db.execute(sql, [correo]);

            //regresamos "filas" para ver que resultado nos dio
            return datos[0];
        } catch (error) {
            //si algo sale mal obtenemos el error
            console.error("Error en login:", error.code);
            throw error;
        }
    },
    buscarId: async (id) => {
        try {
            //consulta para obtener datos de sql condicionando por id
            const sql = `select * from usuarios where id = ? `;
            //ejecutar la consulta inyectando id
            const [datos] = await db.execute(sql, [id]);
            //regresa los datos de la primera fila
            const user = datos[0];
            return user;
        } catch (error) {
            console.error("Error al obtener usuario:", error.code);
            throw error;
        }
    },
    actContraseña: async (password, id) => {
        try {
            const sql = 'UPDATE usuarios SET contraseña=?,session_version=session_version+1,debe_cambiar_password=0 WHERE id=? AND activo=1';
            const [datos] = await db.execute(sql, [password, id]);
        } catch (error){
            console.error("Error al actualizar usuario:", error.code);
            throw error;
        }
    }
};
//exportamos el objeto creado para que los demas lo puedan usar
//se llamara usersql
module.exports = usersql;
