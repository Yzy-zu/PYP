//direccion de la api para hacer consultas
const URL_BASE = '/api';
//conexion para recibir avisos al momento
const socket = Seguridad.socket();
//lista para guardar todos los registros
let registrosGlobales = [];
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

    inicializarMotorPDF();

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
    cargarDatosGenerales();
});
//obtener datos desde backend
async function cargarDatosGenerales() {
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
//guardamos los feriados en una variable global
        window.festivosGlobalesRH = resFest.ok ? await resFest.json() : [];

//etiquetamos cada registro para saber que tipo es
        const mPases = (dataP.data || []).map(p => ({ ...p, tipoTramite: 'Pase', fechaClave: p.fecha_uso }));
        const mPermisos = (dataM.data || []).map(p => ({ ...p, tipoTramite: 'Permiso', fechaClave: p.fecha_inicio }));

//juntamos todo y lo ordenamos por la fecha
        let todos = [...mPases, ...mPermisos].sort((a, b) => new Date(a.fechaClave) - new Date(b.fechaClave));

//contamos cuantos tramites lleva cada profesor
        const contadores = {};
        todos.forEach(reg => {
            const uid = reg.id_usuario;

            if (!contadores[uid]) {
                contadores[uid] = { Pase: 0, Permiso: 0 };
            }

            //incrementamos el contador de tramites de la persona
            contadores[uid][reg.tipoTramite]++;
            reg.folio_personal = contadores[uid][reg.tipoTramite];
        });
//ordenamos para que los mas nuevos salgan primero
        registrosGlobales = todos.sort((a, b) => new Date(b.fechaClave) - new Date(a.fechaClave));

//mandamos los datos a dibujar en la pantalla
        pintarDashboardRH(registrosGlobales);

    } catch (e) {
        console.error("Error al cargar datos de rh", e);
        mostrarToast("Error de conexión con el servidor", "error");
    }
}
//funcion para pintar los datos
function pintarDashboardRH(datos) {
//buscamos los contenedores de la cuadricula y la tabla
    const contenedorGrid = document.getElementById('pendientes-grid');
    const tablaHistorial = document.getElementById('tabla-general');
    const badgeNav = document.getElementById('badge-nav-solicitudes');

//filtramos los que ya tienen el visto bueno del jefe
    const pendientes = datos.filter(r => r.estado === 'Vo.Bo.');
    const historial = datos;

//ponemos el numero de pendientes en los circulos de aviso
    if (badgeNav) badgeNav.textContent = pendientes.length;
    const badgeMovil = document.getElementById('badge-nav-solicitudes-movil');
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
                    const choques = historial.filter(h =>
                        h.id !== reg.id &&
                        h.fechaClave === reg.fechaClave &&
                        h.area_adscripcion === area &&
                        (h.estado === 'Aprobado' || h.estado === 'Vo.Bo.')
                    );

//si hay mucha gente fuera mostramos un aviso rojo de alerta
                    if (choques.length > 0) {
                        alertaChoque = `
                        <div class="alert alert-danger p-2 mt-3 mb-0 small text-center fw-bold border-danger border-opacity-25 shadow-sm">
                            <i class="fa-solid fa-triangle-exclamation fa-beat me-1"></i> ¡Alerta! ${choques.length} docente(s) de ${Seguridad.escapeHTML(area)} ya se ausentará(n) hoy.
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
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <div class="d-flex align-items-center gap-2">

                                    <span class="badge rounded-pill bg-secondary bg-opacity-15 text-white px-3 py-2 border border-secondary border-opacity-25">
                                        ${Seguridad.escapeHTML(reg.tipoTramite)}
                                    </span>
                                </div>
                                <small class="text-muted fw-bold">${Seguridad.escapeHTML(reg.tipoTramite)}: ${Seguridad.escapeHTML(reg.folio_personal)}</small>
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
                <td class="text-muted fw-bold">N. ${Seguridad.escapeHTML(reg.folio_personal)}</td>
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
    }
}

//configuramos el calendario para rh
function inicializarCalendarioRH() {
    calendarioRH = new FullCalendar.Calendar(document.getElementById('calendario-rh'), {
        initialView: 'dayGridMonth', locale: 'es', height: '100%',
        buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Agenda' },
        allDayText: 'Todo el día',
        headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
        events: generarEventos(registrosGlobales),
        eventClick: (info) => verDetallesRRHH(info.event.extendedProps)
    });
    calendarioRH.render();
}
//eventos
function generarEventos(datos) {
//dibujamos los dias feriados en el calendario
    let eventos = (window.festivosGlobalesRH || []).map(f => ({
        title: ` ${f.descripcion}`,
        start: f.fecha.split('T')[0],
        display: 'background',
        backgroundColor: 'rgba(25, 135, 84, 0.2)'
    }));

    const cumpleaniosAgregados = new Set();

//ponemos cada tramite en el calendario con su color
    datos.forEach(reg => {
        eventos.push({
            title: `${reg.nombre_completo}: ${reg.tipoTramite}`,
            start: reg.fechaClave.split('T')[0],
            backgroundColor: reg.estado === 'Aprobado' ? '#198754' : (reg.estado === 'Pendiente' ? '#ffc107' : '#ffc107'),
            extendedProps: { ...reg }
        });

        //agregamos los cumpleaños de los trabajadores
        if (reg.fecha_nacimiento && !cumpleaniosAgregados.has(reg.id_usuario)) {
            const año = new Date().getFullYear();
            const mesDia = reg.fecha_nacimiento.substring(5, 10);
            eventos.push({
                title: `Cumple: ${reg.nombre_completo.split(' ')[0]}`,
                start: `${año}-${mesDia}`,
                allDay: true,
                backgroundColor: '#6f42c1',
                borderColor: 'transparent'
            });
            cumpleaniosAgregados.add(reg.id_usuario);
        }
    });

    return eventos;
}




//funcion para ver toda la info de una solicitud en la ventana de rh
function verDetallesRRHH(data) {
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
    const contRev = document.getElementById('det-rh-cont-revision');

//si alguien ya lo reviso mostramos quien fue y a que hora
    if (data.estado !== 'Pendiente' && data.revisado_por_nombre) {
        contRev.style.display = 'block';
        document.getElementById('det-rh-revisado-por').textContent = data.revisado_por_nombre;
        const f = new Date(data.fecha_revision);
        document.getElementById('det-rh-fecha-revision').textContent = `${f.toLocaleDateString()} a las ${f.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hrs`;
    } else {
//si nadie lo ha visto escondemos la parte de la revision
        contRev.style.display = 'none';
    }

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

//configuramos el boton para bajar el reporte en pdf
    const btnPDF = document.getElementById('btn-descargar-pdf');
    if (btnPDF) {
//solo dejamos bajar el archivo si el tramite ya esta aprobado
        if (data.estado === 'Aprobado') {
            btnPDF.style.display = 'block';
            btnPDF.onclick = async () => {
//ponemos un circulito cargando mientras se hace el pdf
                const textOrigin = btnPDF.innerHTML;
                btnPDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Generando...';
                btnPDF.disabled = true;
                try {
//llamamos a la funcion que crea el pdf de pases o de permisos
                    if (esPase) await pdfPase(data, data);
                    else await pdfPermiso(data, data);
                } catch(e) { console.error(e); mostrarToast("Error PDF", "error"); }
                finally { btnPDF.innerHTML = textOrigin; btnPDF.disabled = false; }
            };
        } else {
//si no esta aprobado el boton no aparece
            btnPDF.style.display = 'none';
        }
    }

//ponemos el color y el nombre del tipo de tramite en el distintivo
    document.getElementById('det-rh-tipo-badge').className = `badge rounded-pill px-3 py-2 fs-5 ${esPase ? 'bg-secondary text-white' : 'bg-secondary'}`;
    document.getElementById('det-rh-tipo-badge').textContent = data.tipo_conteo;

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
    clearTimeout(debounceTimerRH);
    debounceTimerRH = setTimeout(() => {
        procesarFiltrosRH();
    }, 250);
}
//funcion para filtrar la lista de rh por nombre area estado o fecha
function procesarFiltrosRH() {
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
        const f = new Date(r.fechaClave);
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
        if (fMes && (f.getMonth() + 1).toString().padStart(2, '0') !== fMes) return false;
        if (fAño && f.getFullYear().toString() !== fAño) return false;

        return true;
    });
//dibujamos los resultados que si pasaron los filtros
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
    if (!registrosGlobales.length) return;
    let copia = [...registrosGlobales];
    switch (criterio) {
        case 'reciente': copia.sort((a, b) => b.id - a.id); break;
        case 'nombre': copia.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo)); break;
    }
    pintarDashboardRH(copia);
}

//esta funcion le avisa al servidor si rh acepto o rechazo el tramite
async function procesarRH(id, nuevoEstado, tipo) {
    try {
        const endpoint = tipo === 'Pase' ? 'pases' : 'permisos';
        const resp = await fetch(`${URL_BASE}/${endpoint}/cancelar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ id: id, cancelar: nuevoEstado, revisado_por: usuario.id })
        });
        const res = await resp.json();
        if (res.ok) {
//si se guardo bien refrescamos toda la informacion de la pantalla
            mostrarToast("Trámite finalizado correctamente");
            cargarDatosGenerales();
        } else {
            mostrarToast(res.msg, "error");
        }
    } catch (e) {
        mostrarToast("Error de conexión", "error");
    }
}

