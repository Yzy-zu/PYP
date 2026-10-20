const PDFDocument = require('pdfkit');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ZONA = 'America/Mexico_City';
const COLOR = '#005f59';
const MARGEN = 52;

function requerido(value, campo) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`El documento requiere ${campo}.`);
    // El snapshot se imprime como texto, nunca como HTML o instrucciones PDF.
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}
function fecha(value, campo) {
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
    const parsed = new Date(`${raw}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
        throw new TypeError(`Fecha inválida en ${campo}.`);
    }
    return { raw, texto: `${raw.slice(8)} de ${MESES[Number(raw.slice(5, 7)) - 1]} de ${raw.slice(0, 4)}` };
}
function instante(value, campo) {
    const parsed = value instanceof Date ? value : new Date(requerido(value, campo));
    if (!Number.isFinite(parsed.getTime())) throw new TypeError(`Fecha inválida en ${campo}.`);
    return new Intl.DateTimeFormat('es-MX', {
        timeZone: ZONA, year: 'numeric', month: 'long', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(parsed);
}
function hora(value, campo) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) throw new TypeError(`Hora inválida en ${campo}.`);
    return value.slice(0, 5);
}
function revisor(value, campo) {
    if (!value || typeof value !== 'object') throw new TypeError(`El documento requiere ${campo}.`);
    return {
        nombre: requerido(value.nombre, `${campo}.nombre`),
        rol: requerido(value.rol, `${campo}.rol`),
        fecha: instante(value.fecha, `${campo}.fecha`)
    };
}
function preparar(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !['pase', 'permiso'].includes(snapshot.tipo)) throw new TypeError('Snapshot documental no compatible.');
    if (!Number.isSafeInteger(snapshot.id) || snapshot.id < 1) throw new TypeError('Identificador documental inválido.');
    const folio = `${snapshot.tipo === 'pase' ? 'PASE' : 'PERM'}-${String(snapshot.id).padStart(8, '0')}`;
    if (snapshot.folio !== folio) throw new TypeError('El folio no coincide con el trámite.');
    const persona = snapshot.solicitante || {};
    const solicitud = snapshot.solicitud || {};
    const nombre = requerido(persona.nombre_completo, 'solicitante.nombre_completo');
    const motivo = requerido(solicitud.motivo, 'solicitud.motivo');
    if (motivo.length > 2000) throw new TypeError('El motivo supera 2000 caracteres.');
    const inicio = fecha(snapshot.tipo === 'pase' ? solicitud.fecha_uso : solicitud.fecha_inicio, 'fecha solicitada');
    const mes = Number(inicio.raw.slice(5, 7));
    const cuatrimestre = Math.floor((mes - 1) / 4);
    const periodo = snapshot.tipo === 'pase'
        ? `${MESES[mes - 1]} de ${inicio.raw.slice(0, 4)}`
        : `${cuatrimestre + 1}.º cuatrimestre de ${inicio.raw.slice(0, 4)} (${MESES[cuatrimestre * 4]} a ${MESES[cuatrimestre * 4 + 3]})`;
    const campos = [
        ['Nombre completo', nombre],
        ['Correo institucional', requerido(persona.correo_institucional, 'solicitante.correo_institucional')]
    ];
    if (persona.area_adscripcion) campos.push(['Área de adscripción', requerido(persona.area_adscripcion, 'área de adscripción')]);
    if (snapshot.tipo === 'permiso') {
        for (const [key, label] of [['rfc', 'RFC'], ['categoria', 'Categoría'], ['tipo_contrato', 'Tipo de contrato']]) {
            if (persona[key]) campos.push([label, requerido(persona[key], label)]);
        }
        for (const [key, label] of [['fecha_nacimiento', 'Fecha de nacimiento'], ['fecha_ingreso', 'Fecha de ingreso']]) {
            if (persona[key]) campos.push([label, fecha(persona[key], label).texto]);
        }
    }
    const detalle = [['Periodo de la fecha solicitada', periodo]];
    if (snapshot.tipo === 'pase') {
        detalle.push(['Fecha de salida', inicio.texto], ['Horario autorizado', `${hora(solicitud.hora_inicio, 'hora inicial')} a ${hora(solicitud.hora_fin, 'hora final')}`]);
    } else {
        const fin = fecha(solicitud.fecha_fin, 'fecha final');
        if (fin.raw < inicio.raw) throw new TypeError('El fin del permiso es anterior al inicio.');
        if (!Number.isSafeInteger(solicitud.cantidad_dias) || solicitud.cantidad_dias < 1) throw new TypeError('Cantidad de días inválida.');
        detalle.push(['Tipo de permiso', requerido(solicitud.tipo_permiso, 'tipo de permiso')], ['Fecha inicial', inicio.texto], ['Fecha final', fin.texto], ['Días autorizados', String(solicitud.cantidad_dias)]);
    }
    detalle.push(['Solicitud registrada', instante(solicitud.fecha_solicitud, 'fecha de solicitud')]);
    return { folio, nombre, motivo, campos, detalle, vistoBueno: revisor(snapshot.visto_bueno, 'visto bueno'), aprobacion: revisor(snapshot.aprobacion, 'aprobación') };
}

/**
 * Renderiza exclusivamente el snapshot inmutable del backend. No consulta BD ni
 * acepta datos del navegador. Devuelve el PDF completo, incluidas páginas extra.
 * @param {object} documento Snapshot documental versión 1.
 * @returns {Promise<Buffer>}
 */
async function crearPdf(documento) {
    const datos = preparar(documento);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'LETTER', margins: { top: 104, bottom: 64, left: MARGEN, right: MARGEN }, bufferPages: true,
            info: { Title: `${documento.tipo === 'pase' ? 'Pase de salida' : 'Permiso de inasistencia'} · ${datos.folio}`, Author: 'Sistema de pases y permisos', Subject: 'Constancia electrónica de trámite autorizado' }
        });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        try {
            const ancho = doc.page.width - 2 * MARGEN;
            const titulo = documento.tipo === 'pase' ? 'PASE DE SALIDA' : 'PERMISO DE INASISTENCIA';
            function encabezado() {
                doc.save();
                doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR).text('UNIVERSIDAD TECNOLÓGICA DE MORELIA', MARGEN, 35, { width: ancho });
                doc.fontSize(15).fillColor('#152f36').text(titulo, MARGEN, 54, { width: ancho });
                doc.font('Helvetica').fontSize(10).fillColor('#444444').text(`Folio: ${datos.folio}  |  Constancia electrónica`, MARGEN, 76, { width: ancho });
                doc.moveTo(MARGEN, 94).lineTo(doc.page.width - MARGEN, 94).strokeColor(COLOR).lineWidth(1).stroke();
                doc.restore();
                doc.x = MARGEN;
                doc.y = doc.page.margins.top;
            }
            doc.on('pageAdded', encabezado);
            encabezado();
            function reservar(alto) {
                if (doc.y + alto > doc.page.height - doc.page.margins.bottom) doc.addPage();
            }
            function seccion(tituloSeccion) {
                reservar(52);
                doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR).text(tituloSeccion, MARGEN, doc.y, { width: ancho });
                doc.moveDown(0.5);
            }
            function texto(contenido, options = {}) {
                doc.font('Helvetica').fontSize(10).fillColor('#202b30').text(contenido, MARGEN, doc.y, { width: ancho, lineGap: 3, paragraphGap: 5, ...options });
            }
            function campos(values) {
                for (const [label, value] of values) {
                    reservar(22);
                    texto(`${label}: ${value}`);
                }
                doc.moveDown(0.5);
            }
            seccion('Solicitante');
            campos(datos.campos);
            seccion('Datos del trámite');
            campos(datos.detalle);
            seccion('Motivo registrado');
            // Sin height, ellipsis ni recortes: PDFKit hace fluir el motivo a
            // páginas sucesivas y conserva saltos de línea y texto completo.
            texto(datos.motivo);
            doc.moveDown(0.7);
            seccion('Constancias de revisión y aprobación');
            campos([
                ['Solicitante', datos.nombre],
                ['Visto bueno', `${datos.vistoBueno.nombre} (${datos.vistoBueno.rol})`],
                ['Fecha del visto bueno', `${datos.vistoBueno.fecha} (${ZONA})`],
                ['Aprobación final', `${datos.aprobacion.nombre} (${datos.aprobacion.rol})`],
                ['Fecha de aprobación', `${datos.aprobacion.fecha} (${ZONA})`]
            ]);
            reservar(76);
            texto('Esta constancia registra electrónicamente el visto bueno y la aprobación del trámite, con los nombres y fechas conservados en su expediente. No contiene firmas autógrafas ni representa una firma electrónica certificada.', { align: 'left' });
            texto('La autenticidad y el estado vigente deben consultarse en el sistema institucional con el folio indicado.', { align: 'left' });
            const pages = doc.bufferedPageRange();
            for (let p = pages.start; p < pages.start + pages.count; p++) {
                doc.switchToPage(p);
                // El pie está fuera del flujo principal. Ampliar temporalmente
                // el margen evita que PDFKit abra otra página al escribirlo.
                const margenInferior = doc.page.margins.bottom;
                doc.page.margins.bottom = 0;
                doc.save();
                doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`${datos.folio}  ·  Página ${p + 1} de ${pages.count}`, MARGEN, doc.page.height - 38, { width: ancho, align: 'center', lineBreak: false });
                doc.restore();
                doc.page.margins.bottom = margenInferior;
            }
            doc.end();
        } catch (error) {
            doc.destroy();
            reject(error);
        }
    });
}

module.exports = { crearPdf };
