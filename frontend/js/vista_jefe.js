//direccion para llamar al servidor
const URL_BASE = '/api';
//conexion para recibir avisos en vivo
const socket = Seguridad.socket();
//aca guardamos el calendario del jefe
let calendarioJefe;
//ventana para ver la info completa
let modalDetalle;
//lista donde guardamos todos los pases y permisos
let solicitudesGlobales = [];

//avisar cuando alguien crea un pase nuevo
socket.on('nuevo-pase-creado', (data) => {
    console.log("Mensaje del servidor:", data.msg);
//recargamos todo para que aparezca el nuevo
    cargarTodasLasSolicitudes();
//mostramos el aviso azul de info
    mostrarToast("¡Nueva solicitud recibida!", "info");
});

//avisar cuando alguien crea un permiso nuevo
socket.on('nuevo-permiso-creado', (data) => {
    console.log(data.msg);
    cargarTodasLasSolicitudes();
    mostrarToast("¡Nueva solicitud de Permiso recibida!", "info");
});

//avisar si un permiso cambio para refrescar la lista
socket.on('permiso-actualizado', () => {
    cargarTodasLasSolicitudes();
});

//sacamos la llave y el usuario de la memoria del navegador
const token = sessionStorage.getItem('token');
const usuarioStr = sessionStorage.getItem('usuario');

//si no hay llave o usuario lo mandamos al login de una
if (!token || !usuarioStr) window.location.href = "login.html";
//convertimos el texto a un objeto que podamos leer
const usuario = JSON.parse(usuarioStr);
//si no es administrador lo sacamos porque este archivo es solo para jefes
if (usuario.rol !== 'Administrador') window.location.href = "login.html";

//limpia todo y nos saca de la cuenta
function manejarSesionExpirada() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

//sirve para mostrar los mensajitos de colores arriba
function mostrarToast(mensaje, tipo = 'success') {
//buscamos los elementos del mensaje
    const toastEl = document.getElementById('toastNotificacion');
    const toastHeader = document.getElementById('toast-header-bg');
    document.getElementById('toast-mensaje').textContent = mensaje;
//cambiamos el color segun si es exito o error
    toastHeader.className = `toast-header text-white ${tipo === 'success' ? 'bg-success' : 'bg-danger'}`;
//si es informativo lo ponemos en azul
    if (tipo === 'info') toastHeader.className = `toast-header text-white bg-info`;
    new bootstrap.Toast(toastEl).show();
}

//cuando la pagina termina de cargar arrancamos todo
Seguridad.alCargar(() => {
//creamos la ventana modal de los detalles
    modalDetalle = new bootstrap.Modal(document.getElementById('modalDetalleSolicitud'));
//ponemos el nombre del jefe en la pantalla
    document.getElementById('saludo-jefe').textContent = `Directivo: ${usuario.nombre_completo}` || "Directivo";

//configuramos el boton para salir de la cuenta
    document.getElementById('btn-logout').addEventListener('click', () => {
        Seguridad.salir();
    });
//prendemos el pdf el calendario y traemos los datos
    inicializarMotorPDF();
    inicializarCalendario();
    cargarTodasLasSolicitudes();
});

//configuracion basica para que el calendario se vea bien
function inicializarCalendario() {
    const calendarEl = document.getElementById('calendario-jefe');
    calendarioJefe = new FullCalendar.Calendar(calendarEl, {
//textos en español para los botones
        buttonText: {
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            day: 'Día',
            list: 'Agenda'
        },
        allDayText: 'Todo el dia',
        initialView: 'dayGridMonth',
        locale: 'es',
        height: '100%',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
//ajusta los botones si el jefe abre esto en un celular
        windowResize: function (arg) {
            if (window.innerWidth < 768) {
                calendarioJefe.setOption('headerToolbar', {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                });
            } else {
                calendarioJefe.setOption('headerToolbar', {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listWeek'
                });
            }
        },
//cuando le den clic a un evento del calendario abrimos su info
        eventClick: (info) => verDetallesModal(info.event.extendedProps)
    });
    calendarioJefe.render();
}
//va al servidor por todos los pases y permisos que existen
async function cargarTodasLasSolicitudes() {
    try {
//pedimos todo al mismo tiempo para no tardar tanto
        const [respPases, respPermisos, respFest] = await Promise.all([
            fetch(`${URL_BASE}/pases/todos`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/permisos/todos`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/dias/ver`, { headers: { 'x-token': token } })
        ]);

//si la llave ya no sirve lo sacamos
        if (respPases.status === 401 || respPermisos.status === 401) {
            manejarSesionExpirada();
            return;
        }

//guardamos lo que nos mando el servidor
        const dataPases = respPases.ok ? await respPases.json() : { data: [] };
        const dataPermisos = respPermisos.ok ? await respPermisos.json() : { data: [] };
        window.festivosGlobalesJefe = respFest.ok ? await respFest.json() : [];

//le ponemos nombre a cada tipo para no confundirlos
        const pases = (dataPases.data || []).map(p => ({ ...p, tipoTramite: 'Pase' }));
        const permisos = (dataPermisos.data || []).map(p => ({ ...p, tipoTramite: 'Permiso' }));

//juntamos todo en una sola lista y corremos el filtro
        solicitudesGlobales = [...pases, ...permisos];
        ejecutarMiniFiltro();

    } catch (error) {
        console.error("Error en la carga:", error);
        mostrarToast("Error al conectar al servidor", "error");
    }
} 1

