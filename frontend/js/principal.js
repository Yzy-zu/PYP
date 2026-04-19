//url api
const URL_BASE = '/api';
const socket = io();
let calendarioOficial;
let modalInstancia;
let modalDetalleDocenteInstancia;
let todosLosRegistrosGlobal = [];
let editandoId = null;
let modalConfirmacionInstancia;
let datosPendientes = null;
let urlPendiente = null;
let metodoPendiente = null;
let festivosGlobales = []; //

const token = sessionStorage.getItem('token');
const usuarioStr = sessionStorage.getItem('usuario');

//sockets para tiempo real
socket.on('pase-actualizado', (data) => {
    cargarDatosYActualizarCalendario();
    mostrarToast("La solicitud de Pase ha sido actualizada!", "info");
});

socket.on('permiso-actualizado', (data) => {
    cargarDatosYActualizarCalendario();
    mostrarToast("La solicitud de Permiso ha sido actualizada!", "info");
});
socket.on('actualizar-contadores', actualizarPresupuestoSalidas);

if (!token || !usuarioStr) window.location.href = "login.html";
const usuario = JSON.parse(usuarioStr);
if (usuario.rol !== 'Docente') window.location.href = "login.html";

function manejarSesionExpirada() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

function parseLocal(dateStr) {
    const partes = dateStr.split('-');
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

function actualizarBadges(registros) {
    let aprobados = 0, pendientes = 0, rechazados = 0;
    registros.forEach(reg => {
        if (reg.estado === 'Aprobado') aprobados++;
        else if (reg.estado === 'Pendiente') pendientes++;
        else if (reg.estado === 'Rechazado') rechazados++;
    });

    const bAprobados = document.getElementById('badge-aprobados');
    const bPendientes = document.getElementById('badge-pendientes');
    const bRechazados = document.getElementById('badge-rechazados');

    if (bAprobados) bAprobados.textContent = aprobados;
    if (bPendientes) bPendientes.textContent = pendientes;
    if (bRechazados) bRechazados.textContent = rechazados;
}

document.addEventListener('DOMContentLoaded', () => {
    modalInstancia = new bootstrap.Modal(document.getElementById('modalSolicitud'));
    modalSemanaFABInstancia = new bootstrap.Modal(document.getElementById('modalSemanaFAB'));
    modalDetalleDocenteInstancia = new bootstrap.Modal(document.getElementById('modalDetalleDocente'));
    document.getElementById('saludo-profesor').textContent = usuario.nombre_completo || "Docente";
    modalConfirmacionInstancia = new bootstrap.Modal(document.getElementById('modalConfirmacion'));
    modalPerfilInstancia = new bootstrap.Modal(document.getElementById('modalPerfil'));
    document.getElementById('link-perfil').addEventListener('click', (e) => {
        e.preventDefault();
        abrirPerfil(false);
    });

    inicializarMotorPDF();

    document.getElementById('link-seguridad').addEventListener('click', (e) => {
        e.preventDefault();
        abrirPerfil(true);
    });
    document.getElementById('form-cambiar-pass').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('pass-actual').value;
        const npassword = document.getElementById('pass-nueva').value;
        try {
            const resp = await fetch(`${URL_BASE}/login/npassword`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-token': token
                },
                body: JSON.stringify({ password, npassword })
            });

            const res = await resp.json();

            if (res.ok) {
                //si todo sale bien cerramos
                mostrarToast(res.msg);
                e.target.reset();
                modalPerfilInstancia.hide();
            } else {
                mostrarToast(res.msg, "error");
            }
        } catch (error) {
            mostrarToast("Error de conexión con el server", "error");
        }
    });
    const hoy = new Date().toISOString().split('T')[0];

    //limite a fechas
    const inputFechaPase = document.getElementById('fecha_uso');
    const inputFechaInicio = document.getElementById('fecha_inicio');

    if (inputFechaPase) inputFechaPase.setAttribute('min', hoy);
    if (inputFechaInicio) inputFechaInicio.setAttribute('min', hoy);


    document.getElementById('modalSolicitud').addEventListener('hidden.bs.modal', volverPaso1);

    const hInicioSelect = document.getElementById('hora_inicio');
    const hFinSelect = document.getElementById('hora_fin');
    if (hInicioSelect && hFinSelect) {
        hInicioSelect.innerHTML = '';
        hFinSelect.innerHTML = '';
        for (let i = 7; i <= 20; i++) {
            const horaFmt = i < 10 ? `0${i}:00` : `${i}:00`;
            const opcion = `<option value="${horaFmt}">${horaFmt}</option>`;
            hInicioSelect.innerHTML += opcion;
            hFinSelect.innerHTML += opcion;
        }
        hInicioSelect.addEventListener('change', actualizarLimitesHoraFin);
        actualizarLimitesHoraFin();
    }

    const inputDias = document.getElementById('cantidad_dias');
    if (inputDias) {
        inputDias.readOnly = true;
        document.getElementById('fecha_inicio').addEventListener('change', () => {
            actualizarLimitesFechaFin();
            calcularDiasPermiso();
        });
        document.getElementById('fecha_fin').addEventListener('change', calcularDiasPermiso);
    }

    document.getElementById('btn-logout').addEventListener('click', manejarSesionExpirada);

    document.getElementById('btn-elegir-pase').addEventListener('click', () => {
        document.getElementById('step-1-choice').style.display = 'none';
        document.getElementById('form-pedir-pase').style.display = 'block';
    });

    document.getElementById('btn-elegir-permiso').addEventListener('click', () => {
        document.getElementById('step-1-choice').style.display = 'none';
        document.getElementById('form-pedir-permiso').style.display = 'block';
    });

    pintarCalendario([]);
    cargarDatosYActualizarCalendario();
});

