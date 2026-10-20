const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function required(name) {
    const value = process.env[name];
    if (!value || value === 'generar_con_setup_local') {
        throw new Error(`Falta configurar ${name}. Ejecuta npm run setup:local desde la raíz.`);
    }
    return value;
}

function port(name, fallback) {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`${name} debe ser un puerto entre 1 y 65535.`);
    }
    return value;
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres.');
required('ROOT_USER');
required('ROOT_PASS');

if (process.env.EMAIL_ENABLED && !['true', 'false'].includes(process.env.EMAIL_ENABLED)) {
    throw new Error('EMAIL_ENABLED debe ser true o false.');
}
const emailEnabled = process.env.EMAIL_ENABLED === 'true';
if (emailEnabled) { required('EMAIL_USER'); required('EMAIL_PASS'); }

module.exports = {
    host: process.env.HOST || '127.0.0.1',
    port: port('PORT', 3100),
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: port('DB_PORT', 33307),
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        database: required('DB_NAME'),
        charset: 'utf8mb4',
        timezone: 'Z',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000
    },
    emailEnabled
};