//esto sirve para que el filtro no corra mil veces mientras escribes
let debounceTimerJefe = null;
function ejecutarMiniFiltro() {
    clearTimeout(debounceTimerJefe);
    debounceTimerJefe = setTimeout(() => {
        procesarMiniFiltro();
    }, 250);
}

//aca es donde de verdad filtramos la lista segun lo que el jefe busque
function procesarMiniFiltro() {
//sacamos que escribio que tipo quiere ver y si solo quiere pendientes
    const buscador = document.getElementById('mini-docente').value.toLowerCase().trim();
    const tipo = document.querySelector('input[name="btn-tipo"]:checked').value;
    const soloPendientes = document.getElementById('check-solo-pendientes').checked;

//revisamos uno por uno los registros para ver si pasan el filtro
    let filtrados = solicitudesGlobales.filter(sol => {
        let cumple = true;
//si escribio nombre y no coincide lo quitamos
        if (buscador && !sol.nombre_completo.toLowerCase().includes(buscador)) cumple = false;
//si eligio un tipo y no es ese lo quitamos
        if (tipo !== 'Ambos' && sol.tipoTramite !== tipo) cumple = false;
//si marco solo pendientes y ya esta aprobado o rechazado lo quitamos
        if (soloPendientes && sol.estado !== 'Pendiente') cumple = false;
        return cumple;
    });

//ponemos los mas nuevos arriba
    filtrados.sort((a, b) => b.id - a.id);
    actualizarPantallaJefe(filtrados);
}