function mostrarToast(mensaje, tipo = 'success') {
    const toastEl = document.getElementById('toastNotificacion');
    const toastHeader = document.getElementById('toast-header-bg');
    document.getElementById('toast-mensaje').textContent = mensaje;
    let claseFondo = tipo === 'info' ? 'bg-info' : (tipo === 'error' || tipo === 'danger' ? 'bg-danger' : 'bg-success');
    toastHeader.className = `toast-header text-white ${claseFondo}`;
    new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

function volverPaso1() {
    editandoId = null;
    document.getElementById('step-1-choice').style.display = 'block';
    document.getElementById('form-pedir-pase').style.display = 'none';
    document.getElementById('form-pedir-permiso').style.display = 'none';
    document.getElementById('form-pedir-pase').reset();
    document.getElementById('form-pedir-permiso').reset();
}

function calcularDiasPermiso() {
    const fechaInicioStr = document.getElementById('fecha_inicio').value;
    const fechaFinStr = document.getElementById('fecha_fin').value;
    const inputDias = document.getElementById('cantidad_dias');
    const btnSubmit = document.querySelector('#form-pedir-permiso button[type="submit"]');

    if (!fechaInicioStr || !fechaFinStr) return;

    let f1 = parseLocal(fechaInicioStr);
    let f2 = parseLocal(fechaFinStr);

    if (f2 < f1) {
        mostrarToast("Fecha incorrecta", "error");
        inputDias.value = 0;
        if (btnSubmit) btnSubmit.disabled = true;
        return;
    }

    let diasHabiles = 0;
    let fechaAux = new Date(f1);
    while (fechaAux <= f2) {
        if (fechaAux.getDay() !== 0 && fechaAux.getDay() !== 6) diasHabiles++;
        fechaAux.setDate(fechaAux.getDate() + 1);
    }

    inputDias.value = diasHabiles;
    btnSubmit.disabled = (diasHabiles > 3 || diasHabiles <= 0);
    if (diasHabiles > 3) {
        mostrarToast("Maximo 3 dias permitidos", "error");
        inputDias.classList.add('is-invalid');
    } else {
        inputDias.classList.remove('is-invalid');
    }
}

function verDetallesSolicitud(data) {
    const esPase = data.tipoTramite === 'Pase';
    document.getElementById('v-det-tipo').textContent = data.tipoTramite;
    document.getElementById('v-det-motivo').textContent = data.motivo || 'Sin motivo';

    //muestra quien aprobo o rechazo
    const contRev = document.getElementById('v-cont-revision');
    if (data.estado !== 'Pendiente' && data.revisado_por_nombre) {
        contRev.style.display = 'block';
        document.getElementById('v-det-revisado-por').textContent = data.revisado_por_nombre;

        const f = new Date(data.fecha_revision);
        document.getElementById('v-det-fecha-revision').textContent =
            `${f.toLocaleDateString()} a las ${f.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hrs`;
    } else {
        contRev.style.display = 'none';
    }

    const labelFecha = document.getElementById('v-label-fecha');
    if (esPase) {
        labelFecha.textContent = "Fecha de Uso";
        document.getElementById('v-det-fecha').textContent = data.fecha_uso_h;
        document.getElementById('v-cont-horas').style.display = 'block';
        document.getElementById('v-cont-fin').style.display = 'none';
        document.getElementById('v-cont-dias').style.display = 'none';
        document.getElementById('v-det-horas').textContent = `${data.hora_inicio.substring(0, 5)} - ${data.hora_fin.substring(0, 5)}`;
    } else {
        labelFecha.textContent = "Fecha Inicio";
        document.getElementById('v-det-fecha').textContent = data.fecha_inicio_h;
        document.getElementById('v-cont-horas').style.display = 'none';
        document.getElementById('v-cont-fin').style.display = 'block';
        document.getElementById('v-cont-dias').style.display = 'block';
        document.getElementById('v-det-fecha-fin').textContent = data.fecha_fin_h;
        document.getElementById('v-det-dias').textContent = `${data.cantidad_dias} día(s)`;
    }

    const btnPDF = document.getElementById('btn-descargar-pdf');
    if (btnPDF) {
        if (data.estado === 'Aprobado') {
            btnPDF.style.display = 'block';
            btnPDF.onclick = async () => {
                const textOrigin = btnPDF.innerHTML;
                btnPDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Generando...';
                btnPDF.disabled = true;
                try {
                    if (data.tipoTramite === 'Pase') {
                        await pdfPase(data, usuario);
                    } else {
                        await pdfPermiso(data, usuario);
                    }
                } catch (e) {
                    mostrarToast("Error construyendo PDF", "error");
                } finally {
                    btnPDF.innerHTML = textOrigin;
                    btnPDF.disabled = false;
                }
            };
        } else {
            btnPDF.style.display = 'none';
        }
    }


    document.getElementById('v-det-tipo-badge').className = `badge rounded-pill px-3 py-2 ${esPase ? 'bg-info text-dark' : 'bg-primary'}`;
    const badgeEstado = document.getElementById('v-det-estado-badge');
    badgeEstado.textContent = data.estado;

    const colorEstado = data.estado === 'Aprobado' ? 'bg-success' :
        (data.estado === 'Vo.Bo.' ? 'bg-info text-white' :
            (data.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'));

    badgeEstado.className = `badge fs-6 ${colorEstado}`;

    modalDetalleDocenteInstancia.show();
}

async function cargarDatosYActualizarCalendario() {
    try {
        const [resPases, resPermisos, resFest] = await Promise.all([
            fetch(`${URL_BASE}/pases/ver`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/permisos/ver`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/dias/ver`, { headers: { 'x-token': token } })
        ]);

        if (resPases.status === 401 || resPermisos.status === 401) return manejarSesionExpirada();

        const dataPases = await resPases.json();
        const dataPermisos = await resPermisos.json();
        festivosGlobales = await resFest.json();

        if (dataPases.ok && dataPermisos.ok) {
            const pasesM = (dataPases.data || []).map(p => ({ ...p, tipoTramite: 'Pase', fechaClave: p.fecha_uso }));
            const permisosM = (dataPermisos.data || []).map(p => ({ ...p, tipoTramite: 'Permiso', fechaClave: p.fecha_inicio }));
            todosLosRegistrosGlobal = [...pasesM, ...permisosM];

            const eventosTramites = todosLosRegistrosGlobal.map(reg => ({
                title: `${reg.tipoTramite}: ${reg.estado}`,
                start: reg.fechaClave.split('T')[0],
                backgroundColor: reg.estado === 'Aprobado' ? '#198754' :
                    (reg.estado === 'Vo.Bo.' ? '#02c4ff' :
                        (reg.estado === 'Pendiente' ? '#ffc107' : '#dc3545')),
                borderColor: 'transparent',
                extendedProps: { ...reg }
            }));

            const eventosFestivos = festivosGlobales.map(f => ({
                title: ` ${f.descripcion}`,
                start: f.fecha.split('T')[0],
                display: 'background',
                backgroundColor: 'rgba(25, 135, 84, 0.2)',
                extendedProps: { esBloqueado: true, msg: f.descripcion }
            }));

            const cumpleMesDia = usuario?.fecha_nacimiento ? usuario.fecha_nacimiento.substring(5, 10) : null;
            const añoActual = new Date().getFullYear();

            pintarHistorial(todosLosRegistrosGlobal);
            actualizarBadges(todosLosRegistrosGlobal);
            calendarioOficial.removeAllEventSources();
            calendarioOficial.addEventSource(eventosTramites);
            calendarioOficial.addEventSource(eventosFestivos);

            if (cumpleMesDia) {
                const eventoCumple = {
                    title: "Cumpleaños",
                    start: `${añoActual}-${cumpleMesDia}`,
                    backgroundColor: '#ffc107',
                    borderColor: '#ffc107',
                    allDay: true,
                    extendedProps: { esBloqueado: true, msg: "tu cumpleaños" }
                };
                calendarioOficial.addEventSource([eventoCumple]);
            }
        }
    } catch (e) { mostrarToast("Error de sincronizacion", "error"); }
}

function pintarCalendario(eventos) {
    if (calendarioOficial) calendarioOficial.destroy();

    calendarioOficial = new FullCalendar.Calendar(document.getElementById('calendario'), {
        initialView: 'dayGridMonth', locale: 'es', height: '100%',
        events: eventos,
        buttonText: {
            today: 'Hoy',
            month: 'mes',
            week: 'semana',
            day: 'día',
            list: 'agenda'
        },
        //conf para celular
        windowResize: function (arg) {
            if (window.innerWidth < 768) {
                //si es vista celular:
                calendarioOficial.setOption('headerToolbar', {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                });
            } else {
                //si es pc:
                calendarioOficial.setOption('headerToolbar', {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listMonth'
                });
            }
        },


        dayCellClassNames: (arg) => {
            const fechaCelda = arg.date.toISOString().split('T')[0];
            const cumpleMesDia = usuario?.fecha_nacimiento ? usuario.fecha_nacimiento.substring(5, 10) : null;

            //fines de semana
            if (arg.date.getDay() === 0 || arg.date.getDay() === 6) return ['bg-light'];

            //festivo o cumple
            const esFestivo = festivosGlobales.some(f => f.fecha.split('T')[0] === fechaCelda);
            const esCumple = cumpleMesDia && (fechaCelda.substring(5, 10) === cumpleMesDia);

            //si el dia esta ocupado:
            const diaOcupado = verificarDias(fechaCelda);

            //bloqueamos dia 
            if (esFestivo || esCumple || diaOcupado) {
                return ['dia-bloqueado'];
            }

            return [];
        },


        dateClick: (info) => {
            const hoyCheck = new Date();
            hoyCheck.setHours(0, 0, 0, 0);
            const fechaClick = new Date(info.dateStr + 'T00:00:00');

            //si es pasado bloqueamos
            if (fechaClick < hoyCheck) {
                mostrarToast("No puedes solicitar dias pasados", "error");
                return;
            }
            if (info.dayEl.classList.contains('dia-bloqueado') || info.date.getDay() === 0 || info.date.getDay() === 6) {
                if (verificarDias(info.dateStr)) {
                    mostrarToast("Ya tienes un trámite activo para este día", "error");
                } else {
                    const esCumple = usuario?.fecha_nacimiento && info.dateStr.substring(5, 10) === usuario.fecha_nacimiento.substring(5, 10);
                    mostrarToast(esCumple ? "Feliz cumpleaños!!!" : "No hay labores este dia", "info");
                }
                return;
            }

            volverPaso1();
            document.getElementById('fecha_uso').value = info.dateStr;
            document.getElementById('fecha_inicio').value = info.dateStr;
            actualizarLimitesFechaFin();
            document.getElementById('fecha_fin').value = info.dateStr;
            calcularDiasPermiso();
            modalInstancia.show();
        },

        eventClick: (info) => {
            if (info.event.extendedProps.esBloqueado) return;
            verDetallesSolicitud(info.event.extendedProps);
        }
    });
    calendarioOficial.render();
}
function pintarHistorial(registros) {

    const contenedor = document.getElementById('historial-lista');
    contenedor.innerHTML = '';



    [...registros].sort((a, b) => {
        const prioridad = { 'Pendiente': 1, 'Vo.Bo.': 2, 'Aprobado': 3, 'Rechazado': 4, 'Cancelado': 5 };
        const pA = prioridad[a.estado] || 99;
        const pB = prioridad[b.estado] || 99;
        //estado reciente
        if (pA !== pB) return pA - pB;
        //id reciente
        return b.id - a.id;

    }).slice(0, 59).forEach(reg => {
        const fechaParaMostrar = reg.fecha_uso_h || reg.fecha_inicio_h;
        let borderClass = reg.estado === 'Aprobado' ? 'border-success' : (reg.estado === 'Vo.Bo.' ? 'border-info' :
            (reg.estado === 'Pendiente' ? 'border-warning' : 'border-danger'));
        const div = document.createElement('div');
        div.className = `card mb-2 shadow-sm border-0 border-start border-4 ${borderClass}`;
        div.style.cursor = 'pointer';
        div.onclick = () => verDetallesSolicitud(reg);
        div.innerHTML = `
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="fw-bold small text-truncate pe-2" style="max-width: 65%;">${reg.motivo || 'Sin motivo'}</span>
                    <span class="text-muted" style="font-size: 0.75rem;">${fechaParaMostrar}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mt-1">
                    <span class="badge ${reg.estado === 'Aprobado' ? 'bg-success' :
                (reg.estado === 'Vo.Bo.' ? 'bg-info text-white' :
                    (reg.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'))
            }" style="font-size: 0.65rem;">${reg.estado}
                    </span>
                    <span class="badge ${reg.tipoTramite === 'Permiso' ? 'bg-success' :
                (reg.tipoTramite === 'Pase' ? 'bg-info text-white' : 'bg-secondary')
            }"
                 style="font-size: 0.65rem;">${reg.tipoTramite}
                    </span>
                    ${reg.estado === 'Pendiente' ? `
                        <div class="btn-group" onclick="event.stopPropagation()">
                            <button class="btn btn-sm btn-outline-primary p-1" onclick="prepararEdicion('${reg.tipoTramite}', ${reg.id})"><i class="fa-solid fa-pen" style="font-size: 0.7rem;"></i></button>
                            <button class="btn btn-sm btn-outline-danger p-1" onclick="cancelarSolicitud('${reg.tipoTramite}', ${reg.id})"><i class="fa-solid fa-trash" style="font-size: 0.7rem;"></i></button>
                        </div>` : ''}
                </div>
            </div>`;
        contenedor.appendChild(div);
    });
}
function prepararEdicion(tipo, id) {
    const reg = todosLosRegistrosGlobal.find(r => r.id === id && r.tipoTramite === tipo);
    editandoId = id;

    document.getElementById('step-1-choice').style.display = 'none';
    document.getElementById('form-pedir-pase').style.display = 'none';
    document.getElementById('form-pedir-permiso').style.display = 'none';

    if (tipo === 'Pase') {
        document.getElementById('form-pedir-pase').style.display = 'block';
        document.getElementById('fecha_uso').value = reg.fecha_uso.split('T')[0];
        document.getElementById('hora_inicio').value = reg.hora_inicio.substring(0, 5);
        document.getElementById('hora_fin').value = reg.hora_fin.substring(0, 5);
        document.getElementById('motivo_pase').value = reg.motivo;
    } else {
        document.getElementById('form-pedir-permiso').style.display = 'block';
        document.getElementById('tipo_permiso').value = reg.tipo_permiso;
        document.getElementById('fecha_inicio').value = reg.fecha_inicio.split('T')[0];
        document.getElementById('fecha_fin').value = reg.fecha_fin.split('T')[0];
        document.getElementById('cantidad_dias').value = reg.cantidad_dias;
        document.getElementById('motivo').value = reg.motivo;
        actualizarLimitesFechaFin();
    }
    modalInstancia.show();
}

//cancelar un tramite
function cancelarSolicitud(tipo, id) {
    const endpoint = tipo === 'Pase' ? 'pases' : 'permisos';
    urlPendiente = `${URL_BASE}/${endpoint}/cancelar`;
    metodoPendiente = 'PATCH';
    datosPendientes = { id, cancelar: "Cancelado" };

    //modal de cancelacion
    document.getElementById('conf-resumen').innerHTML = `
        <div class="text-center">
            <i class="fa-solid fa-circle-exclamation text-danger mb-3" style="font-size: 3rem;"></i>
            <h5 class="mb-2">¿Confirmas la cancelación?</h5>
            <p class="text-muted">Estás a punto de cancelar tu <strong>${tipo}</strong> con folio <strong>#${id}</strong>.</p>
            <div class="alert alert-warning py-2 small">
                <i class="fa-solid fa-info-circle me-1"></i> Esta acción no se puede deshacer.
            </div>
        </div>
    `;

    modalConfirmacionInstancia.show();
}


document.getElementById('form-pedir-pase').addEventListener('submit', (e) => {
    e.preventDefault();
    const fechaUso = document.getElementById('fecha_uso').value;

    if (!editandoId && verificarDias(fechaUso)) {
        return mostrarToast("Ya tienes una solicitud activa para esa fecha", "error");
    }
    const hInicio = document.getElementById('hora_inicio').value;
    const hFin = document.getElementById('hora_fin').value;
    const motivo = document.getElementById('motivo_pase').value;
    if (hFin <= hInicio) return mostrarToast("Hora incorrecta", "error");
    datosPendientes = { fecha_uso: fechaUso, hora_inicio: hInicio, hora_fin: hFin, motivo, id: editandoId };
    urlPendiente = editandoId ? `${URL_BASE}/pases/mod` : `${URL_BASE}/pases/crear`;
    metodoPendiente = editandoId ? 'PATCH' : 'POST';
    document.getElementById('conf-resumen').innerHTML = `<strong>Pase</strong>: ${fechaUso} de ${hInicio} a ${hFin}`;
    modalConfirmacionInstancia.show();
});

document.getElementById('form-pedir-permiso').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = document.getElementById('tipo_permiso').value;
    const fechaI = document.getElementById('fecha_inicio').value;
    const fechaF = document.getElementById('fecha_fin').value;

    let temp = new Date(fechaI + 'T00:00:00');
    const fFinal = new Date(fechaF + 'T00:00:00');

    while (temp <= fFinal) {
        if (!editandoId && verificarDias(temp.toISOString().split('T')[0])) {
            return mostrarToast(`El día ${temp.toLocaleDateString()} ya está ocupado`, "error");
        }
        temp.setDate(temp.getDate() + 1);
    }
    const maxD = parseInt(document.getElementById('cantidad_dias').value) || 0;
    if (maxD > 3 || maxD <= 0) return mostrarToast("Días de permiso excedidos o inválidos", "error");
    const dias = document.getElementById('cantidad_dias').value;
    const motivo = document.getElementById('motivo').value;
    datosPendientes = { tipo_permiso: tipo, fecha_inicio: fechaI, fecha_fin: fechaF, cantidad_dias: dias, motivo, id: editandoId };
    urlPendiente = editandoId ? `${URL_BASE}/permisos/mod` : `${URL_BASE}/permisos/crear`;
    metodoPendiente = editandoId ? 'PATCH' : 'POST';
    document.getElementById('conf-resumen').innerHTML = `<strong>Permiso</strong>: ${tipo} del ${fechaI} al ${fechaF}`;
    modalConfirmacionInstancia.show();
});

document.getElementById('btn-confirmar-envio').addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirmar-envio');
    btn.disabled = true;
    try {
        const resp = await fetch(urlPendiente, {
            method: metodoPendiente,
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify(datosPendientes)
        });
        const res = await resp.json();
        modalConfirmacionInstancia.hide();
        if (res.ok) {
            modalInstancia.hide(); volverPaso1(); cargarDatosYActualizarCalendario();
            mostrarToast("Operación exitosa");
        } else { mostrarToast(res.msg, "error"); }
    } catch (e) { mostrarToast("Error de servidor", "error"); }
    finally { btn.disabled = false; }
});

