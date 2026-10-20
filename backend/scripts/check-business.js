#!/usr/bin/env node
'use strict';

// Comprobación integrada de fase 3. Usa solo cuentas y festivos propios en la BD
// local de demo; elimina sus fixtures incluso cuando una comprobación falla.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const db = require('../bd/base');
const base = new URL(process.env.BUSINESS_BASE_URL || `http://127.0.0.1:${config.port}`);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'La API debe ser local.');
assert(['127.0.0.1', 'localhost', '::1'].includes(config.db.host), 'La BD debe ser local.');
assert(/_demo(?:$|_)/i.test(config.db.database), 'Se requiere explícitamente una BD _demo.');
assert.equal(config.emailEnabled, false, 'Desactiva correos antes de crear fixtures.');
const prefix = `business-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const password = `Check-${crypto.randomBytes(14).toString('hex')}`;
const ids = [], holidayIds = [];
let passed = 0, baseline;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(today.slice(0, 4)) + 1;
const date = (month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const weekday = value => new Date(`${value}T12:00:00Z`).getUTCDay();
const workdays = month => Array.from({ length: 28 }, (_, i) => date(month, i + 1)).filter(value => ![0, 6].includes(weekday(value)));
const jan = workdays(1), feb = workdays(2), may = workdays(5);
const birthday = feb[10], holiday = workdays(3)[10];
const nextYearDay = Array.from({ length: 7 }, (_, i) => `${year + 1}-01-${String(i + 1).padStart(2, '0')}`)
    .find(value => ![0, 6].includes(weekday(value)));
const weekend = Array.from({ length: 28 }, (_, i) => date(3, i + 1)).find(value => weekday(value) === 0);

async function api(method, route, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-token'] = token;
    const response = await fetch(new URL(route, base), {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
}
function expect(result, accepted, label) {
    const allowed = Array.isArray(accepted) ? accepted : [accepted];
    assert(allowed.includes(result.status), `${label}: HTTP ${result.status}; esperado ${allowed.join('/')}; ${JSON.stringify(result.data)}`);
    return result;
}
const success = result => expect(result, [200, 201], 'Operación válida');
const rejected = result => expect(result, [400, 403, 409, 422], 'Datos/regla inválida');
async function check(label, work) {
    await work(); passed++; console.log(`OK ${String(passed).padStart(2, '0')} ${label}`);
}
async function user(label, birth = birthday, role = 'Docente') {
    const correo = `${prefix}-${label}-${ids.length}@example.invalid`;
    const hash = await bcrypt.hash(password, 4);
    const [row] = await db.execute(`INSERT INTO usuarios
        (nombre_completo, correo_institucional, contraseña, rol, area_adscripcion, fecha_nacimiento)
        VALUES (?, ?, ?, ?, 'Tecnologías de la Información', ?)`,
    [prefix, correo, hash, role, `1990-${birth.slice(5)}`]);
    ids.push(row.insertId);
    const response = success(await api('POST', '/api/login/login', null, { correo, password }));
    assert(response.data.token, 'Login fixture sin token');
    return { id: row.insertId, token: response.data.token };
}
function body(kind, day, extra = {}) {
    return kind === 'pases'
        ? { fecha_uso: day, hora_inicio: '09:00', hora_fin: '10:00', motivo: prefix, ...extra }
        : { tipo_permiso: 'Personal', fecha_inicio: day, fecha_fin: day, cantidad_dias: 1, motivo: prefix, ...extra };
}
const table = kind => kind === 'pases' ? 'pases_salida' : 'permisos_goce';
const create = (u, kind, day, extra) => api('POST', `/api/${kind}/crear`, u.token, body(kind, day, extra));
const edit = (u, kind, id, day, extra) => api('PATCH', `/api/${kind}/mod`, u.token, { id, ...body(kind, day, extra) });
async function rows(u, kind) {
    const [result] = await db.execute(`SELECT * FROM ${table(kind)} WHERE usuario_id=? ORDER BY id`, [u.id]);
    return result;
}
async function latest(u, kind) { return (await rows(u, kind)).at(-1); }
async function state(u, kind, id, estado) {
    const [result] = await db.execute(`UPDATE ${table(kind)} SET estado=? WHERE id=? AND usuario_id=?`, [estado, id, u.id]);
    assert.equal(result.affectedRows, 1);
}
async function counters(u, day) {
    const result = success(await api('GET', `/api/login/contadores?fecha=${day}`, u.token));
    return result.data.data || result.data;
}
async function fill(u, kind, days = jan) {
    for (const day of days.slice(0, 3)) success(await create(u, kind, day));
}
async function expectSqlRejected(work) {
    let error;
    try { await work(); } catch (caught) { error = caught; }
    assert(error, 'La BD aceptó una escritura que viola las reglas');
    assert.equal(error.errno, 1644, `Se esperaba regla de negocio SQL, recibido ${error.code}`);
}
async function direct(u, kind, day, extra = {}) {
    const value = body(kind, day, extra);
    return kind === 'pases'
        ? db.execute(`INSERT INTO pases_salida (usuario_id,fecha_uso,hora_inicio,hora_fin,motivo) VALUES (?,?,?,?,?)`,
            [u.id, value.fecha_uso, value.hora_inicio, value.hora_fin, value.motivo])
        : db.execute(`INSERT INTO permisos_goce (usuario_id,tipo_permiso,fecha_inicio,fecha_fin,cantidad_dias,motivo) VALUES (?,?,?,?,?,?)`,
            [u.id, value.tipo_permiso, value.fecha_inicio, value.fecha_fin, value.cantidad_dias, value.motivo]);
}
async function race(work, expectedSuccess = 1) {
    const results = await Promise.all(work);
    assert.equal(results.filter(item => [200, 201].includes(item.status)).length, expectedSuccess,
        `Carrera aceptó cantidad incorrecta: ${JSON.stringify(results)}`);
    results.filter(item => ![200, 201].includes(item.status)).forEach(rejected);
}
async function countUnrelated() {
    const [result] = await db.execute(`SELECT
        (SELECT COUNT(*) FROM usuarios WHERE correo_institucional NOT LIKE ?) usuarios,
        (SELECT COUNT(*) FROM pases_salida p JOIN usuarios u ON u.id=p.usuario_id WHERE u.correo_institucional NOT LIKE ?) pases,
        (SELECT COUNT(*) FROM permisos_goce p JOIN usuarios u ON u.id=p.usuario_id WHERE u.correo_institucional NOT LIKE ?) permisos,
        (SELECT COUNT(*) FROM dias_festivos WHERE COALESCE(descripcion,'')<>?) festivos`,
    [`${prefix}%`, `${prefix}%`, `${prefix}%`, prefix]);
    return result[0];
}
async function main() {
    success(await api('GET', '/api/salud'));
    baseline = await countUnrelated();
    const [existing] = await db.execute('SELECT id FROM dias_festivos WHERE fecha=?', [holiday]);
    if (!existing.length) {
        const [inserted] = await db.execute('INSERT INTO dias_festivos (fecha,descripcion) VALUES (?,?)', [holiday, prefix]);
        holidayIds.push(inserted.insertId);
    }
    await check('Configuración expone permiso de un día y cumpleaños solo hábil', async () => {
        const u = await user('config');
        const response = success(await api('GET', '/api/negocio/config', u.token));
        const value = response.data.data || response.data;
        assert.equal(value.maxDiasPermiso, 1); assert.equal(value.cumpleanosInhabil, false);
    });
    await check('Contadores corresponden a la fecha solicitada y comienzan vacíos', async () => {
        const u = await user('contadores');
        const value = await counters(u, jan[0]);
        assert.equal(value.fecha, jan[0]);
        for (const kind of ['pases', 'permisos']) assert.deepEqual(value[kind], { usados: 0, disponibles: 3 });
        assert.deepEqual(value.cumpleanos, { usados: 0, disponibles: 1 });
        rejected(await api('GET', '/api/login/contadores?fecha=fecha-invalida', u.token));
    });
    const passes = await user('pases');
    await check('Tres pases consumen cupo incluso con Vo.Bo. y Aprobado', async () => {
        await fill(passes, 'pases');
        const records = await rows(passes, 'pases');
        await state(passes, 'pases', records[0].id, 'Vo.Bo.');
        await state(passes, 'pases', records[1].id, 'Aprobado');
        assert.deepEqual((await counters(passes, jan[0])).pases, { usados: 3, disponibles: 0 });
        rejected(await create(passes, 'pases', jan[3]));
    });
    await check('Pases usan el mes solicitado y el año correspondiente', async () => {
        success(await create(passes, 'pases', feb[0]));
        assert.deepEqual((await counters(passes, feb[0])).pases, { usados: 1, disponibles: 2 });
        success(await create(passes, 'pases', nextYearDay));
    });
    await check('Cancelar y rechazar liberan cupo de pases', async () => {
        const records = await rows(passes, 'pases');
        await state(passes, 'pases', records[0].id, 'Cancelado');
        await state(passes, 'pases', records[1].id, 'Rechazado');
        assert.equal((await counters(passes, jan[0])).pases.disponibles, 2);
        success(await create(passes, 'pases', jan[3]));
    });
    await check('Pases rechazan horarios invertidos, vacíos, fuera de jornada o mayores a 3 horas', async () => {
        const u = await user('horarios');
        for (const extra of [{ hora_fin: '08:00' }, { hora_fin: '09:00' }, { hora_inicio: '06:59' },
            { hora_inicio: '19:00', hora_fin: '20:01' }, { hora_fin: '12:01' }, { hora_fin: '' }, { hora_inicio: '25:00' }]) {
            rejected(await create(u, 'pases', jan[0], extra));
        }
        success(await create(u, 'pases', jan[0], { hora_inicio: '07:00', hora_fin: '10:00' }));
        success(await create(u, 'pases', jan[1], { hora_inicio: '17:00', hora_fin: '20:00' }));
    });
    await check('Pases rechazan fecha pasada, inexistente, fin de semana y festivo', async () => {
        const u = await user('fechas-pase');
        for (const day of ['2000-01-01', `${year}-02-30`, weekend, holiday, 'no-fecha']) rejected(await create(u, 'pases', day));
    });
    await check('Editar un pase se excluye a sí mismo y vuelve a validar fechas/horas', async () => {
        const u = await user('edit-pase');
        success(await create(u, 'pases', jan[0])); const record = await latest(u, 'pases');
        success(await edit(u, 'pases', record.id, jan[0], { motivo: `${prefix} actualizado` }));
        for (const day of ['2000-01-01', weekend, holiday]) rejected(await edit(u, 'pases', record.id, day));
        rejected(await edit(u, 'pases', record.id, jan[1], { hora_fin: '08:00' }));
    });
    await check('Editar hacia un mes con tres pases se rechaza', async () => {
        const u = await user('edit-cupo-pase');
        await fill(u, 'pases'); success(await create(u, 'pases', feb[0]));
        rejected(await edit(u, 'pases', (await latest(u, 'pases')).id, jan[3]));
    });
    const permits = await user('permisos');
    await check('Servidor calcula un día e ignora cantidad_dias manipulada', async () => {
        success(await create(permits, 'permisos', jan[0], { cantidad_dias: 999 }));
        assert.equal(Number((await latest(permits, 'permisos')).cantidad_dias), 1);
    });
    await check('Tres permisos por cuatrimestre cuentan Vo.Bo. y Aprobado', async () => {
        success(await create(permits, 'permisos', jan[1])); success(await create(permits, 'permisos', feb[0]));
        const records = await rows(permits, 'permisos');
        await state(permits, 'permisos', records[0].id, 'Vo.Bo.');
        await state(permits, 'permisos', records[1].id, 'Aprobado');
        assert.deepEqual((await counters(permits, feb[0])).permisos, { usados: 3, disponibles: 0 });
        rejected(await create(permits, 'permisos', feb[1]));
    });
    await check('Permisos se renuevan en mayo y enero del siguiente año', async () => {
        success(await create(permits, 'permisos', may[0]));
        assert.deepEqual((await counters(permits, may[0])).permisos, { usados: 1, disponibles: 2 });
        success(await create(permits, 'permisos', nextYearDay));
    });
    await check('Cancelar y rechazar liberan cupo de permisos', async () => {
        const records = await rows(permits, 'permisos');
        await state(permits, 'permisos', records[0].id, 'Cancelado');
        await state(permits, 'permisos', records[1].id, 'Rechazado');
        assert.equal((await counters(permits, jan[0])).permisos.disponibles, 2);
        success(await create(permits, 'permisos', jan[2]));
    });
    await check('Permisos rechazan rangos de varios días e invertidos', async () => {
        const u = await user('rango');
        rejected(await create(u, 'permisos', jan[0], { fecha_fin: jan[1] }));
        rejected(await create(u, 'permisos', jan[1], { fecha_fin: jan[0] }));
    });
    await check('Permisos rechazan pasado, fechas imposibles, inhábiles y tipos inválidos', async () => {
        const u = await user('fechas-permiso');
        for (const day of ['2000-01-01', `${year}-02-30`, weekend, holiday]) rejected(await create(u, 'permisos', day));
        rejected(await create(u, 'permisos', jan[0], { tipo_permiso: 'Inventado' }));
        rejected(await create(u, 'permisos', jan[0], { motivo: '' }));
    });
    await check('Editar permiso se excluye a sí mismo y calcula un día', async () => {
        const u = await user('edit-permiso');
        success(await create(u, 'permisos', jan[0])); const record = await latest(u, 'permisos');
        success(await edit(u, 'permisos', record.id, jan[0], { cantidad_dias: 999 }));
        assert.equal(Number((await latest(u, 'permisos')).cantidad_dias), 1);
        for (const day of ['2000-01-01', weekend, holiday]) rejected(await edit(u, 'permisos', record.id, day));
        rejected(await edit(u, 'permisos', record.id, jan[0], { fecha_fin: jan[1] }));
    });
    await check('Editar hacia un cuatrimestre con tres permisos se rechaza', async () => {
        const u = await user('edit-cupo-permiso');
        await fill(u, 'permisos'); success(await create(u, 'permisos', may[0]));
        rejected(await edit(u, 'permisos', (await latest(u, 'permisos')).id, feb[0]));
    });
    const birth = await user('cumpleanos');
    await check('Cumpleaños concede un día adicional con cupo ordinario agotado', async () => {
        await fill(birth, 'permisos');
        success(await create(birth, 'permisos', birthday, { tipo_permiso: 'Cumpleaños', cantidad_dias: 999 }));
        const record = await latest(birth, 'permisos'); assert.equal(Number(record.cantidad_dias), 1);
        const value = await counters(birth, birthday);
        assert.deepEqual(value.permisos, { usados: 3, disponibles: 0 });
        assert.deepEqual(value.cumpleanos, { usados: 1, disponibles: 0 });
    });
    await check('Cumpleaños no puede duplicarse en el año, incluso con Vo.Bo.', async () => {
        const record = await latest(birth, 'permisos'); await state(birth, 'permisos', record.id, 'Vo.Bo.');
        rejected(await create(birth, 'permisos', birthday, { tipo_permiso: 'Cumpleaños' }));
    });
    await check('Cumpleaños solo se concede en la fecha exacta y un día', async () => {
        const u = await user('cumple-invalido');
        rejected(await create(u, 'permisos', feb[0], { tipo_permiso: 'Cumpleaños' }));
        rejected(await create(u, 'permisos', birthday, { tipo_permiso: 'Cumpleaños', fecha_fin: feb[11] }));
    });
    await check('Cumpleaños inhábil o festivo no se solicita', async () => {
        for (const [label, day] of [['domingo', weekend], ['festivo', holiday]]) {
            const u = await user(`cumple-${label}`, day);
            rejected(await create(u, 'permisos', day, { tipo_permiso: 'Cumpleaños' }));
        }
    });
    await check('Traslapes pase/permiso se bloquean en ambos sentidos', async () => {
        const u = await user('traslape');
        success(await create(u, 'pases', jan[0])); rejected(await create(u, 'permisos', jan[0]));
        success(await create(u, 'permisos', jan[1])); rejected(await create(u, 'pases', jan[1]));
        rejected(await create(u, 'pases', jan[0], { hora_inicio: '12:00', hora_fin: '13:00' }));
    });
    await check('La edición también rechaza traslapes entre tipos', async () => {
        const u = await user('traslape-edit');
        success(await create(u, 'pases', jan[0])); success(await create(u, 'permisos', jan[1]));
        rejected(await edit(u, 'pases', (await latest(u, 'pases')).id, jan[1]));
        rejected(await edit(u, 'permisos', (await latest(u, 'permisos')).id, jan[0]));
    });
    await check('Rechazados/cancelados dejan libre la fecha sin afectar otros usuarios', async () => {
        const u = await user('traslape-libre'), other = await user('otro');
        success(await create(u, 'pases', jan[0])); const pass = await latest(u, 'pases');
        success(await create(other, 'permisos', jan[0]));
        await state(u, 'pases', pass.id, 'Rechazado'); success(await create(u, 'permisos', jan[0]));
        await state(u, 'permisos', (await latest(u, 'permisos')).id, 'Cancelado'); success(await create(u, 'pases', jan[0]));
    });
    await check('Concurrencia: solo una solicitud ocupa el último pase disponible', async () => {
        const u = await user('race-pase');
        for (const day of jan.slice(0, 2)) success(await create(u, 'pases', day));
        await race(jan.slice(2, 6).map(day => create(u, 'pases', day)));
        assert.equal((await rows(u, 'pases')).length, 3);
    });
    await check('Concurrencia: solo una solicitud ocupa el último permiso disponible', async () => {
        const u = await user('race-permiso');
        for (const day of jan.slice(0, 2)) success(await create(u, 'permisos', day));
        await race(jan.slice(2, 6).map(day => create(u, 'permisos', day)));
        assert.equal((await rows(u, 'permisos')).length, 3);
    });
    await check('Concurrencia: una fecha no admite simultáneamente pase y permiso', async () => {
        const u = await user('race-fecha');
        await race([create(u, 'pases', jan[0]), create(u, 'permisos', jan[0]), create(u, 'pases', jan[0])]);
        assert.equal((await rows(u, 'pases')).length + (await rows(u, 'permisos')).length, 1);
    });
    await check('Concurrencia: solo un cumpleaños anual se registra', async () => {
        const u = await user('race-cumple');
        await race(Array.from({ length: 4 }, () => create(u, 'permisos', birthday, { tipo_permiso: 'Cumpleaños' })));
        assert.equal((await rows(u, 'permisos')).length, 1);
    });
    let rootToken;
    await check('Override Sysadmin de pase valida edición, cupo, traslape y horario', async () => {
        // env carga ROOT_USER/PASS desde .env; no se imprimen las credenciales.
        const login = success(await api('POST', '/api/root/login', null, {
            user: process.env.ROOT_USER, pass: process.env.ROOT_PASS
        }));
        rootToken = login.data.token;
        assert(rootToken, 'Sysadmin no recibió token');
        const u = await user('root-pase');
        await fill(u, 'pases'); success(await create(u, 'pases', feb[0]));
        const record = await latest(u, 'pases');
        const override = (day, extra = {}) => api('PATCH', `/api/root/pases/override/${record.id}`, rootToken,
            body('pases', day, { estado: 'Pendiente', ...extra }));
        success(await override(feb[1], { motivo: `${prefix} root` }));
        let saved = await latest(u, 'pases');
        assert.equal(new Date(saved.fecha_uso).toISOString().slice(0, 10), feb[1]);
        assert.equal(saved.motivo, `${prefix} root`);
        rejected(await override(jan[3]));
        success(await create(u, 'permisos', feb[2]));
        rejected(await override(feb[2]));
        rejected(await override(feb[1], { hora_fin: '08:00' }));
        saved = await latest(u, 'pases');
        assert.equal(new Date(saved.fecha_uso).toISOString().slice(0, 10), feb[1]);
    });
    await check('Override Sysadmin de permiso respeta cupo, traslape y día calculado', async () => {
        const u = await user('root-permiso');
        await fill(u, 'permisos'); success(await create(u, 'permisos', may[0]));
        const record = await latest(u, 'permisos');
        const override = (day, extra = {}) => api('PATCH', `/api/root/permisos/override/${record.id}`, rootToken,
            body('permisos', day, { estado: 'Pendiente', ...extra }));
        success(await override(may[1], { cantidad_dias: 999, motivo: `${prefix} root` }));
        let saved = await latest(u, 'permisos');
        assert.equal(new Date(saved.fecha_inicio).toISOString().slice(0, 10), may[1]);
        assert.equal(Number(saved.cantidad_dias), 1);
        rejected(await override(feb[0]));
        rejected(await override(may[1], { fecha_fin: may[2] }));
        success(await create(u, 'pases', may[2]));
        rejected(await override(may[2]));
        saved = await latest(u, 'permisos');
        assert.equal(new Date(saved.fecha_inicio).toISOString().slice(0, 10), may[1]);
        assert.equal(Number(saved.cantidad_dias), 1);
        success(await api('POST', '/api/root/logout', rootToken, {}));
    });
    await check('BD protege cuota de pases en INSERT y UPDATE', async () => {
        const u = await user('sql-pases'); await fill(u, 'pases');
        const existing = await rows(u, 'pases'); await state(u, 'pases', existing[0].id, 'Vo.Bo.');
        await expectSqlRejected(() => direct(u, 'pases', jan[3]));
        const [inserted] = await direct(u, 'pases', feb[0]);
        await expectSqlRejected(() => db.execute('UPDATE pases_salida SET fecha_uso=? WHERE id=?', [jan[3], inserted.insertId]));
        await expectSqlRejected(() => direct(u, 'pases', feb[1], { hora_inicio: '11:00', hora_fin: '10:00' }));
    });
    await check('BD protege cuota de permisos en INSERT y UPDATE', async () => {
        const u = await user('sql-permisos'); await fill(u, 'permisos');
        await state(u, 'permisos', (await rows(u, 'permisos'))[0].id, 'Vo.Bo.');
        await expectSqlRejected(() => direct(u, 'permisos', feb[0]));
        const [inserted] = await direct(u, 'permisos', may[0]);
        await expectSqlRejected(() => db.execute('UPDATE permisos_goce SET fecha_inicio=?,fecha_fin=? WHERE id=?', [feb[0], feb[0], inserted.insertId]));
    });
    await check('BD protege cumpleaños exacto, único y de un día', async () => {
        const u = await user('sql-cumple');
        await expectSqlRejected(() => direct(u, 'permisos', feb[0], { tipo_permiso: 'Cumpleaños' }));
        await direct(u, 'permisos', birthday, { tipo_permiso: 'Cumpleaños' });
        await expectSqlRejected(() => direct(u, 'permisos', birthday, { tipo_permiso: 'Cumpleaños' }));
        await expectSqlRejected(() => direct(u, 'permisos', jan[0], { fecha_fin: jan[1], cantidad_dias: 2 }));
    });
    await check('Fixtures no modificaron usuarios, expedientes ni festivos previos', async () => {
        assert.deepEqual(await countUnrelated(), baseline);
    });
    console.log(`\n${passed} comprobaciones integradas aprobadas. Fixtures eliminados al terminar.`);
}
main().catch(error => { console.error(`FALLO: ${error.stack || error.message}`); process.exitCode = 1; }).finally(async () => {
    try {
        if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            await db.execute(`DELETE FROM revisiones_tramites WHERE propietario_id IN (${placeholders})`, ids);
            await db.execute(`DELETE FROM pases_salida WHERE usuario_id IN (${placeholders})`, ids);
            await db.execute(`DELETE FROM permisos_goce WHERE usuario_id IN (${placeholders})`, ids);
            await db.execute(`DELETE FROM usuarios WHERE id IN (${placeholders})`, ids);
        }
        if (holidayIds.length) await db.execute(`DELETE FROM dias_festivos WHERE id IN (${holidayIds.map(() => '?').join(',')}) AND descripcion=?`, [...holidayIds, prefix]);
    } catch (error) {
        console.error(`No se pudieron limpiar fixtures ${prefix}: ${error.code || error.message}`); process.exitCode = 1;
    }
    await db.end();
});
