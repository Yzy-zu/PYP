// Herramienta local: restaura el original una sola vez y crea una demo independiente.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const stateDir = path.join(root, '.local');
const envPath = path.join(root, '.env');
const dumpPath = path.join(root, 'sistema_permisos_salidas final.sql');
const archive = 'sistema_permisos_respaldo';
const expectedHash = '6c6d9a0fa3ea604e296c678aca7fef75726f7dbd5622b92c0215dcfd41e22800';
const action = process.argv[2];

function makeEnv() {
    if (fs.existsSync(envPath)) return;
    const random = () => crypto.randomBytes(24).toString('hex');
    const values = {
        HOST: '127.0.0.1', PORT: '3100', DB_HOST: '127.0.0.1', DB_PORT: '33307',
        DB_NAME: 'sistema_permisos_demo', DB_USER: 'pases_demo',
        DB_PASSWORD: random(), DB_ROOT_PASSWORD: random(), JWT_SECRET: random(),
        ROOT_USER: 'admin_demo', ROOT_PASS: random(), EMAIL_ENABLED: 'false', EMAIL_USER: '', EMAIL_PASS: ''
    };
    fs.writeFileSync(envPath, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
    console.log('.env creado con credenciales locales aleatorias.');
}

// Seleccionar siempre el daemon local; no afectar otros contextos Docker.
const dockerEnv = { ...process.env };
for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[name];
function docker(args, input) {
    return execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
        cwd: root, env: dockerEnv, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe']
    });
}
const composeArgs = ['compose', '-p', 'proyecto-pases-local', '--project-directory', root, '-f', path.join(root, 'compose.yaml')];
function compose(args) { return docker([...composeArgs, ...args]); }
function sql(container, database, input) {
    return docker(['exec', '-i', container, 'sh', '-c',
        'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 "$@"',
        'sh', ...(database ? [database] : [])], input);
}
function identifier(name) {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Nombre de base local inválido.');
    return '`' + name + '`';
}
function tableCount(container, database) {
    const result = sql(container, null, `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}';`);
    return Number(result.trim().split('\n').at(-1));
}
function migraciones(container, demo) {
    sql(container, demo, fs.readFileSync(path.join(root, 'backend/bd/migraciones/002_seguridad.sql'), 'utf8'));
    const triggers = sql(container, null, `SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${demo}'
        AND TRIGGER_NAME IN ('trg_reglas_pase_ins','trg_reglas_pase_upd','trg_reglas_permiso_ins','trg_reglas_permiso_upd');`);
    if (Number(triggers.trim().split('\n').at(-1)) !== 4) {
        sql(container, demo, fs.readFileSync(path.join(root, 'backend/bd/migraciones/003_reglas.sql'), 'utf8'));
    }
    sql(container, demo, fs.readFileSync(path.join(root, 'backend/bd/migraciones/004_documentos.sql'), 'utf8'));
}
function structureOnly(dump) {
    // El formato revisado tiene un INSERT multilínea por tabla. Mantener todo el DDL y DELIMITER.
    let removed = 0;
    const schema = dump.replace(/^INSERT INTO `[^`]+`[^\n]*\r?\n[\s\S]*?;\s*$/gm, () => { removed++; return ''; });
    if (removed !== 4 || /^INSERT INTO /m.test(schema)) throw new Error('No se pudo separar el esquema de los datos del respaldo.');
    return schema;
}

async function seed(config) {
    const mysql = require('mysql2/promise');
    const bcrypt = require('bcryptjs');
    const connection = await mysql.createConnection(config.db);
    try {
        const [[{ total }]] = await connection.query('SELECT COUNT(*) AS total FROM usuarios');
        if (total) {
            console.log('La demo ya contiene usuarios; no se sobrescribieron datos ni contraseñas.');
            return;
        }
        const accounts = [
            [1, 'Docente Uno Demo', 'docente1@demo.invalid', 'Docente', '1990-10-21'],
            [2, 'Docente Dos Demo', 'docente2@demo.invalid', 'Docente', '1988-02-10'],
            [3, 'Jefatura Demo', 'jefe@demo.invalid', 'Administrador', '1980-03-12'],
            [4, 'Recursos Humanos Demo', 'rh@demo.invalid', 'RRHH', '1982-06-15']
        ];
        const access = [];
        await connection.beginTransaction();
        for (const [id, name, email, role, birth] of accounts) {
            const password = crypto.randomBytes(12).toString('base64url');
            const hash = await bcrypt.hash(password, 10);
            await connection.execute(`INSERT INTO usuarios
                (id,nombre_completo,correo_institucional,contraseña,rol,fecha_nacimiento,rfc,fecha_ingreso,categoria,area_adscripcion,tipo_contrato)
                VALUES (?,?,?,?,?,?,NULL,'2015-01-12','Profesor de Tiempo Completo','Tecnologías de la Información','Indeterminado')`,
                [id, name, email, hash, role, birth]);
            access.push(`| ${name} | ${email} | ${password} |`);
        }
        const [holidays] = await connection.query('SELECT fecha FROM dias_festivos');
        const excluded = new Set(holidays.map(row => row.fecha.toISOString().slice(0, 10)));
        const dates = [];
        const date = new Date();
        date.setUTCHours(12, 0, 0, 0);
        while (dates.length < 5) {
            date.setUTCDate(date.getUTCDate() + 1);
            const value = date.toISOString().slice(0, 10);
            if (![0, 6].includes(date.getUTCDay()) && !excluded.has(value)) dates.push(value);
        }
        await connection.execute(`INSERT INTO pases_salida
            (usuario_id,fecha_uso,hora_inicio,hora_fin,motivo,estado,revisado_por,fecha_revision)
            VALUES (1,?,'09:00','10:00','Trámite ficticio de demostración','Pendiente',NULL,NULL),
                   (2,?,'11:00','12:00','Ejemplo ficticio aprobado','Aprobado',4,NOW())`, [dates[1], dates[0]]);
        await connection.execute(`INSERT INTO permisos_goce
            (usuario_id,tipo_permiso,fecha_inicio,fecha_fin,cantidad_dias,motivo,estado,revisado_por,fecha_revision)
            VALUES (2,'Personal',?,?,1,'Ejemplo ficticio pendiente','Pendiente',NULL,NULL),
                   (1,'Institucional',?,?,1,'Ejemplo ficticio con visto bueno','Vo.Bo.',3,NOW()),
                   (1,'Personal',?,?,1,'Ejemplo ficticio aprobado','Aprobado',4,NOW())`,
            [dates[2], dates[2], dates[3], dates[3], dates[4], dates[4]]);
        const accountFile = path.join(stateDir, 'ACCESOS_DEMO.md');
        const content = '# Accesos locales de demostración\n\nSolo datos ficticios. No compartir ni subir a Git.\n\n' +
            '| Cuenta | Correo | Contraseña |\n| --- | --- | --- |\n' + access.join('\n') +
            `\n\nAdministración técnica: /Rlogin.html\n\nUsuario: ${process.env.ROOT_USER}\n\nContraseña: ${process.env.ROOT_PASS}\n`;
        fs.writeFileSync(accountFile, content, { mode: 0o600 });
        await connection.commit();
        console.log('Demo creada: 4 cuentas, 2 pases y 3 permisos ficticios. Accesos en .local/ACCESOS_DEMO.md');
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally { await connection.end(); }
}

function verify(container, demo) {
    for (const database of [archive, demo]) {
        const name = identifier(database);
        const counts = sql(container, database, `SELECT 'usuarios' AS tabla, COUNT(*) AS filas FROM usuarios
            UNION ALL SELECT 'pases_salida',COUNT(*) FROM pases_salida
            UNION ALL SELECT 'permisos_goce',COUNT(*) FROM permisos_goce
            UNION ALL SELECT 'dias_festivos',COUNT(*) FROM dias_festivos;`);
        const checks = sql(container, null, `SELECT
            (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}') AS tablas,
            (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${database}') AS triggers,
            (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='${database}' AND CONSTRAINT_TYPE='FOREIGN KEY') AS claves_foraneas,
            (SELECT COUNT(*) FROM (SELECT TABLE_NAME,INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${database}' GROUP BY TABLE_NAME,INDEX_NAME) AS indices) AS indices;`);
        const lastLine = checks.trim().split('\n').at(-1).split('\t').map(Number);
        const expected = database === archive ? '4,3,4,9' : '5,4,4,13';
        if (lastLine.join(',') !== expected) throw new Error(`Estructura incompleta en ${database}; revisar restauración.`);
        const security = sql(container, null, `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${database}' AND TABLE_NAME='usuarios'
            AND COLUMN_NAME IN ('activo','session_version','debe_cambiar_password');`);
        const columns = Number(security.trim().split('\n').at(-1));
        if (columns !== (database === archive ? 0 : 3)) throw new Error(`Migración de seguridad inesperada en ${database}.`);
        if (database === archive) {
            const recovered = Object.fromEntries(counts.trim().split('\n').slice(1).map(line => {
                const [table, count] = line.split('\t'); return [table, Number(count)];
            }));
            for (const [table, count] of Object.entries({ usuarios: 39, pases_salida: 2, permisos_goce: 65, dias_festivos: 9 })) {
                if (recovered[table] !== count) throw new Error(`Conteo inesperado en respaldo.${table}; revisar restauración.`);
            }
        }
        console.log(`${name}\n${counts.trim()}\n${checks.trim()}`);
    }
}

async function main() {
    if (!['setup', 'up', 'verify', 'stop'].includes(action)) throw new Error('Acción: setup, up, verify o stop.');
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    if (action === 'setup') makeEnv();
    const config = require('../config/env');
    const demo = config.db.database;
    identifier(demo);
    if (demo === archive) throw new Error('La demo debe usar una BD distinta del respaldo.');
    if (action === 'setup' && !['127.0.0.1', 'localhost'].includes(config.db.host)) {
        throw new Error('La preparación de demo solo admite una BD local.');
    }
    if (action === 'stop') { compose(['stop', 'db']); console.log('BD local detenida; volumen conservado.'); return; }
    if (action === 'up' || action === 'setup') {
        console.log('Iniciando MariaDB local...');
        compose(['up', '-d', '--wait', '--wait-timeout', '120', 'db']);
    }
    const container = compose(['ps', '-q', 'db']).trim();
    if (!container) throw new Error('No está disponible el contenedor local. Ejecuta npm run db:up.');
    if (action === 'up') {
        if (![4, 5].includes(tableCount(container, demo))) throw new Error('Ejecuta npm run setup:local antes de iniciar.');
        migraciones(container, demo);
        console.log('BD local disponible; migraciones de seguridad, reglas e historial aplicadas.'); return;
    }
    if (action === 'setup') {
        const dump = fs.readFileSync(dumpPath, 'utf8');
        if (crypto.createHash('sha256').update(dump).digest('hex') !== expectedHash) throw new Error('El respaldo cambió; revisarlo antes de restaurar.');
        sql(container, null, `CREATE DATABASE IF NOT EXISTS ${identifier(archive)} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;`);
        if (!tableCount(container, archive)) {
            sql(container, archive, dump);
            console.log('Respaldo original restaurado en una BD separada.');
        } else console.log('Respaldo ya presente; se conserva sin volver a importar.');
        // Verificar original antes de crear la demo: nunca continuar con una restauración parcial.
        if (tableCount(container, archive) !== 4) throw new Error('Restauración del respaldo incompleta.');
        if (!tableCount(container, demo)) {
            sql(container, demo, structureOnly(dump));
            sql(container, demo, `INSERT INTO dias_festivos SELECT * FROM ${identifier(archive)}.dias_festivos;`);
        }
        migraciones(container, demo);
        verify(container, demo);
        await seed(config);
    }
    verify(container, demo);
    console.log('Verificación de estructura terminada.');
}

main().catch(error => {
    // No volcar argumentos/env ni filas del respaldo en mensajes de error.
    if (error.stderr && fs.existsSync(stateDir)) fs.writeFileSync(path.join(stateDir, 'error-restauracion.log'), error.stderr, { mode: 0o600 });
    const message = error.status != null ? 'Falló un comando Docker/SQL; detalles en .local/error-restauracion.log.' :
        error.code ? `Error ${error.code}` : error.message;
    console.error(`Preparación local detenida: ${message}`);
    process.exitCode = 1;
});