//truco para que tengan que picarle dos veces al boton antes de autorizar
function confirmarAccionRH(btn, id, estado, tipo) {
//si ya le pico una vez y vuelve a picar entonces mandamos la respuesta
    if (btn.dataset.confirmando === "true") {
        clearInterval(Number(btn.dataset.intervalo));
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
        ['ID Tramite', 'Tipo', 'Docente', 'Area Adscripcion', 'Fecha Evento', 'Estado', 'Revisado Por', 'Motivo'],
        ...registrosGlobales.map(reg => [
            reg.id, reg.tipoTramite, reg.nombre_completo, reg.area_adscripcion || 'No Registrada',
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

//sirve para marcar o desmarcar todos los cuadritos de seleccion de la tabla
function seleccionarTodoMasivo() {
    const checks = document.querySelectorAll('.check-masivo');
    const todosMarcados = Array.from(checks).every(c => c.checked);
    checks.forEach(c => c.checked = !todosMarcados);
}

//esta funcion manda a aprobar varios tramites de un solo golpe
async function aprobarSeleccionMasiva() {
//buscamos cuales cuadritos estan marcados ahorita
    const checks = document.querySelectorAll('.check-masivo:checked');
    if (checks.length === 0) return mostrarToast("Selecciona al menos un trámite de la lista", "info");

//preguntamos si de verdad quiere aprobar tantos para evitar errores
    if (!confirm(`¿Estás seguro de aprobar ${checks.length} trámites al mismo tiempo?`)) return;

    mostrarToast(`Procesando ${checks.length} firmas...`, "info");

    let exitosos = 0;
//usamos un ciclo para ir enviando la aprobacion de cada uno al servidor
    for (const check of checks) {
        const id = check.value;
        const tipo = check.dataset.tipo;
        const endpoint = tipo === 'Pase' ? 'pases' : 'permisos';

        try {
//llamamos a la api para poner el estado en aprobado
            const resp = await fetch(`${URL_BASE}/${endpoint}/cancelar`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-token': token },
                body: JSON.stringify({ id: id, cancelar: 'Aprobado', revisado_por: usuario.id })
            });
            const res = await resp.json();
            if (res.ok) exitosos++;
        } catch (e) {
            console.error("Error al procesar ID: ", id);
        }
    }

//al final avisamos cuantos se pudieron aprobar correctamente
    mostrarToast(`Proceso completado! ${exitosos} tramites aprobados`);
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
