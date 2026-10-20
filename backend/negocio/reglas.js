const zonaHoraria = 'America/Mexico_City';
const activos = ['Pendiente', 'Vo.Bo.', 'Aprobado'];
const tiposPermiso = ['Personal', 'Salud', 'Institucional', 'Cumpleaños'];

function fallo(msg, status = 400) {
    const error = new Error(msg);
    error.status = status;
    throw error;
}
function hoy() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
        timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}
function fecha(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1900) fallo('Fecha inválida. Usa AAAA-MM-DD.');
    const parsed = new Date(`${value}T12:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fallo('La fecha no existe.');
    return value;
}
function texto(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2000) fallo('Escribe un motivo de entre 1 y 2000 caracteres.');
    return value.trim();
}
function segundos(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) fallo('Hora inválida. Usa HH:MM.');
    const [h, m, s = 0] = value.split(':').map(Number);
    return h * 3600 + m * 60 + s;
}
function periodos(value) {
    fecha(value);
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const finMes = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const inicioCuatri = Math.floor((month - 1) / 4) * 4 + 1;
    return {
        mes: [`${value.slice(0, 7)}-01`, finMes],
        cuatrimestre: [`${year}-${String(inicioCuatri).padStart(2, '0')}-01`, inicioCuatri === 9 ? `${year + 1}-01-01` : `${year}-${String(inicioCuatri + 4).padStart(2, '0')}-01`],
        anio: [`${year}-01-01`, `${year + 1}-01-01`]
    };
}
function sqlFecha(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10); }

async function validar(connection, tipo, body, usuario, { permitirPasado = false } = {}) {
    const dia = fecha(tipo === 'pase' ? body.fecha_uso : body.fecha_inicio);
    if (!permitirPasado && dia < hoy()) fallo('No se pueden solicitar ni mover trámites a fechas pasadas.');
    const weekday = new Date(`${dia}T12:00:00Z`).getUTCDay();
    if ([0, 6].includes(weekday)) fallo('No se permiten solicitudes en sábado o domingo.');
    const [[festivo]] = await connection.execute('SELECT id FROM dias_festivos WHERE fecha=? LIMIT 1', [dia]);
    if (festivo) fallo('La fecha seleccionada es un día festivo.');
    const motivo = texto(body.motivo);
    if (tipo === 'pase') {
        const inicio = segundos(body.hora_inicio);
        const fin = segundos(body.hora_fin);
        if (fin <= inicio) fallo('La hora final debe ser posterior a la inicial.');
        if (inicio < 7 * 3600 || fin > 20 * 3600 || fin - inicio > 3 * 3600) fallo('El pase debe estar entre 07:00 y 20:00 y durar como máximo 3 horas.');
        return { fecha_uso: dia, hora_inicio: body.hora_inicio, hora_fin: body.hora_fin, motivo };
    }
    if (fecha(body.fecha_fin) !== dia) fallo('Cada permiso corresponde a un solo día; inicio y fin deben coincidir.');
    if (!tiposPermiso.includes(body.tipo_permiso)) fallo('Tipo de permiso inválido.');
    if (body.tipo_permiso === 'Cumpleaños') {
        const nacimiento = sqlFecha(usuario.fecha_nacimiento);
        if (!nacimiento || nacimiento.slice(5) !== dia.slice(5)) fallo('El permiso de cumpleaños solo corresponde a la fecha exacta de nacimiento registrada.');
    }
    // La cantidad enviada por el navegador no decide el derecho: siempre se calcula aquí.
    return { tipo_permiso: body.tipo_permiso, fecha_inicio: dia, fecha_fin: dia, cantidad_dias: 1, motivo };
}

function responderError(res, error) {
    if (error.status) return res.status(error.status).json({ ok: false, msg: error.message });
    if (error.sqlState === '45000') return res.status(409).json({ ok: false, msg: error.sqlMessage });
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ ok: false, msg: 'Otra operación modificó estos trámites. Actualiza y vuelve a intentar.' });
    console.error('Error de trámite:', error.code || 'UNKNOWN');
    return res.status(503).json({ ok: false, msg: 'No se pudo completar la operación. Intenta de nuevo.' });
}
module.exports = { zonaHoraria, activos, tiposPermiso, hoy, fecha, periodos, sqlFecha, fallo, validar, responderError };
