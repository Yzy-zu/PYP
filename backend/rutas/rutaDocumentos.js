const { Router } = require('express');
const db = require('../bd/base');
const validarToken = require('../validacion/valLogin');
const { soloRoles } = require('../seguridad/acceso');
const reglas = require('../negocio/reglas');
const historial = require('../documentos/historial');
const { crearPdf } = require('../documentos/pdf');
const router = Router();
router.use(validarToken, soloRoles('Docente', 'Administrador', 'RRHH'));

// Una consulta enlaza estado y último evento: no se mezcla una aprobación con un
// override concurrente al tomar la decisión de emitir el documento.
async function cargar(req) {
    const { tipo, id } = req.params;
    if (!Object.hasOwn(historial.tablas, tipo) || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) reglas.fallo('Identificador inválido.');
    const [[row]] = await db.execute(`SELECT t.*,r.accion AS ultima_accion,r.origen AS ultimo_origen,r.snapshot AS ultimo_snapshot
        FROM ${historial.tablas[tipo]} t LEFT JOIN revisiones_tramites r ON r.id=(
            SELECT MAX(h.id) FROM revisiones_tramites h WHERE h.tipo_tramite=? AND h.tramite_id=t.id)
        WHERE t.id=?`, [tipo, id]);
    if (!row || (req.usuario.rol === 'Docente' && row.usuario_id !== req.usuario.id)) reglas.fallo('Trámite no disponible.', 404);
    const snapshot = row.ultimo_snapshot && historial.leerSnapshot({ snapshot: row.ultimo_snapshot });
    const vigente = row.estado === 'Aprobado' && row.ultima_accion === 'Aprobado' && row.ultimo_origen === 'aplicacion'
        && snapshot?.visto_bueno && snapshot?.aprobacion && historial.mismoContenido(tipo, row, snapshot);
    const autorizadoPdf = !(req.usuario.rol === 'Administrador' && tipo === 'permiso');
    return { row, snapshot, vigente: Boolean(vigente), autorizadoPdf };
}
router.get('/:tipo/:id', async (req, res) => {
    try {
        const { vigente, autorizadoPdf } = await cargar(req);
        const [rows] = await db.execute(`SELECT accion,estado_anterior,estado_nuevo,actor_nombre,actor_rol,fecha,origen
            FROM revisiones_tramites WHERE tipo_tramite=? AND tramite_id=? ORDER BY id`, [req.params.tipo, req.params.id]);
        res.json({ ok: true, data: { historial: rows, documento_disponible: vigente && autorizadoPdf, folio: historial.folio(req.params.tipo, req.params.id) } });
    } catch (error) { reglas.responderError(res, error); }
});
router.get('/:tipo/:id/pdf', async (req, res) => {
    try {
        const { snapshot, vigente, autorizadoPdf } = await cargar(req);
        if (!autorizadoPdf) reglas.fallo('Este documento laboral está reservado al solicitante y a RH.', 403);
        if (!vigente) reglas.fallo('No hay un documento vigente con Vo.Bo. y aprobación verificables. Revisa el historial.', 409);
        const pdf = await crearPdf(snapshot);
        res.type('application/pdf').attachment(`${snapshot.folio}.pdf`).send(pdf);
    } catch (error) { reglas.responderError(res, error); }
});
module.exports = router;
