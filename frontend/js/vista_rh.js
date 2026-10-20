//direccion de la api para hacer consultas
const URL_BASE = '/api';
//conexion para recibir avisos al momento
const socket = Seguridad.socket();
//lista para guardar todos los registros
let registrosGlobales = [];
let registrosVisiblesRH = [];
const seleccionRH = new Set();
let enviandoRH = false;
let recargaPendienteRH = false;
let requiereRecargaRH = false;
let cargaActualRH = 0;
let ordenRH = 'reciente';
const claveRH = reg => `${reg.tipoTramite}:${reg.id}`;

function avisarActualizacionRH() {
    recargaPendienteRH = true;
    actualizarSeleccionRH();
}
//variable para el objeto del calendario de rh
let calendarioRH;
//variable para la ventana de detalles de rh
let modalDetalleRH;

//sacamos la llave y el usuario de la sesion
const token = sessionStorage.getItem('token');
const usuarioStr = sessionStorage.getItem('usuario');

//escuchamos cuando se crea o cambia un pase o permiso
socket.on('nuevo-pase-creado', () => { cargarDatosGenerales(); mostrarToast("¡Nuevo pase solicitado!", "info"); });
socket.on('pase-actualizado', () => { cargarDatosGenerales(); });
socket.on('nuevo-permiso-creado', (data) => { cargarDatosGenerales(); mostrarToast("¡Nueva solicitud de Permiso recibida!", "info"); });
socket.on('permiso-actualizado', () => { cargarDatosGenerales(); });

//si no hay sesion mandamos al usuario al login
if (!token || !usuarioStr) window.location.href = "login.html";
//pasamos los datos del usuario a un objeto
const usuario = JSON.parse(usuarioStr);
//si no es de recursos humanos lo sacamos de aqui
if (usuario.rol !== 'RRHH') window.location.href = "login.html";

//limpiamos la memoria y mandamos al login
function manejarSesionExpirada() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

//metemos el html de los avisos al final del cuerpo
document.body.insertAdjacentHTML('beforeend', `
    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999; margin-bottom: 85px;">
        <div id="toastRH" class="toast" role="alert"><div class="toast-header text-white" id="toast-header-rh"><strong class="me-auto">RRHH</strong></div>
        <div class="toast-body fw-bold" id="toast-msg-rh"></div></div>
    </div>`);

//funcion para mostrar los mensajes flotantes
function mostrarToast(mensaje, tipo = 'success') {
//buscamos los elementos del mensaje
    const toastEl = document.getElementById('toastRH');
    const header = document.getElementById('toast-header-rh');
    document.getElementById('toast-msg-rh').textContent = mensaje;
//cambiamos el color segun si es exito o error
    let claseFondo = 'bg-success';
    if (tipo === 'danger' || tipo === 'error') claseFondo = 'bg-danger';
    if (tipo === 'info') claseFondo = 'bg-info';
//ponemos las clases de bootstrap al encabezado
    header.className = `toast-header text-white ${claseFondo}`;
    new bootstrap.Toast(toastEl, { delay: 3000 }).show();
}