//esta funcion dibuja todo en la pantalla del jefe
function actualizarPantallaJefe(datos) {
//buscamos donde meter la lista y la tabla
    const listaPendientes = document.getElementById('lista-pendientes');
    const tablaEstadisticas = document.getElementById('tabla-estadisticas');

//limpiamos antes de dibujar para no repetir cosas
    listaPendientes.innerHTML = '';
    tablaEstadisticas.innerHTML = '';

//preparamos los dias feriados para el fondo del calendario
    let eventos = (window.festivosGlobalesJefe || []).map(f => ({
        title: ` ${f.descripcion}`,
        start: f.fecha.split('T')[0],
        display: 'background',
        backgroundColor: 'rgba(25, 135, 84, 0.2)'
    }));

    let contadorPendientes = 0;
    const cumpleaniosAgregados = new Set();

//recorremos los datos filtrados para crear las tarjetas y filas
    datos.forEach((sol, indice) => {
        const esPase = sol.tipoTramite === 'Pase';
        const fechaMostrar = sol.fecha_uso_h || sol.fecha_inicio_h;
        const fechaISO = (esPase ? sol.fecha_uso : sol.fecha_inicio).split('T')[0];

        //metemos el tramite al calendario con su color de estado
        eventos.push({
            title: `${sol.nombre_completo}: ${sol.tipoTramite}`,
            start: fechaISO,
            backgroundColor: sol.estado === 'Aprobado' ? '#198754' :
                (sol.estado === 'Pendiente' ? '#ffc107' :
                    (sol.estado === 'Vo.Bo.' ? '#009186' : '#ff0000')),
            borderColor: 'transparent',
            extendedProps: { ...sol }
        });

        //si el docente cumple años lo marcamos en morado
        if (sol.fecha_nacimiento && !cumpleaniosAgregados.has(sol.id_usuario)) {
            const cumpleMesDia = sol.fecha_nacimiento.substring(5, 10);
            const añoActual = new Date().getFullYear();
            eventos.push({
                title: `Cumple: ${sol.nombre_completo.split(' ')[0]}`,
                start: `${añoActual}-${cumpleMesDia}`,
                allDay: true,
                backgroundColor: '#6f42c1',
                borderColor: 'transparent'
            });
            cumpleaniosAgregados.add(sol.id_usuario);
        }


//si el tramite esta pendiente lo ponemos en la lista de accion rapida
        if (sol.estado === 'Pendiente') {
            contadorPendientes++;
            listaPendientes.innerHTML += `
                <div class="solicitud-card small" data-detalle="${indice}" style="cursor: pointer;">
                    <div class="d-flex justify-content-between mb-1">
                        <strong class="text-primary fs-6">${Seguridad.escapeHTML(sol.nombre_completo)}</strong>
                        <span class="badge bg-secondary fs-6">${Seguridad.escapeHTML(sol.tipoTramite)}</span>
                    </div>
                    <p class="text-muted mb-2"><i class="fa-solid fa-calendar-day me-2"></i>${Seguridad.escapeHTML(fechaMostrar)}</p>
                    <div class="d-flex gap-2">
                        <button data-estado="Vo.Bo." class="btn btn-success btn-sm w-50">Aprobar</button>
                        <button data-estado="Rechazado" class="btn btn-danger btn-sm w-50">Rechazar</button>
                    </div>
                </div>`;
        }

//metemos una fila a la tabla de abajo para el historial completo
        tablaEstadisticas.innerHTML += `
            <tr class="small" data-detalle="${indice}" style="cursor:pointer">
                <td>${Seguridad.escapeHTML(sol.nombre_completo)}</td>
                <td>${Seguridad.escapeHTML(sol.tipoTramite)}</td>
                <td>${Seguridad.escapeHTML(fechaMostrar)}</td>
                <td>
                <span class="badge ${sol.estado === 'Aprobado' ? 'bg-success' :
                (sol.estado === 'Vo.Bo.' ? 'bg-info text-white' :
                    (sol.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'))
            }">${Seguridad.escapeHTML(sol.estado)}
                </span>
                </td>
            </tr>`;
    });

    [listaPendientes, tablaEstadisticas].forEach(contenedor => {
        contenedor.querySelectorAll('[data-detalle]').forEach(elemento => {
            const sol = datos[Number(elemento.dataset.detalle)];
            elemento.addEventListener('click', () => verDetallesModal(sol));
            elemento.querySelectorAll('[data-estado]').forEach(boton => {
                boton.addEventListener('click', event => {
                    event.stopPropagation();
                    confirmarAccion(boton, sol.id, sol.tipoTramite === 'Pase' ? 'pase' : 'permiso', boton.dataset.estado);
                });
            });
        });
    });

//si no hay nada pendiente ponemos un icono de café
    if (contadorPendientes === 0) {
        listaPendientes.innerHTML = `<div class="text-center py-5 opacity-50"><i class="fa-solid fa-mug-hot fa-3x mb-3" style="color: var(--utm-teal);"></i><p class="fw-bold mb-0">Todo al dia</p></div>`;
    }

//refrescamos el calendario con todos los eventos que juntamos
    calendarioJefe.removeAllEventSources();
    calendarioJefe.addEventSource(eventos);
}