//limites
function actualizarLimitesHoraFin() {
    const hIn = document.getElementById('hora_inicio');
    const hFi = document.getElementById('hora_fin');
    if (!hIn || !hFi || !hIn.value) return;
    const hInNum = parseInt(hIn.value.split(':')[0]);

    let isCurrentDisabled = false;
    Array.from(hFi.options).forEach(opt => {
        const hFiNum = parseInt(opt.value.split(':')[0]);
        opt.disabled = (hFiNum <= hInNum || hFiNum > hInNum + 3);
        if (opt.value === hFi.value && opt.disabled) isCurrentDisabled = true;
    });

    if (isCurrentDisabled) {
        hFi.value = (hInNum + 1 < 10 ? '0' : '') + (hInNum + 1) + ':00';
    }
}

function actualizarLimitesFechaFin() {
    const iI = document.getElementById('fecha_inicio');
    const iF = document.getElementById('fecha_fin');
    if (!iI || !iF || !iI.value) return;
    iF.min = iI.value;

    let fMax = parseLocal(iI.value);

    let dH = (fMax.getDay() === 0 || fMax.getDay() === 6) ? 0 : 1;
    while (dH < 3) {
        fMax.setDate(fMax.getDate() + 1);
        if (fMax.getDay() !== 0 && fMax.getDay() !== 6) dH++;
    }

    const y = fMax.getFullYear();
    const m = String(fMax.getMonth() + 1).padStart(2, '0');
    const d = String(fMax.getDate()).padStart(2, '0');
    iF.max = `${y}-${m}-${d}`;

    if (iF.value > iF.max || iF.value < iF.min) iF.value = iI.value;
}