//cuando la pagina este lista arrancamos todo
Seguridad.alCargar(() => {
    modalDetalleRH = new bootstrap.Modal(document.getElementById('modalDetalleRH'));
    document.getElementById('saludo-rh').textContent = `RH: ${usuario.nombre_completo}` || "RRHH";


//configuramos el boton para salir de la cuenta
    document.getElementById('btn-logout').addEventListener('click', () => {
        Seguridad.salir();
    });

//ajustamos el tamaño del calendario cuando se abre la vista lateral
    const offcanvasCal = document.getElementById('offcanvasCalendario');
    if (offcanvasCal) {
        offcanvasCal.addEventListener('shown.bs.offcanvas', () => {
            if (!calendarioRH) inicializarCalendarioRH();
            else calendarioRH.updateSize();
        });
    }

//ponemos el evento al boton de los filtros
    const btnFiltros = document.getElementById('btn-aplicar-filtros');
    if (btnFiltros) btnFiltros.addEventListener('click', aplicarFiltros);

//traemos toda la info de la base de datos
    document.getElementById('btn-seleccionar-rh')?.addEventListener('click', seleccionarTodoMasivo);
    document.getElementById('btn-aprobar-rh')?.addEventListener('click', aprobarSeleccionMasiva);
    document.getElementById('btn-actualizar-rh')?.addEventListener('click', () => {
        if (enviandoRH) return;
        seleccionRH.clear();
        cargarDatosGenerales({ forzar: true });
    });
    const vista = new URLSearchParams(window.location.search).get('view');
    cargarDatosGenerales().then(() => {
        if (vista === 'autorizar') document.getElementById('solicitudes-rh')?.scrollIntoView();
        if (vista === 'historial') document.getElementById('historial-rh')?.scrollIntoView();
    });
});
//obtener datos desde backend
async function cargarDatosGenerales({ forzar = false } = {}) {
    if (!forzar && (enviandoRH || seleccionRH.size)) {
        avisarActualizacionRH();
        return false;
    }
    const carga = ++cargaActualRH;
    try {
//pedimos pases permisos y feriados al mismo tiempo
        const [resPases, resPermisos, resFest] = await Promise.all([
            fetch(`${URL_BASE}/pases/todos`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/permisos/todos`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/dias/ver`, { headers: { 'x-token': token } })
        ]);

//si la llave ya no sirve sacamos al usuario
        if (resPases.status === 401 || resPermisos.status === 401) return manejarSesionExpirada();

        const dataP = await resPases.json();
        const dataM = await resPermisos.json();
        if (!resPases.ok || !resPermisos.ok || !dataP.ok || !dataM.ok) throw new Error('No se pudieron consultar todos los trámites.');
        if (carga !== cargaActualRH) return false;
        if (!forzar && (enviandoRH || seleccionRH.size)) { avisarActualizacionRH(); return false; }
//guardamos los feriados en una variable global
        const festivos = resFest.ok ? await resFest.json() : [];
        if (carga !== cargaActualRH) return false;
        if (!forzar && (enviandoRH || seleccionRH.size)) { avisarActualizacionRH(); return false; }
        window.festivosGlobalesRH = festivos;

//etiquetamos cada registro para saber que tipo es
        const mPases = (dataP.data || []).map(p => ({ ...p, tipoTramite: 'Pase', fechaClave: p.fecha_uso }));
        const mPermisos = (dataM.data || []).map(p => ({ ...p, tipoTramite: 'Permiso', fechaClave: p.fecha_inicio }));

//juntamos todo y lo ordenamos por la fecha
        let todos = [...mPases, ...mPermisos].sort((a, b) => new Date(a.fechaClave) - new Date(b.fechaClave));

//ordenamos para que los mas nuevos salgan primero
        registrosGlobales = todos.sort((a, b) => new Date(b.fechaClave) - new Date(a.fechaClave));

//mandamos los datos a dibujar en la pantalla
        recargaPendienteRH = false;
        requiereRecargaRH = false;
        if (!enviandoRH) procesarFiltrosRH();
        return true;

    } catch (e) {
        console.error("Error al cargar datos de rh", e);
        mostrarToast("No se pudieron actualizar los estados. Conservamos la última consulta.", "error");
        recargaPendienteRH = true;
        requiereRecargaRH = true;
        actualizarSeleccionRH();
        return false;
    }
}
//funcion para pintar los datos
function pintarDashboardRH(datos) {
    registrosVisiblesRH = datos;
    const elegibles = new Set(datos.filter(reg => reg.estado === 'Vo.Bo.').map(claveRH));
    for (const clave of seleccionRH) if (!elegibles.has(clave)) seleccionRH.delete(clave);
//buscamos los contenedores de la cuadricula y la tabla
    const contenedorGrid = document.getElementById('pendientes-grid');
    const tablaHistorial = document.getElementById('tabla-general');
    const badgeNav = document.getElementById('badge-nav-solicitudes');

//filtramos los que ya tienen el visto bueno del jefe
    const pendientes = datos.filter(r => r.estado === 'Vo.Bo.');
    const historial = datos;

//ponemos el numero de pendientes en los circulos de aviso
    if (badgeNav) badgeNav.textContent = pendientes.length;
    const badgeMovil = document.getElementById('badge-nav-solicitudes-nav');
    if (badgeMovil) badgeMovil.textContent = pendientes.length;
    if (contenedorGrid) {
//si no hay nada que autorizar ponemos un icono de café
        if (pendientes.length === 0) {
            contenedorGrid.innerHTML = `
                <div class="col-12 text-center py-5 text-muted">
                    <i class="fa-solid fa-mug-hot fa-4x mb-3 opacity-25" style="color: var(--utm-teal);"></i>
                    <h5 class="fw-bold">Todo al dia</h5>
                    <p>No hay nada pendiente de autorizar!!!</p>
                </div>`;
        } else {
//dibujamos las tarjetas de cada solicitud pendiente
            contenedorGrid.innerHTML = pendientes.map((reg, indice) => {

                const area = reg.area_adscripcion;
                let alertaChoque = '';

//revisamos si ya hay gente de la misma area fuera este dia
                if (area && area !== 'No Registrada') {
                    const choques = new Set(registrosGlobales.filter(h =>
                        claveRH(h) !== claveRH(reg) &&
                        (h.usuario_id ?? h.id_usuario) !== (reg.usuario_id ?? reg.id_usuario) &&
                        Tramites.coinciden(h, reg) &&
                        h.area_adscripcion === area &&
                        ['Pendiente', 'Vo.Bo.', 'Aprobado'].includes(h.estado)
                    ).map(h => h.usuario_id ?? h.id_usuario ?? claveRH(h)));

//si hay mucha gente fuera mostramos un aviso rojo de alerta
                    if (choques.size > 0) {
                        alertaChoque = `
                        <div class="alert alert-danger p-2 mt-3 mb-0 small text-center fw-bold border-danger border-opacity-25 shadow-sm">
                            <i class="fa-solid fa-triangle-exclamation fa-beat me-1"></i> ¡Alerta! ${choques.size} docente(s) de ${Seguridad.escapeHTML(area)} tienen trámites que coinciden con estas fechas.
                        </div>`;
                    }
                }

//creamos el html de la tarjeta con sus botones
                return `
                <div class="col-md-6 col-xl-4">
                    <div class="card card-action h-100 shadow-sm border-0"
                         data-detalle="${indice}"
                         style="cursor: pointer;">

                        <div class="card-body p-4">
                            <label class="form-check mb-3 d-flex align-items-center gap-2" data-selector-rh>
                                <input class="form-check-input check-masivo m-0" type="checkbox" value="${reg.id}" data-tipo="${reg.tipoTramite}" ${seleccionRH.has(claveRH(reg)) ? 'checked' : ''} ${enviandoRH ? 'disabled' : ''}>
                                <span>Seleccionar ${Seguridad.escapeHTML(Tramites.folio(reg))}</span>
                            </label>
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div class="d-flex align-items-center gap-2">

                                    <span class="badge rounded-pill bg-secondary bg-opacity-15 text-white px-3 py-2 border border-secondary border-opacity-25">
                                        ${Seguridad.escapeHTML(reg.tipoTramite)}
                                    </span>
                                </div>
                                <small class="text-muted fw-bold">${Seguridad.escapeHTML(Tramites.folio(reg))}</small>
                            </div>

                            <h5 class="fw-bold mb-1 text-dark">${Seguridad.escapeHTML(reg.nombre_completo)}</h5>
                            <p class="text-muted small mb-0">
                                <i class="fa-solid fa-calendar-day me-2"></i>${Seguridad.escapeHTML(reg.fecha_uso_h || reg.fecha_inicio_h)}
                            </p>

                            ${alertaChoque}

                            <div class="d-flex justify-content-end align-items-center pt-3 mt-3 border-top">
                                <div class="d-flex gap-2">
                                    <button data-estado="Aprobado"
                                            class="btn btn-success btn-confirm-rh shadow-sm">Aprobar</button>
                                    <button data-estado="Rechazado"
                                            class="btn btn-danger btn-confirm-rh shadow-sm">Rechazar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    }

//llenamos la tabla de abajo con el historial completo
    if (tablaHistorial) {
        tablaHistorial.innerHTML = historial.length === 0 ? '<tr><td colspan="6" class="text-center py-4">No hay historial</td></tr>' : historial.map((reg, indice) => {
//ponemos colores a los estados para diferenciar rapido
            const colorBadge = reg.estado === 'Aprobado' ? 'bg-success' :
                (reg.estado === 'Vo.Bo.' ? 'bg-info text-white' :
                    (reg.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'));

//agregamos la fila a la tabla con los datos
            return `
            <tr data-detalle="${indice}" style="cursor:pointer">
                <td class="text-muted fw-bold">${Seguridad.escapeHTML(Tramites.folio(reg))}</td>
                <td><span class="badge bg-secondary text-white border">${Seguridad.escapeHTML(reg.tipoTramite)}</span></td>
                <td class="fw-bold">${Seguridad.escapeHTML(reg.nombre_completo)}</td>
                <td>${Seguridad.escapeHTML(reg.fecha_uso_h || reg.fecha_inicio_h)}</td>
                <td><span class="badge ${colorBadge}">${Seguridad.escapeHTML(reg.estado)}</span></td>
                <td class="text-muted fw-bold" title="${Seguridad.escapeHTML(reg.motivo)}">
                ${Seguridad.escapeHTML((reg.motivo || '').length > 30 ? reg.motivo.substring(0, 30) + '...' : (reg.motivo || 'Sin motivo'))}
                </td>
            </tr>`;
        }).join('');
    }

    [[contenedorGrid, pendientes], [tablaHistorial, historial]].forEach(([contenedor, registros]) => {
        contenedor?.querySelectorAll('[data-detalle]').forEach(elemento => {
            const reg = registros[Number(elemento.dataset.detalle)];
            elemento.addEventListener('click', () => verDetallesRRHH(reg));
            elemento.querySelector('[data-selector-rh]')?.addEventListener('click', event => event.stopPropagation());
            elemento.querySelector('.check-masivo')?.addEventListener('change', event => {
                if (event.target.checked) seleccionRH.add(claveRH(reg));
                else seleccionRH.delete(claveRH(reg));
                actualizarSeleccionRH();
            });
            elemento.querySelectorAll('[data-estado]').forEach(boton => {
                boton.addEventListener('click', event => {
                    event.stopPropagation();
                    confirmarAccionRH(boton, reg.id, boton.dataset.estado, reg.tipoTramite);
                });
            });
        });
    });

//si el calendario existe lo refrescamos con los nuevos datos
    if (calendarioRH) {
        calendarioRH.removeAllEventSources();
        calendarioRH.addEventSource(generarEventos(datos));
        calendarioRH.addEventSource({ events: (info, success) => success(Tramites.cumpleanos(info, datos)) });
    }
    actualizarSeleccionRH();
}

//configuramos el calendario para rh
function inicializarCalendarioRH() {
    calendarioRH = new FullCalendar.Calendar(document.getElementById('calendario-rh'), {
        initialView: 'dayGridMonth', locale: 'es', height: '100%',
        displayEventEnd: true, eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' },
        allDayText: 'Todo el día',
        headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
        eventSources: [
            generarEventos(registrosVisiblesRH),
            { events: (info, success) => success(Tramites.cumpleanos(info, registrosVisiblesRH)) }
        ],
        eventClick: info => { if (info.event.extendedProps.esTramite === true) verDetallesRRHH(info.event.extendedProps); }
    });
    calendarioRH.render();
}
//eventos
function generarEventos(datos) {
    const festivos = (window.festivosGlobalesRH || []).map(f => ({
        title: String(f.descripcion || 'Día festivo'),
        start: Tramites.fecha(f.fecha),
        end: Tramites.sumarDias(Tramites.fecha(f.fecha), 1),
        allDay: true, display: 'background', backgroundColor: 'rgba(25, 135, 84, 0.2)',
        extendedProps: { esTramite: false }
    }));
    return [...festivos, ...datos.map(reg => ({
        ...Tramites.evento(reg),
        title: `${reg.nombre_completo}: ${Tramites.folio(reg)}`,
        backgroundColor: reg.estado === 'Aprobado' ? '#198754' : (reg.estado === 'Vo.Bo.' ? '#0d6efd' : '#b77900'),
        extendedProps: { ...reg, esTramite: true }
    }))];
}

//funcion para ver toda la info de una solicitud en la ventana de rh
function verDetallesRRHH(data) {
    if (!data || !['Pase', 'Permiso'].includes(data.tipoTramite)) return;
    document.getElementById('det-rh-folio').textContent = Tramites.folio(data);
//revisamos si es un pase de salida o un permiso de dias
    const esPase = data.tipoTramite === 'Pase';
//ponemos el nombre del maestro el motivo y cuando se pidio
    document.getElementById('det-rh-nombre').textContent = data.nombre_completo;
    document.getElementById('det-rh-motivo').textContent = data.motivo || 'Sin motivo';
    document.getElementById('det-fecha-creacion').textContent = data.fecha_solicitud_h || 'N/A';

//agarramos los cuadritos que se prenden y apagan segun el tramite
    const contHoras = document.getElementById('det-rh-cont-horas');
    const contFin = document.getElementById('det-rh-cont-fin');
    const contDias = document.getElementById('det-rh-cont-dias');
    cargarDocumentoSolicitud(data, 'det-rh-cont-revision');

//si es pase mostramos las horas y la fecha de uso
    if (esPase) {
        document.getElementById('det-rh-label-fecha').textContent = "Fecha Uso";
        document.getElementById('det-rh-fecha').textContent = data.fecha_uso_h;
        contHoras.style.display = 'block'; contFin.style.display = 'none'; contDias.style.display = 'none';
        document.getElementById('det-rh-horas').textContent = `${data.hora_inicio.substring(0, 5)} - ${data.hora_fin.substring(0, 5)}`;
    } else {
//si es permiso de dias mostramos cuando inicia y cuando termina
        document.getElementById('det-rh-label-fecha').textContent = "Fecha Inicio";
        document.getElementById('det-rh-fecha').textContent = data.fecha_inicio_h;
        contHoras.style.display = 'none'; contFin.style.display = 'block'; contDias.style.display = 'block';
        document.getElementById('det-rh-fecha-fin').textContent = data.fecha_fin_h;
        document.getElementById('det-rh-dias').textContent = `${data.cantidad_dias} día(s) hábiles`;
    }

//ponemos el color y el nombre del tipo de tramite en el distintivo
    document.getElementById('det-rh-tipo-badge').className = `badge rounded-pill px-3 py-2 fs-5 ${esPase ? 'bg-secondary text-white' : 'bg-secondary'}`;
    document.getElementById('det-rh-tipo-badge').textContent = data.tipoTramite;

//cambiamos el color del estado segun si es aprobado pendiente o rechazado
    const est = document.getElementById('det-rh-estado-badge');
    est.textContent = data.estado;
    est.className = `badge fs-6 ${data.estado === 'Aprobado' ? 'bg-success' : (data.estado === 'Vo.Bo.' ? 'bg-info text-white' : (data.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'))}`;

//mostramos la ventana con toda la info ya cargada
    modalDetalleRH.show();
}
//hace que el buscador espere un poquito para no trabarse al escribir
let debounceTimerRH = null;
function aplicarFiltros() {
    if (enviandoRH) return;
    clearTimeout(debounceTimerRH);
    debounceTimerRH = setTimeout(() => {
        procesarFiltrosRH();
    }, 250);
}
//funcion para filtrar la lista de rh por nombre area estado o fecha
function procesarFiltrosRH() {
    if (enviandoRH) return;
//sacamos todos los valores que el usuario puso en los cuadros de busqueda
    const elDoc = document.getElementById('filtro-docente');
    const fDoc = elDoc ? elDoc.value.toLowerCase() : '';
    const elArea = document.getElementById('filtro-area');
    const fArea = elArea ? elArea.value.toLowerCase() : '';

    const elEst = document.getElementById('filtro-estado');
    const fEst = elEst ? elEst.value : 'Todos';

    const elTipo = document.getElementById('filtro-tipo');
    const fTipo = elTipo ? elTipo.value : 'Todos';

    const elFechaIni = document.getElementById('filtro-fecha-inicio');
    const fFechaIni = elFechaIni ? elFechaIni.value : '';
    const elFechaFin = document.getElementById('filtro-fecha-fin');
    const fFechaFin = elFechaFin ? elFechaFin.value : '';

    const elMes = document.getElementById('filtro-mes');
    const fMes = elMes ? elMes.value : '';
    const elAño = document.getElementById('filtro-año');
    const fAño = elAño ? elAño.value : '';

//filtramos la lista grande de registros uno por uno
    const res = registrosGlobales.filter(r => {
        const fClave = r.fechaClave.split('T')[0];

        const areaDoc = (r.area_adscripcion || '').toLowerCase();

//si lo que escribio no coincide con el nombre lo sacamos
        if (fDoc && !r.nombre_completo.toLowerCase().includes(fDoc)) return false;
//si el area no coincide lo sacamos
        if (fArea && !areaDoc.includes(fArea)) return false;
//si el estado o el tipo no es el que eligio lo sacamos
        if (fEst !== 'Todos' && r.estado !== fEst) return false;
        if (fTipo !== 'Todos' && r.tipoTramite !== fTipo) return false;

//revisamos que la fecha este dentro del rango de inicio y fin
        if (fFechaIni && fClave < fFechaIni) return false;
        if (fFechaFin && fClave > fFechaFin) return false;

//revisamos si coincide con el mes y el año que marcaron
        if (fMes && fClave.slice(5, 7) !== fMes) return false;
        if (fAño && fClave.slice(0, 4) !== fAño) return false;

        return true;
    });
//dibujamos los resultados que si pasaron los filtros
    res.sort(ordenRH === 'nombre'
        ? (a, b) => a.nombre_completo.localeCompare(b.nombre_completo)
        : (a, b) => String(b.fechaClave).localeCompare(String(a.fechaClave)) || b.id - a.id);
    pintarDashboardRH(res);
}

//logica para enviar el cambio de contraseña al servidor
const formPassRH = document.getElementById('form-cambiar-pass');
if (formPassRH) {
    formPassRH.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('pass-actual').value;
        const npassword = document.getElementById('pass-nueva').value;
        try {
//llamamos a la api para actualizar la clave con el token de seguridad
            const resp = await fetch(`${URL_BASE}/login/npassword`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-token': token },
                body: JSON.stringify({ password, npassword })
            });
            const res = await resp.json();
            if (res.ok) {
//si funciono cerramos la ventana y avisamos que quedo lista
                mostrarToast("Contraseña actualizada");
                bootstrap.Modal.getInstance(document.getElementById('modalCambiarPass')).hide();
                formPassRH.reset();
            } else { mostrarToast(res.msg, "error"); }
        } catch (error) { mostrarToast("Error de conexion", "error"); }
    });
}
//sirve para acomodar la lista por los mas nuevos o por orden alfabetico
function ordenarRapido(criterio) {
    if (enviandoRH) return;
    ordenRH = criterio;
    procesarFiltrosRH();
}

async function procesarRH(id, nuevoEstado, tipo) {
    if (enviandoRH) return;
    if (requiereRecargaRH) return mostrarToast('Actualiza los estados antes de enviar otro cambio.', 'info');
    const reg = registrosGlobales.find(r => r.id === Number(id) && r.tipoTramite === tipo);
    if (!reg || reg.estado !== 'Vo.Bo.') return mostrarToast('Actualiza la lista: el trámite ya no tiene Vo.Bo.', 'info');
    await enviarCambiosRH([{ ...reg }], nuevoEstado);
}

//truco para que tengan que picarle dos veces al boton antes de autorizar
function confirmarAccionRH(btn, id, estado, tipo) {
    if (enviandoRH) return;
//si ya le pico una vez y vuelve a picar entonces mandamos la respuesta
    if (btn.dataset.confirmando === "true") {
        clearInterval(Number(btn.dataset.intervalo));
        btn.dataset.confirmando = 'false';
        procesarRH(id, estado, tipo);
        return;
    }
//cambiamos el boton a amarillo y ponemos una cuenta de 3 segundos
    const textoOriginal = btn.innerHTML;
    const claseOriginal = btn.className;
    btn.dataset.confirmando = "true";
    btn.className = "btn btn-warning btn-confirm-rh text-dark shadow-sm";

    let contador = 3;
    btn.innerHTML = `¿Seguro? (${contador}s)`;

//va bajando el numero del boton cada segundo
    const intervalo = setInterval(() => {
        contador--;
        if (contador > 0) {
            btn.innerHTML = `¿Seguro? (${contador}s)`;
        } else {
//si no le pico otra vez regresamos el boton a como estaba
            clearInterval(intervalo);
            btn.dataset.confirmando = "false";
            btn.className = claseOriginal;
            btn.innerHTML = textoOriginal;
        }
    }, 1000);
    btn.dataset.intervalo = intervalo;
}



// Cada celda conserva su contenido y evita que Excel la interprete como fórmula.
function celdaCSV(valor) {
    let texto = String(valor ?? '');
    if (/^\s*[=+\-@]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
}

function exportarExcel() {
    if (!registrosGlobales.length) return mostrarToast("No hay datos para exportar", "info");
    const filas = [
        ['Folio', 'Tipo', 'Docente', 'Area Adscripcion', 'Fecha Evento', 'Estado', 'Revisado Por', 'Motivo'],
        ...registrosGlobales.map(reg => [
            Tramites.folio(reg), reg.tipoTramite, reg.nombre_completo, reg.area_adscripcion || 'No Registrada',
            reg.fecha_uso_h || reg.fecha_inicio_h, reg.estado, reg.revisado_por_nombre || 'N/A',
            reg.motivo || 'Sin motivo'
        ])
    ];
    const contenido = filas.map(fila => fila.map(celdaCSV).join(',')).join('\r\n');
    const archivo = new Blob(['\ufeff', contenido], { type: 'text/csv;charset=utf-8' });
    const enlace = URL.createObjectURL(archivo);
    const link = document.createElement('a');
    link.href = enlace;
    link.download = `Reporte_RRHH_UTM_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(enlace), 1000);
    mostrarToast("Reporte descargado exitosamente");
}

// La selección se identifica por tipo e ID, nunca por posición de la lista.
function actualizarSeleccionRH() {
    const elegibles = registrosVisiblesRH.filter(reg => reg.estado === 'Vo.Bo.');
    const cantidad = elegibles.filter(reg => seleccionRH.has(claveRH(reg))).length;
    const contador = document.getElementById('seleccion-resumen-rh');
    if (contador) contador.textContent = `${cantidad} seleccionados de ${elegibles.length} con Vo.Bo. visibles`;
    const aprobar = document.getElementById('btn-aprobar-rh');
    if (aprobar) aprobar.disabled = enviandoRH || requiereRecargaRH || cantidad === 0;
    const todos = document.getElementById('btn-seleccionar-rh');
    if (todos) {
        todos.disabled = enviandoRH || !elegibles.length;
        todos.textContent = cantidad === elegibles.length && cantidad > 0 ? 'Desmarcar visibles' : 'Seleccionar visibles';
    }
    document.querySelectorAll('[data-estado]').forEach(boton => { boton.disabled = enviandoRH || requiereRecargaRH; });
    const aviso = document.getElementById('actualizacion-pendiente-rh');
    if (aviso) aviso.hidden = !recargaPendienteRH;
}
function seleccionarTodoMasivo() {
    if (enviandoRH) return;
    const elegibles = registrosVisiblesRH.filter(reg => reg.estado === 'Vo.Bo.');
    const todos = elegibles.length > 0 && elegibles.every(reg => seleccionRH.has(claveRH(reg)));
    elegibles.forEach(reg => todos ? seleccionRH.delete(claveRH(reg)) : seleccionRH.add(claveRH(reg)));
    document.querySelectorAll('.check-masivo').forEach(check => {
        check.checked = seleccionRH.has(`${check.dataset.tipo}:${check.value}`);
    });
    actualizarSeleccionRH();
}
async function aprobarSeleccionMasiva() {
    if (enviandoRH) return;
    if (requiereRecargaRH) return mostrarToast('Actualiza los estados antes de aprobar otro lote.', 'info');
    // Capturar antes del primer await: cambios de pantalla o sockets no amplían el lote.
    const lote = registrosVisiblesRH.filter(reg => reg.estado === 'Vo.Bo.' && seleccionRH.has(claveRH(reg))).map(reg => ({ ...reg }));
    if (!lote.length) return mostrarToast('Selecciona al menos un trámite con Vo.Bo.', 'info');
    if (!confirm(`¿Aprobar los ${lote.length} trámites seleccionados con Vo.Bo.? Se mostrará el resultado de cada folio.`)) return;
    await enviarCambiosRH(lote, 'Aprobado');
}
function pintarResultadosRH(resultados, recargado, enCurso = false) {
    const panel = document.getElementById('resultado-lote-rh');
    if (!panel) return;
    panel.hidden = false;
    const confirmados = resultados.filter(r => r.confirmado).length;
    const resumen = document.getElementById('resultado-resumen-rh');
    resumen.textContent = enCurso ? `Procesando ${resultados.length} respuestas recibidas…`
        : `${confirmados} aprobaciones/cambios confirmados de ${resultados.length} trámites procesados. ${recargado ? 'Estados actualizados.' : 'No se pudieron consultar los estados actuales; actualiza antes de reintentar.'}`;
    document.getElementById('resultado-folios-rh').replaceChildren(...resultados.map(resultado => {
        const fila = document.createElement('li');
        fila.className = `list-group-item ${resultado.confirmado ? 'list-group-item-success' : 'list-group-item-warning'}`;
        fila.textContent = `${resultado.folio}: ${resultado.mensaje}`;
        return fila;
    }));
}
async function enviarCambiosRH(lote, nuevoEstado) {
    if (enviandoRH) return;
    enviandoRH = true;
    clearTimeout(debounceTimerRH);
    ++cargaActualRH; // Descartar consultas iniciadas antes de enviar este lote.
    const controles = [...document.querySelectorAll('#form-filtros input, #form-filtros select, #form-filtros button, #solicitudes-rh button, .check-masivo, [data-estado], [data-orden-rh]')];
    const previos = controles.map(el => el.disabled);
    controles.forEach(el => { el.disabled = true; });
    const resultados = [];
    const progreso = document.getElementById('progreso-lote-rh');
    let recargado = false;
    try {
        for (const reg of lote) {
            if (progreso) progreso.textContent = `Procesando ${resultados.length + 1} de ${lote.length}: ${Tramites.folio(reg)}`;
            let resultado = { folio: Tramites.folio(reg), clave: claveRH(reg), confirmado: false, incierto: false };
            try {
                const endpoint = reg.tipoTramite === 'Pase' ? 'pases' : 'permisos';
                const resp = await fetch(`${URL_BASE}/${endpoint}/cancelar`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-token': token },
                    body: JSON.stringify({ id: reg.id, cancelar: nuevoEstado }),
                    signal: AbortSignal.timeout(15000)
                });
                let data;
                try { data = await resp.json(); } catch { throw new Error('Respuesta no legible'); }
                if (resp.ok && data.ok) {
                    resultado.confirmado = true;
                    resultado.mensaje = `${nuevoEstado}: operación confirmada por el servidor.`;
                } else {
                    resultado.mensaje = `No confirmado (HTTP ${resp.status}): ${data.msg || 'el servidor rechazó la operación.'}`;
                }
            } catch {
                resultado.incierto = true;
                resultado.mensaje = 'Respuesta no recibida; la operación pudo llegar al servidor. Se consultará el estado sin reenviar.';
            }
            resultados.push(resultado);
            pintarResultadosRH(resultados, false, true);
        }
        seleccionRH.clear();
        recargado = await cargarDatosGenerales({ forzar: true });
        for (const resultado of resultados) {
            const actual = recargado && registrosGlobales.find(reg => claveRH(reg) === resultado.clave);
            if (resultado.incierto && !recargado) {
                resultado.mensaje = 'Respuesta no recibida y no se pudo consultar el estado actual. La operación pudo llegar; actualiza los estados antes de reintentar.';
            } else if (resultado.incierto && actual) {
                resultado.confirmado = actual.estado === nuevoEstado;
                resultado.mensaje = `Respuesta inicial no recibida. Estado consultado: ${actual.estado}. ${actual.estado === nuevoEstado ? 'El estado solicitado está confirmado; no se reenvió.' : 'No se confirmó el cambio solicitado; revisa antes de reintentar.'}`;
            } else if (recargado && !actual) {
                resultado.confirmado = false;
                resultado.mensaje += ' El folio ya no aparece en la consulta actual; revisa su disponibilidad antes de reintentar.';
            } else if (!resultado.confirmado && actual) {
                resultado.mensaje += ` Estado consultado: ${actual.estado}.`;
            } else if (resultado.confirmado && actual && actual.estado !== nuevoEstado) {
                resultado.confirmado = false;
                resultado.mensaje = `El servidor aceptó el cambio, pero el estado actual es ${actual.estado}. Revisa el folio.`;
            }
        }
    } finally {
        enviandoRH = false;
        controles.forEach((el, index) => { if (el.isConnected) el.disabled = previos[index]; });
        if (progreso) progreso.textContent = '';
        procesarFiltrosRH();
        pintarResultadosRH(resultados, recargado);
        mostrarToast(recargado && resultados.every(r => r.confirmado) ? 'Todos los cambios fueron confirmados. Consulta el detalle por folio.' : 'Proceso terminado con incidencias. Revisa cada folio antes de reintentar.', recargado && resultados.every(r => r.confirmado) ? 'success' : 'info');
    }
}

//sirve para que la barra de filtros aparezca o desaparezca en el celular
function toggleFiltrosMovil(show) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
        if (show) {
            sidebar.classList.add('active-movil');
        } else {
            sidebar.classList.remove('active-movil');
        }
    }
}
