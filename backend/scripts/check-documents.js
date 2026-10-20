#!/usr/bin/env node
'use strict';

// Verificación práctica de fase 4: solo fixtures propios sobre BD local de demo.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { execFileSync } = require('node:child_process');
const config = require('../config/env');
const db = require('../bd/base');
const base = new URL(process.env.DOCUMENTS_BASE_URL || `http://127.0.0.1:${config.port}`);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'La API debe ser local.');
assert(['127.0.0.1', 'localhost', '::1'].includes(config.db.host), 'La BD debe ser local.');
assert(/_demo(?:$|_)/i.test(config.db.database), 'Se requiere explícitamente una BD _demo.');
assert.equal(config.emailEnabled, false, 'Desactiva correos antes de crear fixtures.');
const prefix = `documents-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const password = `Check-${crypto.randomBytes(14).toString('hex')}`;
const ids = [], records = [];
let passed = 0, rootToken;
const kinds = ['pase', 'permiso'];
const table = kind => kind === 'pase' ? 'pases_salida' : 'permisos_goce';
const plural = kind => kind === 'pase' ? 'pases' : 'permisos';
const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric' }).format(new Date()));
const year = thisYear + 1;
let days;
async function api(method, route, token, body) {
    const headers = {};
    if (token) headers['x-token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL(route, base), {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    let data;
    try { data = JSON.parse(buffer.toString('utf8')); } catch { data = null; }
    return { status: response.status, data, buffer, headers: response.headers };
}
function expect(result, allowed, label) {
    const values = Array.isArray(allowed) ? allowed : [allowed];
    assert(values.includes(result.status), `${label}: HTTP ${result.status}; esperado ${values.join('/')}; ${JSON.stringify(result.data)}`);
    return result;
}
const success = result => expect(result, [200, 201], 'Operación válida');
const denied = result => expect(result, [403, 404], 'Acceso ajeno');
async function check(label, work) { await work(); passed++; console.log(`OK ${String(passed).padStart(2, '0')} ${label}`); }
async function user(label, role = 'Docente') {
    const name = `Fixture ${label} ${crypto.randomBytes(4).toString('hex')}`;
    const correo = `${prefix}-${label}@example.invalid`;
    const hash = await bcrypt.hash(password, 4);
    const [inserted] = await db.execute(`INSERT INTO usuarios
        (nombre_completo,correo_institucional,contraseña,rol,area_adscripcion,fecha_nacimiento)
        VALUES (?,?,?,?,?,'1990-06-15')`, [name, correo, hash, role, role === 'Administrador' ? 'Gastronomía' : 'Tecnologías de la Información']);
    ids.push(inserted.insertId);
    const result = success(await api('POST', '/api/login/login', null, { correo, password }));
    assert(result.data.token, 'Login no entregó token');
    return { id: inserted.insertId, token: result.data.token, name, role };
}
function body(kind, day, extra = {}) {
    return kind === 'pase'
        ? { fecha_uso: day, hora_inicio: '09:00', hora_fin: '10:00', motivo: prefix, ...extra }
        : { tipo_permiso: 'Personal', fecha_inicio: day, fecha_fin: day, cantidad_dias: 1, motivo: prefix, ...extra };
}
async function create(owner, kind, day, direct = false) {
    let id;
    if (direct) {
        const value = body(kind, day);
        const [inserted] = kind === 'pase'
            ? await db.execute(`INSERT INTO pases_salida (usuario_id,fecha_uso,hora_inicio,hora_fin,motivo,estado) VALUES (?,?,?,?,?,'Aprobado')`,
                [owner.id, value.fecha_uso, value.hora_inicio, value.hora_fin, value.motivo])
            : await db.execute(`INSERT INTO permisos_goce (usuario_id,tipo_permiso,fecha_inicio,fecha_fin,cantidad_dias,motivo,estado) VALUES (?,?,?,?,?,?,'Aprobado')`,
                [owner.id, value.tipo_permiso, value.fecha_inicio, value.fecha_fin, 1, value.motivo]);
        id = inserted.insertId;
    } else {
        success(await api('POST', `/api/${plural(kind)}/crear`, owner.token, body(kind, day)));
        const [[row]] = await db.execute(`SELECT id FROM ${table(kind)} WHERE usuario_id=? ORDER BY id DESC LIMIT 1`, [owner.id]);
        id = row.id;
    }
    const record = { id, kind, day, owner };
    records.push(record);
    return record;
}
const info = async (record, token = record.owner.token) => {
    const result = success(await api('GET', `/api/documentos/${record.kind}/${record.id}`, token));
    assert(result.data?.data, 'Falta objeto data');
    assert(Array.isArray(result.data.data.historial), 'Falta historial');
    return result.data.data;
};
const pdf = (record, token = record.owner.token, query = '') => api('GET', `/api/documentos/${record.kind}/${record.id}/pdf${query}`, token);
const change = (record, actor, state) => api('PATCH', `/api/${plural(record.kind)}/cancelar`, actor.token, { id: record.id, cancelar: state });
function pdfText(result) {
    success(result);
    assert.match(result.headers.get('content-type') || '', /application\/pdf/i);
    assert.match(result.headers.get('content-disposition') || '', /attachment/i);
    assert.equal(result.buffer.subarray(0, 5).toString(), '%PDF-');
    assert(result.buffer.length > 500, 'PDF vacío o truncado');
    try {
        return execFileSync('pdftotext', ['-', '-'], { input: result.buffer, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).replace(/\s+/g, ' ').trim();
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error('El PDF generado no pudo abrirse con pdftotext');
    }
}
function revision(value, actor, state) {
    const row = value.historial.find(item => item.estado_nuevo === state && item.actor_nombre === actor.name);
    assert(row, `No se conservó revisión ${state} de ${actor.name}`);
    assert.equal(row.actor_rol, actor.role);
    assert(row.fecha && row.accion && row.origen, 'Revisión sin fecha, acción u origen');
    return row;
}
async function main() {
    success(await api('GET', '/api/salud'));
    const [holidays] = await db.execute('SELECT DATE_FORMAT(fecha,"%Y-%m-%d") AS fecha FROM dias_festivos');
    const excluded = new Set(holidays.map(row => row.fecha));
    days = Array.from({ length: 28 }, (_, i) => `${year}-02-${String(i + 1).padStart(2, '0')}`)
        .filter(value => ![0, 6].includes(new Date(`${value}T12:00:00Z`).getUTCDay()) && !excluded.has(value));
    assert(days.length >= 10, 'Faltan días hábiles para fixtures');
    const owner = await user('Docente'), peer = await user('Ajeno');
    const chief = await user('Jefe', 'Administrador'), rh = await user('RH', 'RRHH');
    const root = success(await api('POST', '/api/root/login', null, { user: process.env.ROOT_USER, pass: process.env.ROOT_PASS }));
    rootToken = root.data.token;
    assert(rootToken, 'Sysadmin no recibió token');
    const initial = [];
    for (const [index, kind] of kinds.entries()) initial.push(await create(owner, kind, days[index]));
    await check('Historial y PDF exigen autenticación', async () => {
        for (const record of initial) for (const suffix of ['', '/pdf']) {
            expect(await api('GET', `/api/documentos/${record.kind}/${record.id}${suffix}`), 401, 'Documento anónimo');
        }
    });
    await check('Solo propietario, jefe y RH consultan el historial', async () => {
        for (const record of initial) {
            for (const actor of [owner, chief, rh]) await info(record, actor.token);
            denied(await api('GET', `/api/documentos/${record.kind}/${record.id}`, peer.token));
            denied(await pdf(record, peer.token));
        }
    });
    await check('Pendientes no tienen documento autorizado ni PDF descargable', async () => {
        for (const record of initial) {
            const value = await info(record);
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF pendiente');
        }
    });
    await check('RH no puede saltar el Vo.Bo. y un intento inválido no agrega revisiones', async () => {
        for (const record of initial) {
            const before = (await info(record)).historial.length;
            expect(await change(record, rh, 'Aprobado'), [403, 409], 'RH salta Vo.Bo.');
            assert.equal((await info(record)).historial.length, before);
        }
    });
    await check('Vo.Bo. conserva jefe, fecha y estado sin habilitar todavía el PDF', async () => {
        for (const record of initial) {
            success(await change(record, chief, 'Vo.Bo.'));
            const value = await info(record);
            assert.equal(revision(value, chief, 'Vo.Bo.').estado_anterior, 'Pendiente');
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF con solo Vo.Bo.');
        }
    });
    await check('Aprobación RH conserva ambas revisiones y habilita un folio', async () => {
        for (const record of initial) {
            success(await change(record, rh, 'Aprobado'));
            const value = await info(record);
            revision(value, chief, 'Vo.Bo.');
            assert.equal(revision(value, rh, 'Aprobado').estado_anterior, 'Vo.Bo.');
            assert.equal(value.documento_disponible, true);
            assert(value.folio, 'Documento sin folio');
            record.folio = value.folio;
        }
    });
    await check('PDF aprobado válido contiene datos, jefe y RH autorizados', async () => {
        for (const record of initial) {
            record.text = pdfText(await pdf(record));
            if (record.text) {
                for (const expected of [owner.name, chief.name, rh.name, String(record.folio), prefix]) {
                    assert(record.text.includes(expected), `PDF ${record.kind} omitió ${expected}`);
                }
            }
            for (const actor of [chief, rh]) {
                if (record.kind === 'permiso' && actor === chief) {
                    assert.equal((await info(record, actor.token)).documento_disponible, false);
                    expect(await pdf(record, actor.token), 403, 'Jefe no descarga datos laborales privados');
                } else pdfText(await pdf(record, actor.token));
            }
            denied(await pdf(record, peer.token));
        }
    });
    await check('Parámetros del cliente no sustituyen los datos del PDF', async () => {
        for (const record of initial) {
            const text = pdfText(await pdf(record, owner.token, '?nombre_completo=DATOS_FALSOS&motivo=DATOS_FALSOS&revisado_por=DATOS_FALSOS'));
            if (text) { assert(!text.includes('DATOS_FALSOS')); assert.equal(text, record.text); }
        }
    });
    await check('Cambiar nombres actuales no reescribe nombres autorizados del historial/PDF', async () => {
        for (const actor of [owner, chief, rh]) await db.execute('UPDATE usuarios SET nombre_completo=? WHERE id=?', [`${actor.name} cambiado`, actor.id]);
        for (const record of initial) {
            const value = await info(record);
            revision(value, chief, 'Vo.Bo.'); revision(value, rh, 'Aprobado');
            assert.equal(value.folio, record.folio);
            const text = pdfText(await pdf(record));
            if (text) assert.equal(text, record.text, 'PDF cambió al editar identidades actuales');
        }
    });
    await check('Override Sysadmin queda auditado e invalida documento aprobado previo', async () => {
        for (const record of initial) {
            const before = (await info(record)).historial.length;
            success(await api('PATCH', `/api/root/${plural(record.kind)}/override/${record.id}`, rootToken,
                body(record.kind, record.day, { estado: 'Aprobado', motivo: `${prefix} correccion` })));
            const value = await info(record);
            assert(value.historial.length > before, 'Override no agregó auditoría');
            assert(value.historial.some(row => row.actor_rol === 'Sysadmin' && row.accion && row.origen), 'Falta identidad técnica del override');
            revision(value, chief, 'Vo.Bo.'); revision(value, rh, 'Aprobado');
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF previo después de override');
        }
    });
    await check('Borrado administrativo de trámites se rechaza y conserva expediente/historial', async () => {
        for (const record of initial) {
            const before = (await info(record)).historial.length;
            expect(await api('DELETE', `/api/root/${plural(record.kind)}/${record.id}`, rootToken), 409, 'Borrar expediente');
            assert.equal((await info(record)).historial.length, before);
            const [[saved]] = await db.execute(`SELECT id FROM ${table(record.kind)} WHERE id=?`, [record.id]);
            assert(saved, 'Se perdió expediente pese al rechazo');
        }
    });
    await check('Aprobaciones antiguas sin snapshot no inventan validación ni permiten PDF', async () => {
        for (const [index, kind] of kinds.entries()) {
            const record = await create(owner, kind, days[index + 2], true);
            const value = await info(record);
            assert.equal(value.historial.length, 0, 'Se inventaron revisiones antiguas');
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF legado sin snapshot');
        }
    });
    await check('Decisiones concurrentes producen una sola revisión efectiva por trámite', async () => {
        const concurrent = await user('Concurrencia');
        for (const [index, kind] of kinds.entries()) {
            const record = await create(concurrent, kind, days[index + 4]);
            const before = (await info(record)).historial.length;
            const result = await Promise.all([change(record, chief, 'Vo.Bo.'), change(record, chief, 'Rechazado')]);
            assert.equal(result.filter(row => row.status === 200).length, 1, 'Se aceptaron dos decisiones concurrentes');
            result.filter(row => row.status !== 200).forEach(row => expect(row, [403, 409], 'Conflicto de revisión'));
            const value = await info(record);
            assert.equal(value.historial.length, before + 1, 'Se duplicó o perdió revisión');
        }
    });
    await check('Modificar contenido por SQL invalida el PDF sin reescribir aprobaciones', async () => {
        const tampered = await user('AlteracionSQL');
        for (const [index, kind] of kinds.entries()) {
            const record = await create(tampered, kind, days[index + 6]);
            success(await change(record, chief, 'Vo.Bo.'));
            success(await change(record, rh, 'Aprobado'));
            assert.equal((await info(record)).documento_disponible, true);
            const [[approval]] = await db.execute(`SELECT snapshot FROM revisiones_tramites
                WHERE tipo_tramite=? AND tramite_id=? AND accion='Aprobado' ORDER BY id DESC LIMIT 1`, [kind, record.id]);
            assert(approval, 'Aprobación sin snapshot persistido');
            const snapshot = typeof approval.snapshot === 'string' ? JSON.parse(approval.snapshot) : approval.snapshot;
            assert(snapshot.visto_bueno?.nombre && snapshot.aprobacion?.nombre, 'Snapshot no conservó ambas identidades');
            assert.equal(snapshot.solicitud.motivo, prefix);
            const before = (await info(record)).historial.length;
            await db.execute(`UPDATE ${table(kind)} SET motivo=? WHERE id=?`, [`${prefix} alterado fuera de aplicación`, record.id]);
            const value = await info(record);
            assert.equal(value.historial.length, before);
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF de contenido alterado por SQL');
        }
    });
    await check('Vo.Bo. falsificado por SQL no aprueba ni deja cambios parciales', async () => {
        const forged = await user('VoBoFalso');
        for (const [index, kind] of kinds.entries()) {
            const record = await create(forged, kind, days[index + 8]);
            await db.execute(`UPDATE ${table(kind)} SET estado='Vo.Bo.',revisado_por=?,fecha_revision=NOW() WHERE id=?`, [chief.id, record.id]);
            const before = (await info(record)).historial.length;
            expect(await change(record, rh, 'Aprobado'), 409, 'Aprobación con Vo.Bo. sin respaldo');
            const [[saved]] = await db.execute(`SELECT estado,revisado_por FROM ${table(kind)} WHERE id=?`, [record.id]);
            assert.equal(saved.estado, 'Vo.Bo.', 'Falló rollback del estado tras aprobación inválida');
            assert.equal(Number(saved.revisado_por), chief.id, 'Falló rollback del revisor');
            const value = await info(record);
            assert.equal(value.historial.length, before, 'Aprobación inválida dejó revisión parcial');
            assert.equal(value.documento_disponible, false);
            expect(await pdf(record), 409, 'PDF de Vo.Bo. falsificado');
        }
    });
    await check('Identificadores y tipos de documento inválidos no causan errores internos', async () => {
        for (const path of ['/api/documentos/invalido/1', '/api/documentos/pase/no-id', '/api/documentos/permiso/2147483647']) {
            expect(await api('GET', path, owner.token), [400, 404], 'Documento inexistente/inválido');
        }
    });
    console.log(`\n${passed} comprobaciones de documentos aprobadas. Fixtures eliminados al terminar.`);
}
main().catch(error => { console.error(`FALLO: ${error.stack || error.message}`); process.exitCode = 1; }).finally(async () => {
    try {
        // Eliminar únicamente revisiones cuyos IDs pertenecen a nuestros fixtures.
        if (records.length) for (const kind of kinds) {
            const own = records.filter(record => record.kind === kind).map(record => record.id);
            if (own.length) await db.execute(`DELETE FROM revisiones_tramites WHERE tipo_tramite=? AND tramite_id IN (${own.map(() => '?').join(',')})`, [kind, ...own]);
        }
        if (ids.length) {
            const marks = ids.map(() => '?').join(',');
            await db.execute(`DELETE FROM pases_salida WHERE usuario_id IN (${marks})`, ids);
            await db.execute(`DELETE FROM permisos_goce WHERE usuario_id IN (${marks})`, ids);
            await db.execute(`DELETE FROM usuarios WHERE id IN (${marks})`, ids);
        }
        if (rootToken) await api('POST', '/api/root/logout', rootToken, {});
    } catch (error) {
        console.error(`No se pudieron limpiar fixtures ${prefix}: ${error.code || error.message}`); process.exitCode = 1;
    }
    await db.end();
});