function abrirPerfil(conSeguridad) {
    const u = JSON.parse(sessionStorage.getItem('usuario'));

    //llenamos el modal
    document.getElementById('p-nombre').textContent = u.nombre_completo;
    document.getElementById('p-rfc').textContent = u.rfc || 'No registrado';
    document.getElementById('p-categoria').textContent = u.categoria || 'N/A';
    document.getElementById('p-area').textContent = u.area_adscripcion || 'N/A';
    document.getElementById('p-ingreso').textContent = u.fecha_ingreso ? u.fecha_ingreso.split('T')[0] : 'N/A';
    document.getElementById('p-contrato').textContent = u.tipo_contrato || 'N/A';

    //password
    document.getElementById('info-laboral-perfil').style.display = conSeguridad ? 'none' : 'flex';
    document.getElementById('seccion-seguridad').style.display = conSeguridad ? 'block' : 'none';
    const titulo = document.querySelector('#modalPerfil .modal-title');
    titulo.innerHTML = conSeguridad
        ? '<i class="fa-solid fa-key me-2 text-warning"></i> Actualizar Seguridad'
        : '<i class="fa-solid fa-user-gear me-2"></i> Expediente Docente';
    modalPerfilInstancia.show();
}
function verificarDias(fechaNueva) {
    const fechaBusqueda = typeof fechaNueva === 'string' ? fechaNueva : fechaNueva.toISOString().split('T')[0];

    return todosLosRegistrosGlobal.some(reg => {
        if (reg.estado === 'Rechazado' || reg.estado === 'Cancelado') return false;

        if (reg.tipoTramite === 'Pase') {
            return reg.fecha_uso.split('T')[0] === fechaBusqueda;
        } else {
            const inicio = new Date(reg.fecha_inicio.split('T')[0]);
            const fin = new Date(reg.fecha_fin.split('T')[0]);
            const actual = new Date(fechaBusqueda);
            return (actual >= inicio && actual <= fin);
        }
    });
}
//funcion para contadores
async function actualizarPresupuestoSalidas() {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    try {
        const resp = await fetch('/api/login/contadores', {
            headers: { 'x-token': token }
        });
        const data = await resp.json();

        if (data.ok) {
            renderizarBarra('pases', data.pases.usados);
            renderizarBarra('permisos', data.permisos.usados);
        }
    } catch (error) {
        console.error("Error al cargar presupuesto:", error);
    }
}
//funcion para barra visual
function renderizarBarra(tipo, usados) {
    const badge = document.getElementById(`${tipo}-badge`);
    const bar = document.getElementById(`${tipo}-bar`);
    const porcentaje = (usados / 3) * 100;

    badge.textContent = `${usados} / 3`;
    bar.style.width = `${porcentaje}%`;

    //logica de colores
    if (usados >= 3) {
        badge.className = "badge rounded-pill bg-danger";
        bar.className = "progress-bar bg-danger";
    } else if (usados === 2) {
        badge.className = "badge rounded-pill bg-warning text-dark";
        bar.className = "progress-bar bg-warning";
    } else {
        badge.className = "badge rounded-pill bg-success";
        bar.className = "progress-bar bg-success";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    actualizarPresupuestoSalidas();
});
//version movil
function cambiarTabApp(index) {
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content-area');
    const tabHome = document.getElementById('tab-home');
    const tabCal = document.getElementById('tab-cal');

    if (index === 0) {
        sidebar.classList.remove('hidden-tab');
        content.classList.remove('active-tab');
        if (tabHome) tabHome.classList.add('active');
        if (tabCal) tabCal.classList.remove('active');
    } else if (index === 1) {
        sidebar.classList.add('hidden-tab');
        content.classList.add('active-tab');
        if (tabHome) tabHome.classList.remove('active');
        if (tabCal) tabCal.classList.add('active');

        if (calendarioOficial) {
            setTimeout(() => {
                calendarioOficial.updateSize();
            }, 50);
        }
    }
}