//funcion para mostrar toda la info de la solicitud en la ventana
function verDetallesModal(data) {
//revisamos si es un pase de horas para saber que campos llenar
    const esPase = data.tipoTramite === 'Pase';

//ponemos el nombre del docente el motivo y la fecha en que se hizo
    document.getElementById('det-nombre').textContent = data.nombre_completo;
    document.getElementById('det-motivo').textContent = data.motivo || 'Sin motivo especificado';
    document.getElementById('det-fecha-creacion').textContent = data.fecha_solicitud_h || 'N/A';

//agarramos todos los elementos que cambian segun el tipo de tramite
    const labelFecha = document.getElementById('label-fecha-principal');
    const contHoras = document.getElementById('det-contenedor-horas');
    const contFin = document.getElementById('det-contenedor-fin');
    const contDias = document.getElementById('det-contenedor-dias');
    const contRevision = document.getElementById('det-contenedor-revision');

//si la solicitud ya se reviso mostramos quien la checo y en que momento
    if (data.estado !== 'Pendiente' && data.revisado_por_nombre) {
        contRevision.style.display = 'block';
        document.getElementById('det-revisado-por').textContent = data.revisado_por_nombre;

        const f = new Date(data.fecha_revision);
        document.getElementById('det-fecha-revision').textContent =
            `${f.toLocaleDateString()} - ${f.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else {
//si sigue pendiente mejor escondemos la parte de la revision
        contRevision.style.display = 'none';
    }

//configuramos la vista si es un pase de unas cuantas horas
    if (esPase) {
        labelFecha.textContent = "Fecha de Uso";
        document.getElementById('det-fecha').textContent = data.fecha_uso_h;
        contHoras.style.display = 'block'; contFin.style.display = 'none'; contDias.style.display = 'none';
        document.getElementById('det-horas').textContent = `${data.hora_inicio.substring(0, 5)} - ${data.hora_fin.substring(0, 5)}`;
    } else {
//configuramos la vista si es un permiso de uno o varios dias
        labelFecha.textContent = "Fecha Inicio";
        document.getElementById('det-fecha').textContent = data.fecha_inicio_h;
        contHoras.style.display = 'none'; contFin.style.display = 'block'; contDias.style.display = 'block';
        document.getElementById('det-fecha-fin').textContent = data.fecha_fin_h;
        document.getElementById('det-dias').textContent = `${data.cantidad_dias} día(s) hábil(es)`;
    }

//este boton sirve para generar el archivo pdf si la solicitud es valida
    const btnPDF = document.getElementById('btn-descargar-pdf');
    if (btnPDF) {
//el archivo solo se puede bajar si el jefe ya aprobo la solicitud
        if (data.estado === 'Aprobado') {
            btnPDF.style.display = 'block';
            btnPDF.onclick = async () => {
//ponemos un icono de carga mientras se fabrica el documento
                const textOrigin = btnPDF.innerHTML;
                btnPDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Generando...';
                btnPDF.disabled = true;

                try {
//juntamos toda la info del docente para meterla al reporte
                    const docenteInfo = {
                        nombre_completo: data.nombre_completo,
                        rfc: data.rfc,
                        area_adscripcion: data.area_adscripcion,
                        fecha_ingreso: data.fecha_ingreso,
                        categoria: data.categoria,
                        tipo_contrato: data.tipo_contrato,
                        fecha_nacimiento: data.fecha_nacimiento
                    };
//llamamos a la funcion que crea el pdf segun sea el caso
                    if (esPase) {
                        await pdfPase(data, docenteInfo);
                    } else {
                        await pdfPermiso(data, docenteInfo);
                    }
                } catch (e) {
//si algo falla al hacer el pdf mostramos un error rojo
                    mostrarToast("Error construyendo PDF", "error");
                } finally {
//regresamos el boton a como estaba al principio
                    btnPDF.innerHTML = textOrigin;
                    btnPDF.disabled = false;
                }
            };
        } else {
//si no esta aprobado escondemos el boton de descarga
            btnPDF.style.display = 'none';
        }
    }

//actualizamos los textos de los distintivos de estado y tipo
    document.getElementById('det-tipo-badge').textContent = data.tipoTramite;
    document.getElementById('det-tipo-badge').className = `badge rounded-pill px-4 py-2 ${esPase ? 'bg-secondary text-white' : 'bg-secondary'}`;

    const estBadge = document.getElementById('det-estado-badge');
    estBadge.textContent = data.estado;
//ponemos color verde si es aprobado o amarillo si esta en espera
    estBadge.className = `badge fs-6 ${data.estado === 'Aprobado' ? 'bg-success' : (data.estado === 'Pendiente' ? 'bg-warning text-white' : 'bg-danger')}`;

//abrimos la ventana modal para que el jefe vea todo
    modalDetalle.show(); //
}
//esta funcion manda la respuesta de aprobado o rechazado al servidor
async function cambiarEstado(id, tipo, nuevoEstado) {
//elegimos la ruta correcta segun si es un pase o un permiso
    const endpoint = tipo === 'pase' ? '/pases/cancelar' : '/permisos/cancelar';
    try {
//hacemos la peticion patch para actualizar solo el estado
        const resp = await fetch(`${URL_BASE}${endpoint}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify({ id, cancelar: nuevoEstado })
        });
        const res = await resp.json();
