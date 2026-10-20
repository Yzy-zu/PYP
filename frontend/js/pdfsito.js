// Los documentos se construyen y autorizan en el servidor a partir de la solicitud guardada.
async function descargarDocumentoSolicitud(tipo, id) {
    if (!['pase', 'permiso'].includes(tipo) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
        throw new Error('Solicitud inválida.');
    }
    const respuesta = await fetch(`/api/documentos/${tipo}/${encodeURIComponent(id)}/pdf`, {
        headers: { 'x-token': sessionStorage.getItem('token') || '' },
        cache: 'no-store'
    });
    if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => ({}));
        throw new Error(error.msg || 'No se pudo descargar el documento autorizado.');
    }
    if (!respuesta.headers.get('content-type')?.includes('application/pdf')) {
        throw new Error('El servidor no entregó un documento PDF.');
    }
    const archivo = await respuesta.blob();
    const enlace = URL.createObjectURL(archivo);
    const link = document.createElement('a');
    link.href = enlace;
    link.download = `${tipo === 'pase' ? 'PASE' : 'PERM'}-${String(id).padStart(8, '0')}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(enlace), 1000);
}

// Se conservan las firmas usadas por las pantallas; los datos y nombres del cliente no crean el PDF.
async function pdfPase(datosPase, usuario) {
    return descargarDocumentoSolicitud('pase', datosPase.id);
}

async function pdfPermiso(datos, usuario) {
    return descargarDocumentoSolicitud('permiso', datos.id);
}

function fechaRevisionDocumento(valor) {
    const fecha = new Date(valor);
    return valor && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short' })
        : 'Fecha no registrada';
}

// Cada modal consulta su evidencia al abrirse. Una respuesta tardía no reemplaza otra solicitud.
async function cargarDocumentoSolicitud(datos, idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    const boton = document.getElementById('btn-descargar-pdf');
    if (!contenedor || !boton) return;
    const consulta = Symbol('documento');
    contenedor.consultaDocumento = consulta;
    boton.consultaDocumento = consulta;
    contenedor.style.display = 'block';
    contenedor.textContent = 'Cargando historial de revisión…';
    boton.style.display = 'none';
    boton.disabled = true;
    boton.onclick = null;
    boton.textContent = 'Descargar PDF';
    const tipo = datos.tipoTramite === 'Pase' ? 'pase' : 'permiso';
    try {
        const respuesta = await fetch(`/api/documentos/${tipo}/${encodeURIComponent(datos.id)}`, {
            headers: { 'x-token': sessionStorage.getItem('token') || '' }, cache: 'no-store'
        });
        const resultado = await respuesta.json();
        if (!respuesta.ok || !resultado.ok) throw new Error(resultado.msg || 'No se pudo cargar el historial de revisión.');
        if (contenedor.consultaDocumento !== consulta) return;
        const documento = resultado.data;
        contenedor.textContent = '';
        const titulo = document.createElement('h6');
        titulo.className = 'fw-bold mb-2';
        titulo.textContent = 'Historial de revisión';
        contenedor.appendChild(titulo);
        if (documento.folio) {
            const folio = document.createElement('p');
            folio.className = 'small mb-2';
            folio.textContent = `Folio: ${documento.folio}`;
            contenedor.appendChild(folio);
        }
        const historial = Array.isArray(documento.historial) ? documento.historial : [];
        if (historial.length) {
            const lista = document.createElement('ol');
            lista.className = 'small mb-2 ps-3';
            historial.forEach(revision => {
                const item = document.createElement('li');
                item.className = 'mb-2';
                const accion = document.createElement('strong');
                accion.textContent = `${revision.accion || revision.estado_nuevo || 'Registro'} · ${revision.actor_nombre || 'Autor no registrado'}${revision.actor_rol ? ` (${revision.actor_rol})` : ''}`;
                const detalle = document.createElement('div');
                detalle.textContent = `${fechaRevisionDocumento(revision.fecha)} · ${revision.estado_anterior || 'Sin estado anterior'} → ${revision.estado_nuevo || 'Sin estado registrado'}`;
                item.append(accion, detalle);
                if (revision.origen) {
                    const origen = document.createElement('div');
                    origen.className = 'text-muted';
                    origen.textContent = `Origen: ${revision.origen}`;
                    item.appendChild(origen);
                }
                lista.appendChild(item);
            });
            contenedor.appendChild(lista);
        } else {
            const aviso = document.createElement('p');
            aviso.className = 'small mb-2';
            aviso.textContent = 'No hay revisiones registradas con evidencia. El estado histórico por sí solo no acredita las aprobaciones.';
            contenedor.appendChild(aviso);
        }
        const disponible = datos.estado === 'Aprobado' && documento.documento_disponible === true;
        if (!disponible) {
            const aviso = document.createElement('p');
            aviso.className = 'small text-muted mb-0';
            aviso.textContent = 'Documento no disponible para esta solicitud o perfil.';
            contenedor.appendChild(aviso);
            return;
        }
        boton.style.display = 'block';
        boton.disabled = false;
        boton.onclick = async () => {
            boton.disabled = true;
            boton.textContent = 'Descargando…';
            try {
                if (tipo === 'pase') await pdfPase(datos);
                else await pdfPermiso(datos);
            } catch (error) {
                if (boton.consultaDocumento === consulta) mostrarToast(error.message || 'No se pudo descargar el PDF.', 'error');
            } finally {
                if (boton.consultaDocumento === consulta) {
                    boton.disabled = false;
                    boton.textContent = 'Descargar PDF';
                }
            }
        };
    } catch (error) {
        if (contenedor.consultaDocumento !== consulta) return;
        contenedor.textContent = error.message || 'No se pudo cargar el historial de revisión.';
    }
}