//semana actual
function abrirModalSemanaRAPIDO() {
    const contenedor = document.getElementById('contenedor-dias-semana');
    contenedor.innerHTML = '';

    const hoyReal = new Date();
    //ajustar 7 dias de la semana
    const diaSemana = hoyReal.getDay() === 0 ? 7 : hoyReal.getDay();
    const hoyCheck = new Date();
    hoyCheck.setHours(0, 0, 0, 0);

    const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

    for (let i = 1; i <= 5; i++) {
        const diaTarget = new Date(hoyReal.getFullYear(), hoyReal.getMonth(), hoyReal.getDate());
        diaTarget.setDate(hoyReal.getDate() - diaSemana + i);


        const y = diaTarget.getFullYear();
        const m = String(diaTarget.getMonth() + 1).padStart(2, '0');
        const d = String(diaTarget.getDate()).padStart(2, '0');
        const fechaStr = `${y}-${m}-${d}`;

        const esPasado = diaTarget < hoyCheck;
        const ocupado = verificarDias(fechaStr);
        const esFestivo = festivosGlobales.some(f => f.fecha.split('T')[0] === fechaStr);
        const esCumple = usuario?.fecha_nacimiento && fechaStr.substring(5, 10) === usuario.fecha_nacimiento.substring(5, 10);

        const esBloqueado = esPasado || ocupado || esFestivo || esCumple;

        let labelEstado = '';
        if (esPasado) labelEstado = 'Pasado';
        else if (esFestivo) labelEstado = 'Festivo';
        else if (esCumple) labelEstado = 'Cumpleaños';
        else if (ocupado) labelEstado = 'Ocupado';

        const btn = document.createElement('button');
        btn.className = `btn w-100 fw-bold d-flex justify-content-between align-items-center mb-1 ${esBloqueado ? 'btn-light border text-muted' : 'btn-outline-primary'}`;
        btn.style.borderRadius = "14px";
        btn.innerHTML = `<span class="fs-6">${nombresDias[i - 1]} ${diaTarget.getDate()} ${labelEstado ? `<span class="badge bg-secondary ms-2 opacity-50" style="font-size:0.6rem">${labelEstado}</span>` : ''}</span> <i class="fa-solid ${esBloqueado ? 'fa-ban text-danger opacity-50' : 'fa-chevron-right'}"></i>`;

        if (!esBloqueado) {
            btn.onclick = () => {
                modalSemanaFABInstancia.hide();

                volverPaso1();
                document.getElementById('fecha_uso').value = fechaStr;
                document.getElementById('fecha_inicio').value = fechaStr;
                actualizarLimitesFechaFin();
                document.getElementById('fecha_fin').value = fechaStr;
                calcularDiasPermiso();
                setTimeout(() => modalInstancia.show(), 350);
            };
        }

        contenedor.appendChild(btn);
    }

    modalSemanaFABInstancia.show();
}