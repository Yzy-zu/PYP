const config = require('./config/env');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');
const { autenticar } = require('./seguridad/sesiones');
const validarToken = require('./validacion/valLogin');
const { soloRoles } = require('./seguridad/acceso');

// Inicializamos app primero para poder usarla en el server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: false },
    maxHttpBufferSize: 32768
});

io.use(async (socket, next) => {
    try {
        const { usuario, claims } = await autenticar(socket.handshake.auth?.token);
        if (!['Docente', 'Administrador', 'RRHH'].includes(usuario.rol) || usuario.debe_cambiar_password) throw new Error('INVALID_SESSION');
        socket.data.usuario = usuario;
        socket.data.expiry = claims.exp * 1000;
        next();
    } catch { next(new Error('Sesión no autorizada.')); }
});
io.on('connection', socket => {
    socket.join(`usuario:${socket.data.usuario.id}`);
    if (['Administrador', 'RRHH'].includes(socket.data.usuario.rol)) socket.join('revision');
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiry - Date.now()));
    timer.unref();
    socket.once('disconnect', () => clearTimeout(timer));
});
//midlewares
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(cookieParser());
//seguridad desactivada por el momento
app.use(helmet({
    contentSecurityPolicy: false 
}));
app.set('socketio', io);
//configuracion de rutas estaticas
app.use(express.static(path.join(__dirname, "..", "frontend")));

//ruta principal para entrar idrectamente al login
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});
//importamos las rutas api de nuestra app web
const rutasLogin = require('./rutas/rutaLogin'); 
const rutasPermisos = require('./rutas/rutaPermiso');
const rutasPases = require('./rutas/rutaPase'); 
const db = require('./bd/base');
const rutaRoot = require('./rutas/rutaRoot');
//usamos las apis
app.use('/api/login', rutasLogin);
app.use('/api/permisos', rutasPermisos);
app.use('/api/pases', rutasPases); 
app.use('/api/root', rutaRoot);

app.get('/api/salud', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ ok: true, database: 'ready', email: config.emailEnabled ? 'enabled' : 'disabled' });
    } catch {
        res.status(503).json({ ok: false, database: 'unavailable' });
    }
});

app.get('/api/dias/ver', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT fecha, descripcion FROM dias_festivos");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ ok: false, msg: "Error al obtener festivos" });
    }
});

app.get('/api/negocio/config', validarToken, soloRoles('Docente', 'Administrador', 'RRHH'), (req, res) => {
    const reglas = require('./negocio/reglas');
    res.json({ ok: true, hoy: reglas.hoy(), zonaHoraria: reglas.zonaHoraria, maxDiasPermiso: 1, cumpleanosInhabil: false });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ ok: false, msg: status === 413 ? 'Solicitud demasiado grande.' : status === 400 ? 'JSON inválido.' : 'No se pudo completar la solicitud.' });
});

async function iniciar() {
    await db.query('SELECT 1');
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, resolve);
    });
    console.log(`Servidor listo en http://${config.host}:${config.port}`);
    console.log(`Base de datos conectada. Correo ${config.emailEnabled ? 'habilitado' : 'desactivado'}.`);
}

function cerrar() {
    io.close(() => db.end().then(() => process.exit(0)));
}

if (require.main === module) {
    iniciar().catch(async (error) => {
        console.error(`No se pudo iniciar: ${error.code || 'error de configuración'}. Revisa la BD y el puerto.`);
        await db.end();
        process.exit(1);
    });
    process.once('SIGINT', cerrar);
    process.once('SIGTERM', cerrar);
}

module.exports = { app, server, iniciar };
