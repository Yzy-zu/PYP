#!/usr/bin/env node
'use strict';

// Comprobación integrada y acotada de fase 2. Crea y elimina únicamente fixtures
// propios. Nunca ejecutar contra el respaldo original ni una BD de producción.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../bd/base');

const base = new URL(process.env.SECURITY_BASE_URL || `http://127.0.0.1:${config.port}`);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'La API debe ser local.');
assert(['127.0.0.1', 'localhost', '::1'].includes(config.db.host), 'La BD debe ser local.');
assert(/_demo(?:$|_)/i.test(config.db.database), 'Se requiere explícitamente una BD _demo.');
assert.equal(config.emailEnabled, false, 'Desactiva correos antes de crear fixtures.');

const prefix = `security-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const password = `Check-${crypto.randomBytes(14).toString('hex')}`;
const ids = [];
let passed = 0;

async function api(method, route, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-token'] = token;
    const response = await fetch(new URL(route, base), {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000), redirect: 'error'
    });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
}

function status(result, expected, context) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(result.status), `${context}: HTTP ${result.status}; esperado ${allowed.join('/')}`);
}

function noSecrets(data) {
    for (const [key, value] of Object.entries(data || {})) {
        assert(!/contrase[ñn]a|password|hash/i.test(key) || key === 'debe_cambiar_password', `Campo sensible expuesto: ${key}`);
        assert.notEqual(key, 'session_version', 'Versión interna de sesión expuesta');
        if (value && typeof value === 'object') noSecrets(value);
    }
}

async function check(name, work) {
    await work();
    passed++;
    console.log(`OK ${String(passed).padStart(2, '0')} ${name}`);
}

async function createUser(label, rol = 'Docente', area = 'Tecnologías de la Información') {
    const correo = `${prefix}-${label}@example.invalid`;
    const hash = await bcrypt.hash(password, 4);
    const [row] = await db.execute(`INSERT INTO usuarios
        (nombre_completo, correo_institucional, contraseña, rol, area_adscripcion, fecha_nacimiento)
        VALUES (?, ?, ?, ?, ?, '1990-06-15')`, [`Prueba ${label}`, correo, hash, rol, area]);
    ids.push(row.insertId);
    const user = { id: row.insertId, correo, rol };
    user.token = await login(user);
    return user;
}

async function login(user, pass = password) {
    const result = await api('POST', '/api/login/login', null, { correo: user.correo, password: pass });
    status(result, 200, 'Login fixture');
    assert(result.data?.token, 'Login no devolvió token');
    noSecrets(result.data.usuario);
    return result.data.token;
}

async function fixture(user, kind) {
    const [row] = kind === 'pases'
        ? await db.execute(`INSERT INTO pases_salida
            (usuario_id, fecha_uso, hora_inicio, hora_fin, motivo)
            VALUES (?, '2027-02-10', '09:00', '10:00', ?)`, [user.id, prefix])
        : await db.execute(`INSERT INTO permisos_goce
            (usuario_id, tipo_permiso, fecha_inicio, fecha_fin, cantidad_dias, motivo)
            VALUES (?, 'Personal', '2027-02-11', '2027-02-11', 1, ?)`, [user.id, prefix]);
    return { id: row.insertId, kind, table: kind === 'pases' ? 'pases_salida' : 'permisos_goce' };
}

function edit(record) {
    return record.kind === 'pases'
        ? { id: record.id, fecha_uso: '2027-02-10', hora_inicio: '09:00', hora_fin: '10:00', motivo: `${prefix} editado` }
        : { id: record.id, tipo_permiso: 'Personal', fecha_inicio: '2027-02-11', fecha_fin: '2027-02-11', cantidad_dias: 1, motivo: `${prefix} editado` };
}

async function setState(record, value) {
    await db.execute(`UPDATE ${record.table} SET estado = ?, revisado_por = NULL WHERE id = ?`, [value, record.id]);
}

async function transition(record, user, target) {
    return api('PATCH', `/api/${record.kind}/cancelar`, user.token, { id: record.id, cancelar: target });
}

async function main() {
    status(await api('GET', '/api/salud'), 200, 'Servidor/BD disponibles');
    await check('Administración exige autenticación en todas sus rutas', async () => {
        const routes = [
            ['GET', '/usuarios'], ['GET', '/usuarios/2147483647'], ['POST', '/usuarios'],
            ['PATCH', '/usuarios/2147483647'], ['PATCH', '/usuarios/resetpass/2147483647'],
            ['PATCH', '/usuarios/rol/2147483647'], ['DELETE', '/usuarios/2147483647'],
            ['GET', '/pases'], ['PATCH', '/pases/override/2147483647'], ['DELETE', '/pases/2147483647'],
            ['GET', '/permisos'], ['PATCH', '/permisos/override/2147483647'], ['DELETE', '/permisos/2147483647'],
            ['GET', '/dias'], ['POST', '/dias'], ['DELETE', '/dias/2147483647'],
            ['GET', '/sesion'], ['POST', '/logout']
        ];
        for (const [method, route] of routes) status(await api(method, `/api/root${route}`, null, method === 'GET' ? undefined : {}), 401, `${method} ${route}`);
    });
    await check('Login vacío rechaza datos sin error interno', async () => {
        status(await api('POST', '/api/login/login', null, {}), [400, 401], 'Login usuario vacío');
        status(await api('POST', '/api/root/login', null, {}), [400, 401], 'Login root vacío');
    });

    const owner = await createUser('owner');
    const peer = await createUser('peer');
    const foreign = await createUser('foreign', 'Docente', 'Gastronomía');
    const chief = await createUser('chief', 'Administrador');
    const rh = await createUser('rh', 'RRHH');
    const records = await Promise.all(['pases', 'permisos'].map(kind => fixture(owner, kind)));
    const foreignRecords = await Promise.all(['pases', 'permisos'].map(kind => fixture(foreign, kind)));

    await check('Docente, jefe y RH no acceden a root', async () => {
        for (const user of [owner, chief, rh]) status(await api('GET', '/api/root/usuarios', user.token), 403, user.rol);
    });
    let rootToken;
    await check('Root se autentica con identidad Sysadmin separada', async () => {
        const result = await api('POST', '/api/root/login', null, { user: process.env.ROOT_USER, pass: process.env.ROOT_PASS });
        status(result, 200, 'Login root');
        rootToken = result.data.token;
        const claims = jwt.decode(rootToken);
        assert.equal(claims.id, 'SYSADMIN');
        assert.equal(claims.rol, 'Sysadmin');
        status(await api('GET', '/api/root/usuarios', rootToken), 200, 'Root usuarios');
    });
    await check('Altas y ediciones administrativas validan datos y revocan sesiones', async () => {
        const correo = `${prefix}-created@example.invalid`;
        status(await api('POST', '/api/root/usuarios', rootToken, {
            nombre_completo: 'Prueba inválida', correo_institucional: correo, rol: 'Sysadmin'
        }), 400, 'Rol técnico no asignable a usuario');
        const created = await api('POST', '/api/root/usuarios', rootToken, {
            nombre_completo: 'Prueba alta administrativa', correo_institucional: correo, rol: 'Docente'
        });
        status(created, 200, 'Alta root');
        assert(Number.isInteger(created.data.id), 'Alta no devolvió ID');
        ids.push(created.data.id);
        assert.equal(typeof created.data.passwordTemporal, 'string');
        const token = await login({ correo }, created.data.passwordTemporal);
        status(await api('PATCH', `/api/root/usuarios/${created.data.id}`, rootToken, {
            nombre_completo: 'Prueba alta editada'
        }), 200, 'Edición parcial root');
        status(await api('GET', '/api/login/perfil', token), 401, 'Edición root revoca token');
        status(await api('PATCH', `/api/root/usuarios/${created.data.id}`, rootToken, {
            contraseña: '123456'
        }), 400, 'Root no establece clave débil');
    });
    await check('Perfil y detalle administrativo no exponen hash', async () => {
        const profile = await api('GET', '/api/login/perfil', owner.token);
        const detail = await api('GET', `/api/root/usuarios/${owner.id}`, rootToken);
        status(profile, 200, 'Perfil'); status(detail, 200, 'Detalle root');
        noSecrets(profile.data); noSecrets(detail.data);
    });
    await check('Docente no lista expedientes generales; jefe y RH sí', async () => {
        for (const kind of ['pases', 'permisos']) {
            status(await api('GET', `/api/${kind}/todos`, owner.token), 403, `${kind} docente`);
            status(await api('GET', `/api/${kind}/todos`, chief.token), 200, `${kind} jefe`);
            status(await api('GET', `/api/${kind}/todos`, rh.token), 200, `${kind} RH`);
        }
    });
    await check('Jefe y RH listan solicitudes de todas las áreas', async () => {
        for (const record of foreignRecords) {
            const jefe = await api('GET', `/api/${record.kind}/todos`, chief.token);
            const rrhh = await api('GET', `/api/${record.kind}/todos`, rh.token);
            assert(jefe.data.data.some(row => Number(row.id) === record.id), 'El jefe no vio fixture de otra área');
            assert(rrhh.data.data.some(row => Number(row.id) === record.id), 'RH no vio fixture de otra área');
        }
    });
    await check('Jefe y RH no crean solicitudes de docente', async () => {
        for (const user of [chief, rh]) for (const record of records) status(await api('POST', `/api/${record.kind}/crear`, user.token, edit(record)), 403, 'Crear sin rol docente');
    });
    await check('Docente no modifica ni cancela solicitudes ajenas', async () => {
        for (const record of records) {
            status(await api('PATCH', `/api/${record.kind}/mod`, peer.token, edit(record)), [403, 404], 'Edición ajena');
            status(await transition(record, peer, 'Cancelado'), [403, 404], 'Cancelación ajena');
        }
    });
    await check('Solo dueño pendiente edita; revisores no editan contenido', async () => {
        for (const record of records) {
            status(await api('PATCH', `/api/${record.kind}/mod`, owner.token, edit(record)), 200, 'Edición dueño');
            status(await api('PATCH', `/api/${record.kind}/mod`, chief.token, edit(record)), 403, 'Edición jefe');
            status(await api('PATCH', `/api/${record.kind}/mod`, rh.token, edit(record)), 403, 'Edición RH');
        }
    });
    await check('Docente no se aprueba; RH no salta Vo.Bo.; jefe no aprueba definitivamente', async () => {
        for (const record of records) {
            status(await transition(record, owner, 'Aprobado'), [403, 409], 'Autoaprobación');
            status(await transition(record, rh, 'Aprobado'), [403, 409], 'RH pendiente');
            status(await transition(record, chief, 'Aprobado'), [403, 409], 'Jefe aprueba');
        }
    });
    await check('Jefe da Vo.Bo. a otra área; solo RH aprueba definitivamente', async () => {
        for (const record of foreignRecords) {
            status(await transition(record, chief, 'Vo.Bo.'), 200, 'Vo.Bo. otra área');
            status(await transition(record, chief, 'Aprobado'), [403, 409], 'Aprobación final jefe otra área');
            status(await transition(record, rh, 'Aprobado'), 200, 'Aprobación final RH otra área');
        }
    });
    await check('Vo.Bo. impide edición/cancelación docente y requiere aprobación RH', async () => {
        for (const record of records) {
            status(await transition(record, chief, 'Vo.Bo.'), 200, 'Vo.Bo. jefe');
            status(await api('PATCH', `/api/${record.kind}/mod`, owner.token, edit(record)), [403, 409], 'Edición post Vo.Bo.');
            status(await transition(record, owner, 'Cancelado'), [403, 409], 'Cancelación post Vo.Bo.');
            status(await transition(record, rh, 'Aprobado'), 200, 'Aprobación RH');
            status(await transition(record, rh, 'Rechazado'), [403, 409], 'Cambio de terminal');
        }
    });
    await check('Transiciones concurrentes solo permiten una decisión', async () => {
        for (const record of records) {
            await setState(record, 'Pendiente');
            const results = await Promise.all([transition(record, chief, 'Vo.Bo.'), transition(record, chief, 'Rechazado')]);
            assert.equal(results.filter(result => result.status === 200).length, 1, 'Dos decisiones concurrentes fueron aceptadas');
            assert(results.some(result => [403, 409].includes(result.status)), 'Falta rechazo de actualización concurrente');
        }
    });
    await check('Dueño cancela pendiente; jefe/RH rechazan en su etapa', async () => {
        for (const record of records) {
            await setState(record, 'Pendiente'); status(await transition(record, owner, 'Cancelado'), 200, 'Cancela dueño');
            await setState(record, 'Pendiente'); status(await transition(record, chief, 'Rechazado'), 200, 'Rechaza jefe');
            await setState(record, 'Vo.Bo.'); status(await transition(record, rh, 'Rechazado'), 200, 'Rechaza RH');
        }
    });
    await check('Logout invalida token y su renovación', async () => {
        status(await api('POST', '/api/login/logout', peer.token, {}), 200, 'Logout');
        status(await api('GET', '/api/login/perfil', peer.token), 401, 'Perfil revocado');
        status(await api('GET', '/api/login/ntoken', peer.token), 401, 'Renovación revocada');
        peer.token = await login(peer);
    });
    await check('Cambio de contraseña exige actual y longitud mínima', async () => {
        status(await api('PATCH', '/api/login/npassword', peer.token, { password: 'incorrecta', npassword: 'NuevaClave-2026' }), [400, 401], 'Password actual incorrecta');
        status(await api('PATCH', '/api/login/npassword', peer.token, { password, npassword: 'corta' }), 400, 'Password corta');
        status(await api('PATCH', '/api/login/npassword', peer.token, { password, npassword: password }), 400, 'Password repetida');
        status(await api('PATCH', '/api/login/npassword', peer.token, { password, npassword: 'á'.repeat(40) }), 400, 'Password mayor de 72 bytes');
    });
    await check('Cambio válido revoca token anterior y entrega sesión nueva', async () => {
        const nextPassword = 'NuevaClaveSegura-2026';
        const changed = await api('PATCH', '/api/login/npassword', peer.token, { password, npassword: nextPassword });
        status(changed, 200, 'Cambiar password'); assert(changed.data.token, 'No entregó nueva sesión');
        status(await api('GET', '/api/login/perfil', peer.token), 401, 'Token anterior password');
        status(await api('GET', '/api/login/perfil', changed.data.token), 200, 'Token nuevo password');
        peer.token = await login(peer, nextPassword);
    });
    await check('Reset genera clave temporal, revoca sesión y obliga cambio', async () => {
        const reset = await api('PATCH', `/api/root/usuarios/resetpass/${peer.id}`, rootToken, {});
        status(reset, 200, 'Reset root');
        assert.equal(typeof reset.data.passwordTemporal, 'string');
        assert(reset.data.passwordTemporal.length >= 10, 'Clave temporal insuficiente');
        status(await api('GET', '/api/login/perfil', peer.token), 401, 'Token anterior reset');
        const result = await api('POST', '/api/login/login', null, { correo: peer.correo, password: reset.data.passwordTemporal });
        status(result, 200, 'Login clave temporal');
        assert.equal(Boolean(result.data.usuario.debe_cambiar_password), true);
        assert.notEqual(reset.data.passwordTemporal, '123456');
        status(await api('GET', '/api/login/perfil', result.data.token), 200, 'Perfil permite cambiar password');
        status(await api('GET', '/api/login/ntoken', result.data.token), 200, 'Renovación conserva restricción');
        status(await api('GET', '/api/pases/ver', result.data.token), 403, 'Reset bloquea funciones hasta cambio');
        const changed = await api('PATCH', '/api/login/npassword', result.data.token, {
            password: reset.data.passwordTemporal, npassword: 'ClaveDefinitiva-2026'
        });
        status(changed, 200, 'Cambiar clave temporal');
        assert.equal(Boolean(changed.data.usuario.debe_cambiar_password), false);
        status(await api('GET', '/api/pases/ver', changed.data.token), 200, 'Funciones después del cambio');
    });
    await check('Cambio de rol invalida sesión anterior', async () => {
        status(await api('PATCH', `/api/root/usuarios/rol/${chief.id}`, rootToken, { rol: 'Docente' }), 200, 'Cambio rol root');
        status(await api('GET', '/api/login/ntoken', chief.token), 401, 'Token de rol anterior');
        chief.token = await login(chief);
        status(await api('GET', '/api/pases/todos', chief.token), 403, 'Rol actual docente');
    });
    await check('Usuario inactivo no usa token, renueva ni inicia sesión', async () => {
        status(await api('DELETE', `/api/root/usuarios/${foreign.id}`, rootToken), 200, 'Baja administrativa');
        const [saved] = await db.execute('SELECT activo FROM usuarios WHERE id = ?', [foreign.id]);
        assert.equal(saved.length, 1, 'La baja borró el expediente del usuario');
        assert.equal(Number(saved[0].activo), 0, 'La baja no desactivó al usuario');
        for (const record of foreignRecords) {
            const [rows] = await db.execute(`SELECT id FROM ${record.table} WHERE id = ?`, [record.id]);
            assert.equal(rows.length, 1, 'La baja borró un trámite');
        }
        status(await api('GET', '/api/login/perfil', foreign.token), 401, 'Inactivo perfil');
        status(await api('GET', '/api/login/ntoken', foreign.token), 401, 'Inactivo renovación');
        status(await api('POST', '/api/login/login', null, { correo: foreign.correo, password }), 401, 'Inactivo login');
    });
    await check('Usuario eliminado no mantiene sesión renovable', async () => {
        const removed = await createUser('removed');
        await db.execute('DELETE FROM usuarios WHERE id = ?', [removed.id]);
        status(await api('GET', '/api/login/perfil', removed.token), 401, 'Eliminado perfil');
        status(await api('GET', '/api/login/ntoken', removed.token), 401, 'Eliminado renovación');
    });
    await check('JWT inválido, expirado o sin versión no otorga acceso', async () => {
        for (const token of ['malformado', jwt.sign({ id: owner.id, rol: owner.rol, sv: 0 }, process.env.JWT_SECRET, { expiresIn: -1 }), jwt.sign({ id: owner.id, rol: owner.rol }, process.env.JWT_SECRET)]) {
            status(await api('GET', '/api/login/perfil', token), 401, 'Token rechazado');
        }
    });
    await check('Logout de root revoca su sesión administrativa', async () => {
        status(await api('GET', '/api/root/sesion', rootToken), 200, 'Sesión root vigente');
        status(await api('POST', '/api/root/logout', rootToken, {}), 200, 'Logout root');
        status(await api('GET', '/api/root/usuarios', rootToken), 401, 'Root revocado');
        status(await api('GET', '/api/root/sesion', rootToken), 401, 'Sesión root revocada');
    });
    console.log(`\n${passed} comprobaciones integradas aprobadas. Fixtures eliminados al terminar.`);
}

main().catch(error => {
    console.error(`FALLO: ${error.message}`);
    process.exitCode = 1;
}).finally(async () => {
    try {
        if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            await db.execute(`DELETE FROM revisiones_tramites WHERE propietario_id IN (${placeholders})`, ids);
            // Eliminar primero referencias revisor/propietario de nuestros fixtures.
            await db.execute(`DELETE FROM pases_salida WHERE usuario_id IN (${placeholders})`, ids);
            await db.execute(`DELETE FROM permisos_goce WHERE usuario_id IN (${placeholders})`, ids);
            await db.execute(`DELETE FROM usuarios WHERE id IN (${placeholders})`, ids);
        }
    } catch (error) {
        console.error(`No se pudo limpiar fixtures ${prefix}: ${error.code || 'error BD'}`);
        process.exitCode = 1;
    }
    await db.end();
});