//si el servidor dice que todo bien recargamos la lista
        if (res.ok) { mostrarToast(`Solicitud ${nuevoEstado}`); cargarTodasLasSolicitudes(); }
    } catch (e) { mostrarToast("Error de conexión", "error"); }
}

//logica para que el jefe pueda cambiar su propia clave
const formPassJefe = document.getElementById('form-cambiar-pass');
if (formPassJefe) {
    formPassJefe.addEventListener('submit', async (e) => {
        e.preventDefault();
//sacamos la clave vieja y la nueva de los cuadros de texto
        const password = document.getElementById('pass-actual').value;
        const npassword = document.getElementById('pass-nueva').value;
        try {
//le pedimos al servidor que haga el cambio con la llave de acceso
            const resp = await fetch(`${URL_BASE}/login/npassword`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-token': token },
                body: JSON.stringify({ password, npassword })
            });
            const res = await resp.json();
            if (res.ok) {
//si se cambio con exito cerramos la ventana y limpiamos los campos
                mostrarToast("Contraseña actualizada");
                bootstrap.Modal.getInstance(document.getElementById('modalCambiarPass')).hide();
                formPassJefe.reset();
            } else { mostrarToast(res.msg, "error"); }
        } catch (error) { mostrarToast("Error de servidor", "error"); }
    });
}

//truco para que el jefe tenga que confirmar dos veces antes de aceptar
function confirmarAccion(btn, id, tipo, estado) {
//si ya le pico una vez y vuelve a picar entonces si hacemos el cambio
    if (btn.dataset.confirmando === "true") {
        clearInterval(Number(btn.dataset.intervalo));
        cambiarEstado(id, tipo, estado);
        return;
    }

//guardamos como se veia el boton antes de empezar la cuenta regresiva
    const textoOriginal = btn.innerHTML;
    const claseOriginal = btn.className;

//cambiamos el boton a color amarillo para que llame la atencion
    btn.dataset.confirmando = "true";
    btn.className = "btn btn-warning btn-sm w-50 fw-bold text-dark";

    let contador = 3;
    btn.innerHTML = `Seguro? (${contador}s)`;

//ponemos un cronometro que dure tres segundos
    const intervalo = setInterval(() => {
        contador--;

        if (contador > 0) {
//actualizamos el texto del boton con los segundos que faltan
            btn.innerHTML = `Seguro? (${contador}s)`;
        } else {
//si se acaba el tiempo y no confirmo regresamos todo a la normalidad
            clearInterval(intervalo);
            btn.dataset.confirmando = "false";
            btn.className = claseOriginal;
            btn.innerHTML = textoOriginal;
        }
    }, 1000);

//guardamos el proceso del tiempo para poder pararlo si es necesario
    btn.dataset.intervalo = intervalo;
}
//cambia entre las secciones de la aplicacion cuando se usa en movil
function cambiarTabApp(index) {
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content-area');

//quitamos la marca de activo a todos los botones de la barra de abajo
    document.querySelectorAll('.bottom-tab-nav .tab-item').forEach(el => el.classList.remove('active'));

    if (index === 0) {
//muestra el inicio con las solicitudes pendientes
        sidebar.classList.remove('hidden-tab');
        content.classList.remove('active-tab');
        document.getElementById('tab-home').classList.add('active');
    } else if (index === 1) {
//muestra la tabla de historial quitando lo demas
        sidebar.classList.add('hidden-tab');
        content.classList.add('active-tab');
        content.classList.remove('mode-calendario');
        content.classList.add('mode-historial');
        document.getElementById('tab-hist').classList.add('active');
    } else if (index === 2) {
//muestra el calendario y lo ajusta para que se vea completo
        sidebar.classList.add('hidden-tab');
        content.classList.add('active-tab');
        content.classList.remove('mode-historial');
        content.classList.add('mode-calendario');
        document.getElementById('tab-cal').classList.add('active');

//forzamos al calendario a redibujarse para que no salga encimado
        if (calendarioJefe) {
            setTimeout(() => {
                calendarioJefe.updateSize();
            }, 50);
        }
    }
}
