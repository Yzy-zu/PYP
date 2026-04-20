//direccion de la api
const URL_BASE = '/api';
//conexion para recibir cambios en vivo
const socket = io();
//aca guardamos el objeto del calendario
let calendarioOficial;
//ventana para pedir solicitudes
let modalInstancia;
//ventana para ver detalles del profesor
let modalDetalleDocenteInstancia;
//lista con toda la info que bajamos
let todosLosRegistrosGlobal = [];
//id de lo que estamos editando ahora mismo
let editandoId = null;
//ventana para avisos de si o no
let modalConfirmacionInstancia;
//datos que todavia no se envian
let datosPendientes = null;
//enlace que quedo a la espera
let urlPendiente = null;
//metodo que quedo a la espera
let metodoPendiente = null;
//lista de dias feriados o libres
let festivosGlobales = []; //

//sacamos la llave de seguridad de la sesion
const token = sessionStorage.getItem('token');
//sacamos el texto del usuario de la sesion
const usuarioStr = sessionStorage.getItem('usuario');

//cuando avisan por socket que un pase cambio
socket.on('pase-actualizado', (data) => {
    cargarDatosYActualizarCalendario();
    mostrarToast("La solicitud de Pase ha sido actualizada!", "info");
});

//cuando avisan por socket que un permiso cambio
socket.on('permiso-actualizado', (data) => {
    cargarDatosYActualizarCalendario();
    mostrarToast("La solicitud de Permiso ha sido actualizada!", "info");
});
//refresca los numeros de arriba
socket.on('actualizar-contadores', actualizarPresupuestoSalidas);

//si no tiene llave o usuario lo sacamos de aca
if (!token || !usuarioStr) window.location.href = "login.html";
//convertimos el texto del usuario a algo que js entienda
const usuario = JSON.parse(usuarioStr);
//si no es docente no lo dejamos pasar
if (usuario.rol !== 'Docente') window.location.href = "login.html";

//borra la sesion y manda al login
function manejarSesionExpirada() {
    sessionStorage.clear();
    window.location.href = "login.html";
}

//arregla la fecha para que no de problemas de zona horaria
function parseLocal(dateStr) {
    const partes = dateStr.split('-');
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

//cuenta los estados y pone los numeros en los circulos
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

//cuando la pagina ya cargo todo esto arranca
document.addEventListener('DOMContentLoaded', () => {
    //creamos las ventanas modales de bootstrap
    modalInstancia = new bootstrap.Modal(document.getElementById('modalSolicitud'));
    modalSemanaFABInstancia = new bootstrap.Modal(document.getElementById('modalSemanaFAB'));
    modalDetalleDocenteInstancia = new bootstrap.Modal(document.getElementById('modalDetalleDocente'));
    //ponemos el nombre del profe en el texto de saludo
    document.getElementById('saludo-profesor').textContent = `Docente: ${usuario.nombre_completo}` || "Docente";
    modalConfirmacionInstancia = new bootstrap.Modal(document.getElementById('modalConfirmacion'));
    modalPerfilInstancia = new bootstrap.Modal(document.getElementById('modalPerfil'));
    //configuramos el clic para ver el perfil
    document.getElementById('link-perfil').addEventListener('click', (e) => {
        e.preventDefault();
        abrirPerfil(false);
    });

    inicializarMotorPDF();

    //configuramos el clic para ver seguridad
    document.getElementById('link-seguridad').addEventListener('click', (e) => {
        e.preventDefault();
        abrirPerfil(true);
    });
    //cuando envian el formulario para cambiar clave
    document.getElementById('form-cambiar-pass').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('pass-actual').value;
        const npassword = document.getElementById('pass-nueva').value;
        try {
            //pedimos al servidor que cambie la contraseña
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
                //si todo sale bien avisamos y cerramos
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
    //sacamos la fecha de hoy para bloquear el calendario
    const hoy = new Date().toISOString().split('T')[0];

    //campos donde se eligen las fechas
    const inputFechaPase = document.getElementById('fecha_uso');
    const inputFechaInicio = document.getElementById('fecha_inicio');

    //ponemos el minimo de fecha para que no elijan dias pasados
    if (inputFechaPase) inputFechaPase.setAttribute('min', hoy);
    if (inputFechaInicio) inputFechaInicio.setAttribute('min', hoy);


    //si cierran el modal limpiamos los pasos
    document.getElementById('modalSolicitud').addEventListener('hidden.bs.modal', volverPaso1);

    const hInicioSelect = document.getElementById('hora_inicio');
    const hFinSelect = document.getElementById('hora_fin');
    //llenamos los select de horas desde las 7 hasta las 20 horas
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
    //bloqueamos el cuadro de dias para que el usuario no escriba
    if (inputDias) {
        inputDias.readOnly = true;
        document.getElementById('fecha_inicio').addEventListener('change', () => {
            actualizarLimitesFechaFin();
            calcularDiasPermiso();
        });
        document.getElementById('fecha_fin').addEventListener('change', calcularDiasPermiso);
    }

    //configuramos el boton para cerrar sesion
    document.getElementById('btn-logout').addEventListener('click', manejarSesionExpirada);

    //si elige pase mostramos ese formulario
    document.getElementById('btn-elegir-pase').addEventListener('click', () => {
        document.getElementById('step-1-choice').style.display = 'none';
        document.getElementById('form-pedir-pase').style.display = 'block';
    });

    //si elige permiso mostramos ese formulario
    document.getElementById('btn-elegir-permiso').addEventListener('click', () => {
        document.getElementById('step-1-choice').style.display = 'none';
        document.getElementById('form-pedir-permiso').style.display = 'block';
    });

    //dibujamos el calendario y traemos los datos de la base
    pintarCalendario([]);
    cargarDatosYActualizarCalendario();
});
//funcion para mostrar alertas de colores en la pantalla
function mostrarToast(mensaje, tipo = 'success') {
//buscamos los elementos del mensaje y el fondo
    const toastEl = document.getElementById('toastNotificacion');
    const toastHeader = document.getElementById('toast-header-bg');
//metemos el texto que llego en el cuadrito
    document.getElementById('toast-mensaje').textContent = mensaje;
//elegimos el color segun si es info error o exito
    let claseFondo = tipo === 'info' ? 'bg-info' : (tipo === 'error' || tipo === 'danger' ? 'bg-danger' : 'bg-success');
//le ponemos las clases de bootstrap al encabezado
    toastHeader.className = `toast-header text-white ${claseFondo}`;
//creamos el aviso y lo mostramos por 4 segundos
    new bootstrap.Toast(toastEl, { delay: 4000 }).show();
}

//regresa todo al inicio cuando cancelan o terminan
function volverPaso1() {
//limpiamos el id que estabamos editando
    editandoId = null;
//cambiamos que se vea el menu principal y no los formularios
    document.getElementById('step-1-choice').style.display = 'block';
    document.getElementById('form-pedir-pase').style.display = 'none';
    document.getElementById('form-pedir-permiso').style.display = 'none';
//borramos todo lo que el usuario escribio en los campos
    document.getElementById('form-pedir-pase').reset();
    document.getElementById('form-pedir-permiso').reset();
}

//sirve para contar solo los dias de lunes a viernes
function calcularDiasPermiso() {
//agarramos las fechas de los campos de texto
    const fechaInicioStr = document.getElementById('fecha_inicio').value;
    const fechaFinStr = document.getElementById('fecha_fin').value;
    const inputDias = document.getElementById('cantidad_dias');
    const btnSubmit = document.querySelector('#form-pedir-permiso button[type="submit"]');

//si falta una fecha nos salimos de la funcion
    if (!fechaInicioStr || !fechaFinStr) return;

//convertimos el texto a fechas reales
    let f1 = parseLocal(fechaInicioStr);
    let f2 = parseLocal(fechaFinStr);

//validamos que la fecha final no sea antes que la de inicio
    if (f2 < f1) {
        mostrarToast("Fecha incorrecta", "error");
        inputDias.value = 0;
//bloqueamos el boton para que no envien basura
        if (btnSubmit) btnSubmit.disabled = true;
        return;
    }

    let diasHabiles = 0;
    let fechaAux = new Date(f1);
//vamos sumando dia por dia para revisar el calendario
    while (fechaAux <= f2) {
//si no es sabado ni domingo lo contamos como dia de trabajo
        if (fechaAux.getDay() !== 0 && fechaAux.getDay() !== 6) diasHabiles++;
        fechaAux.setDate(fechaAux.getDate() + 1);
    }

//ponemos el resultado en el cuadrito de dias
    inputDias.value = diasHabiles;
//si son mas de 3 dias no dejamos enviar el formulario
    btnSubmit.disabled = (diasHabiles > 3 || diasHabiles <= 0);
    if (diasHabiles > 3) {
        mostrarToast("Maximo 3 dias permitidos", "error");
        inputDias.classList.add('is-invalid');
    } else {
        inputDias.classList.remove('is-invalid');
    }
}

//llena la ventana de detalles con la info de la base de datos
function verDetallesSolicitud(data) {
//chequeamos si es un pase de horas o un permiso de dias
    const esPase = data.tipoTramite === 'Pase';
    document.getElementById('v-det-tipo').textContent = data.tipoTramite;
    document.getElementById('v-det-motivo').textContent = data.motivo || 'Sin motivo';

//seccion para mostrar quien dio el permiso
    const contRev = document.getElementById('v-cont-revision');
    if (data.estado !== 'Pendiente' && data.revisado_por_nombre) {
        contRev.style.display = 'block';
        document.getElementById('v-det-revisado-por').textContent = data.revisado_por_nombre;

//formateamos la fecha de cuando lo revisaron
        const f = new Date(data.fecha_revision);
        document.getElementById('v-det-fecha-revision').textContent =
            `${f.toLocaleDateString()} a las ${f.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} hrs`;
    } else {
        contRev.style.display = 'none';
    }

//cambiamos los textos segun si es pase o permiso
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

//logica para el boton de descargar el documento
    const btnPDF = document.getElementById('btn-descargar-pdf');
    if (btnPDF) {
//solo dejamos descargar si ya esta aprobado
        if (data.estado === 'Aprobado') {
            btnPDF.style.display = 'block';
            btnPDF.onclick = async () => {
//ponemos un spinner para que sepan que esta cargando
                const textOrigin = btnPDF.innerHTML;
                btnPDF.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Generando...';
                btnPDF.disabled = true;
                try {
//llamamos a la funcion que fabrica el pdf
                    if (data.tipoTramite === 'Pase') {
                        await pdfPase(data, usuario);
                    } else {
                        await pdfPermiso(data, usuario);
                    }
                } catch (e) {
                    mostrarToast("Error construyendo PDF", "error");
                } finally {
//regresamos el boton a su texto original
                    btnPDF.innerHTML = textOrigin;
                    btnPDF.disabled = false;
                }
            };
        } else {
            btnPDF.style.display = 'none';
        }
    }


//ponemos los colores de los estados con clases de bootstrap
    document.getElementById('v-det-tipo-badge').className = `badge rounded-pill px-3 py-2 ${esPase ? 'bg-info text-dark' : 'bg-primary'}`;
    const badgeEstado = document.getElementById('v-det-estado-badge');
    badgeEstado.textContent = data.estado;

    const colorEstado = data.estado === 'Aprobado' ? 'bg-success' :
        (data.estado === 'Vo.Bo.' ? 'bg-info text-white' :
            (data.estado === 'Pendiente' ? 'bg-warning text-dark' : 'bg-danger'));

    badgeEstado.className = `badge fs-6 ${colorEstado}`;

//mostramos por fin la ventana con todos los detalles
    modalDetalleDocenteInstancia.show();
}


//funcion para traer toda la info de la nube y refrescar el calendario
async function cargarDatosYActualizarCalendario() {
    try {
        //pedimos pases permisos y feriados todos al mismo tiempo para ahorrar tiempo
        const [resPases, resPermisos, resFest] = await Promise.all([
            fetch(`${URL_BASE}/pases/ver`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/permisos/ver`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/dias/ver`, { headers: { 'x-token': token } })
        ]);

        //si el servidor dice que no tenemos permiso cerramos la sesion
        if (resPases.status === 401 || resPermisos.status === 401) return manejarSesionExpirada();

        //pasamos las respuestas a un formato que el codigo entienda
        const dataPases = await resPases.json();
        const dataPermisos = await resPermisos.json();
        festivosGlobales = await resFest.json();

        //si todo salio bien con los datos empezamos a acomodarlos
        if (dataPases.ok && dataPermisos.ok) {
            //les ponemos una etiqueta para saber que es cada cosa y cual es su fecha
            const pasesM = (dataPases.data || []).map(p => ({ ...p, tipoTramite: 'Pase', fechaClave: p.fecha_uso }));
            const permisosM = (dataPermisos.data || []).map(p => ({ ...p, tipoTramite: 'Permiso', fechaClave: p.fecha_inicio }));
            //juntamos todo en una sola lista grande
            todosLosRegistrosGlobal = [...pasesM, ...permisosM];

            //creamos los cuadritos que se van a ver en el calendario con sus colores
            const eventosTramites = todosLosRegistrosGlobal.map(reg => ({
                title: `${reg.tipoTramite}: ${reg.estado}`,
                start: reg.fechaClave.split('T')[0],
                //verde para aprobado celeste para visto bueno amarillo para pendiente y rojo para lo demas
                backgroundColor: reg.estado === 'Aprobado' ? '#198754' :
                    (reg.estado === 'Vo.Bo.' ? '#02c4ff' :
                        (reg.estado === 'Pendiente' ? '#ffc107' : '#dc3545')),
                borderColor: 'transparent',
                extendedProps: { ...reg }
            }));

            //marcamos los dias que no son laborables con un fondo verde clarito
            const eventosFestivos = festivosGlobales.map(f => ({
                title: ` ${f.descripcion}`,
                start: f.fecha.split('T')[0],
                display: 'background',
                backgroundColor: 'rgba(25, 135, 84, 0.2)',
                extendedProps: { esBloqueado: true, msg: f.descripcion }
            }));

            //sacamos el dia del cumple del usuario para felicitarlo
            const cumpleMesDia = usuario?.fecha_nacimiento ? usuario.fecha_nacimiento.substring(5, 10) : null;
            const añoActual = new Date().getFullYear();

            //actualizamos la lista de abajo y los contadores de colores
            pintarHistorial(todosLosRegistrosGlobal);
            actualizarBadges(todosLosRegistrosGlobal);
            //limpiamos el calendario y le metemos la info nueva
            calendarioOficial.removeAllEventSources();
            calendarioOficial.addEventSource(eventosTramites);
            calendarioOficial.addEventSource(eventosFestivos);

            //si hoy cumple años le ponemos un evento especial amarillo
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

//funcion para configurar y mostrar el calendario en la pantalla
function pintarCalendario(eventos) {
    //si ya habia un calendario lo borramos para no encimar cosas
    if (calendarioOficial) calendarioOficial.destroy();

    //creamos el calendario nuevo con vista de mes y en español
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
        //esto ajusta los botones si el usuario esta en un celular
        windowResize: function (arg) {
            if (window.innerWidth < 768) {
                //quita botones para que quepan en pantalla chica
                calendarioOficial.setOption('headerToolbar', {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today'
                });
            } else {
                //pone todos los botones si es una computadora
                calendarioOficial.setOption('headerToolbar', {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listMonth'
                });
            }
        },


        //le pone clases de css a los cuadritos de los dias
        dayCellClassNames: (arg) => {
            const fechaCelda = arg.date.toISOString().split('T')[0];
            const cumpleMesDia = usuario?.fecha_nacimiento ? usuario.fecha_nacimiento.substring(5, 10) : null;

            //pone gris los fines de semana
            if (arg.date.getDay() === 0 || arg.date.getDay() === 6) return ['bg-light'];

            //revisa si el dia es feriado o cumple del docente
            const esFestivo = festivosGlobales.some(f => f.fecha.split('T')[0] === fechaCelda);
            const esCumple = cumpleMesDia && (fechaCelda.substring(5, 10) === cumpleMesDia);

            //revisa si el profe ya tiene algo que hacer ese dia
            const diaOcupado = verificarDias(fechaCelda);

            //si esta ocupado o es feriado bloqueamos el dia
            if (esFestivo || esCumple || diaOcupado) {
                return ['dia-bloqueado'];
            }

            return [];
        },


        //que pasa cuando le dan clic a un dia vacio
        dateClick: (info) => {
            const hoyCheck = new Date();
            hoyCheck.setHours(0, 0, 0, 0);
            const fechaClick = new Date(info.dateStr + 'T00:00:00');

            //avisamos que no se puede pedir cosas de dias que ya pasaron
            if (fechaClick < hoyCheck) {
                mostrarToast("No puedes solicitar dias pasados", "error");
                return;
            }
            //avisamos porque el dia esta bloqueado
            if (info.dayEl.classList.contains('dia-bloqueado') || info.date.getDay() === 0 || info.date.getDay() === 6) {
                if (verificarDias(info.dateStr)) {
                    mostrarToast("Ya tienes un trámite activo para este día", "error");
                } else {
                    const esCumple = usuario?.fecha_nacimiento && info.dateStr.substring(5, 10) === usuario.fecha_nacimiento.substring(5, 10);
                    mostrarToast(esCumple ? "Feliz cumpleaños!!!" : "No hay labores este dia", "info");
                }
                return;
            }

            //si el dia esta libre abrimos el formulario con la fecha ya puesta
            volverPaso1();
            document.getElementById('fecha_uso').value = info.dateStr;
            document.getElementById('fecha_inicio').value = info.dateStr;
            actualizarLimitesFechaFin();
            document.getElementById('fecha_fin').value = info.dateStr;
            calcularDiasPermiso();
            modalInstancia.show();
        },

        //que pasa cuando le dan clic a un tramite ya dibujado
        eventClick: (info) => {
            //si es un bloqueo de feriado o cumple no hacemos nada
            if (info.event.extendedProps.esBloqueado) return;
            //si es un tramite mostramos toda su informacion
            verDetallesSolicitud(info.event.extendedProps);
        }
    });
    //dibujamos el calendario por fin
    calendarioOficial.render();
}

//esta funcion dibuja la lista de tramites en el cuadrito de historial
function pintarHistorial(registros) {

    const contenedor = document.getElementById('historial-lista');
//vaciamos la lista para que no se amontone lo viejo al recargar
    contenedor.innerHTML = '';



//ordenamos los datos por estado para que los pendientes salgan primero
    [...registros].sort((a, b) => {
        const prioridad = { 'Pendiente': 1, 'Vo.Bo.': 2, 'Aprobado': 3, 'Rechazado': 4, 'Cancelado': 5 };
        const pA = prioridad[a.estado] || 99;
        const pB = prioridad[b.estado] || 99;
        //estado reciente
        if (pA !== pB) return pA - pB;
        //id reciente
        return b.id - a.id;

//solo mostramos los primeros 60 registros para no trabar la pagina
    }).slice(0, 59).forEach(reg => {
        const fechaParaMostrar = reg.fecha_uso_h || reg.fecha_inicio_h;
//elegimos el color del borde segun como vaya el tramite
        let borderClass = reg.estado === 'Aprobado' ? 'border-success' : (reg.estado === 'Vo.Bo.' ? 'border-info' :
            (reg.estado === 'Pendiente' ? 'border-warning' : 'border-danger'));
        const div = document.createElement('div');
        div.className = `card mb-2 shadow-sm border-0 border-start border-4 ${borderClass}`;
        div.style.cursor = 'pointer';
//si le dan clic a la tarjeta vemos el detalle completo
        div.onclick = () => verDetallesSolicitud(reg);
//metemos todo el diseño de la tarjeta con sus datos y etiquetas
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
//funcion para cargar los datos en el formulario cuando queremos editar
function prepararEdicion(tipo, id) {
    const reg = todosLosRegistrosGlobal.find(r => r.id === id && r.tipoTramite === tipo);
    editandoId = id;

//escondemos los botones de seleccion para mostrar el formulario
    document.getElementById('step-1-choice').style.display = 'none';
    document.getElementById('form-pedir-pase').style.display = 'none';
    document.getElementById('form-pedir-permiso').style.display = 'none';

//si es un pase llenamos los campos de horas y fecha de uso
    if (tipo === 'Pase') {
        document.getElementById('form-pedir-pase').style.display = 'block';
        document.getElementById('fecha_uso').value = reg.fecha_uso.split('T')[0];
        document.getElementById('hora_inicio').value = reg.hora_inicio.substring(0, 5);
        document.getElementById('hora_fin').value = reg.hora_fin.substring(0, 5);
        document.getElementById('motivo_pase').value = reg.motivo;
    } else {
//si es permiso llenamos las fechas de inicio y fin
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

//prepara todo para cancelar un tramite pero pide confirmacion antes
function cancelarSolicitud(tipo, id) {
//buscamos a que parte de la api pegarle segun el tipo
    const endpoint = tipo === 'Pase' ? 'pases' : 'permisos';
    urlPendiente = `${URL_BASE}/${endpoint}/cancelar`;
    metodoPendiente = 'PATCH';
    datosPendientes = { id, cancelar: "Cancelado" };

//armamos el texto de advertencia para el modal de confirmacion
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


//revisamos que el pase este bien antes de mandarlo a guardar
document.getElementById('form-pedir-pase').addEventListener('submit', (e) => {
    e.preventDefault();
    const fechaUso = document.getElementById('fecha_uso').value;

//checa que no tenga otro tramite el mismo dia si es nuevo
    if (!editandoId && verificarDias(fechaUso)) {
        return mostrarToast("Ya tienes una solicitud activa para esa fecha", "error");
    }
    const hInicio = document.getElementById('hora_inicio').value;
    const hFin = document.getElementById('hora_fin').value;
    const motivo = document.getElementById('motivo_pase').value;
//valida que la hora de salida no sea antes que la de entrada
    if (hFin <= hInicio) return mostrarToast("Hora incorrecta", "error");
    datosPendientes = { fecha_uso: fechaUso, hora_inicio: hInicio, hora_fin: hFin, motivo, id: editandoId };
//decidimos si vamos a crear uno nuevo o a modificar uno viejo
    urlPendiente = editandoId ? `${URL_BASE}/pases/mod` : `${URL_BASE}/pases/crear`;
    metodoPendiente = editandoId ? 'PATCH' : 'POST';
    document.getElementById('conf-resumen').innerHTML = `<strong>Pase</strong>: ${fechaUso} de ${hInicio} a ${hFin}`;
    modalConfirmacionInstancia.show();
});

//revisamos que el permiso este correcto y no choque con otros dias
document.getElementById('form-pedir-permiso').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = document.getElementById('tipo_permiso').value;
    const fechaI = document.getElementById('fecha_inicio').value;
    const fechaF = document.getElementById('fecha_fin').value;

    let temp = new Date(fechaI + 'T00:00:00');
    const fFinal = new Date(fechaF + 'T00:00:00');

//recorremos los dias para ver si alguno ya esta ocupado
    while (temp <= fFinal) {
        if (!editandoId && verificarDias(temp.toISOString().split('T')[0])) {
            return mostrarToast(`El día ${temp.toLocaleDateString()} ya está ocupado`, "error");
        }
        temp.setDate(temp.getDate() + 1);
    }
//validamos que no se pase de los 3 dias permitidos por regla
    const maxD = parseInt(document.getElementById('cantidad_dias').value) || 0;
    if (maxD > 3 || maxD <= 0) return mostrarToast("Días de permiso excedidos o inválidos", "error");
    const dias = document.getElementById('cantidad_dias').value;
    const motivo = document.getElementById('motivo').value;
    datosPendientes = { tipo_permiso: tipo, fecha_inicio: fechaI, fecha_fin: fechaF, cantidad_dias: dias, motivo, id: editandoId };
//preparamos la ruta de la api para guardar los cambios
    urlPendiente = editandoId ? `${URL_BASE}/permisos/mod` : `${URL_BASE}/permisos/crear`;
    metodoPendiente = editandoId ? 'PATCH' : 'POST';
    document.getElementById('conf-resumen').innerHTML = `<strong>Permiso</strong>: ${tipo} del ${fechaI} al ${fechaF}`;
    modalConfirmacionInstancia.show();
});

//este boton es el que de verdad hace el fetch para enviar todo al server
document.getElementById('btn-confirmar-envio').addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirmar-envio');
//bloqueamos el boton para que no le den mil clics seguidos
    btn.disabled = true;
    try {
//mandamos los datos guardados a la direccion que toque
        const resp = await fetch(urlPendiente, {
            method: metodoPendiente,
            headers: { 'Content-Type': 'application/json', 'x-token': token },
            body: JSON.stringify(datosPendientes)
        });
        const res = await resp.json();
        modalConfirmacionInstancia.hide();
        if (res.ok) {
//si todo salio bien limpiamos todo y refrescamos los datos
            modalInstancia.hide(); volverPaso1(); cargarDatosYActualizarCalendario();
            mostrarToast("Operación exitosa");
        } else { mostrarToast(res.msg, "error"); }
    } catch (e) { mostrarToast("Error de servidor", "error"); }
    finally { btn.disabled = false; }
});



//limites
function actualizarLimitesHoraFin() {
//ajusta las horas finales segun la hora que pusieron al inicio
    const hIn = document.getElementById('hora_inicio');
    const hFi = document.getElementById('hora_fin');
//si falta algun cuadrito o no tiene valor nos salimos
    if (!hIn || !hFi || !hIn.value) return;
//sacamos el numero de la hora inicial para comparar
    const hInNum = parseInt(hIn.value.split(':')[0]);

    let isCurrentDisabled = false;
//revisamos cada opcion de la lista de horas finales
    Array.from(hFi.options).forEach(opt => {
        const hFiNum = parseInt(opt.value.split(':')[0]);
//bloqueamos si la hora es menor o si pasa de tres horas de diferencia
        opt.disabled = (hFiNum <= hInNum || hFiNum > hInNum + 3);
//checa si la hora que ya estaba puesta ahora esta bloqueada
        if (opt.value === hFi.value && opt.disabled) isCurrentDisabled = true;
    });

//si la hora actual se bloqueo ponemos una por defecto que sea valida
    if (isCurrentDisabled) {
        hFi.value = (hInNum + 1 < 10 ? '0' : '') + (hInNum + 1) + ':00';
    }
}

function actualizarLimitesFechaFin() {
//controla que el permiso no dure mas de lo permitido
    const iI = document.getElementById('fecha_inicio');
    const iF = document.getElementById('fecha_fin');
//si no hay fecha de inicio no podemos calcular nada
    if (!iI || !iF || !iI.value) return;
//la fecha de fin no puede ser mas chica que la de inicio
    iF.min = iI.value;

    let fMax = parseLocal(iI.value);

//contamos tres dias de trabajo saltando los fines de semana
    let dH = (fMax.getDay() === 0 || fMax.getDay() === 6) ? 0 : 1;
    while (dH < 3) {
        fMax.setDate(fMax.getDate() + 1);
        if (fMax.getDay() !== 0 && fMax.getDay() !== 6) dH++;
    }

//formateamos la fecha maxima para el calendario del navegador
    const y = fMax.getFullYear();
    const m = String(fMax.getMonth() + 1).padStart(2, '0');
    const d = String(fMax.getDate()).padStart(2, '0');
    iF.max = `${y}-${m}-${d}`;

//si la fecha que estaba puesta se pasa del limite la corregimos
    if (iF.value > iF.max || iF.value < iF.min) iF.value = iI.value;
}

function abrirPerfil(conSeguridad) {
//sacamos los datos del docente que estan guardados en la sesion
    const u = JSON.parse(sessionStorage.getItem('usuario'));

//llenamos los campos del modal con la info del profesor
    document.getElementById('p-nombre').textContent = u.nombre_completo;
    document.getElementById('p-rfc').textContent = u.rfc || 'No registrado';
    document.getElementById('p-categoria').textContent = u.categoria || 'N/A';
    document.getElementById('p-area').textContent = u.area_adscripcion || 'N/A';
    document.getElementById('p-ingreso').textContent = u.fecha_ingreso ? u.fecha_ingreso.split('T')[0] : 'N/A';
    document.getElementById('p-contrato').textContent = u.tipo_contrato || 'N/A';

//decidimos si mostramos los datos de trabajo o el cambio de clave
    document.getElementById('info-laboral-perfil').style.display = conSeguridad ? 'none' : 'flex';
    document.getElementById('seccion-seguridad').style.display = conSeguridad ? 'block' : 'none';
//cambiamos el icono y el titulo de la ventana arriba
    const titulo = document.querySelector('#modalPerfil .modal-title');
    titulo.innerHTML = conSeguridad
        ? '<i class="fa-solid fa-key me-2 text-warning"></i> Cambiar Contraseña'
        : '<i class="fa-solid fa-user-gear me-2"></i> Expediente Docente';
//mostramos la ventana flotante
    modalPerfilInstancia.show();
}
function verificarDias(fechaNueva) {
//revisa si la fecha que eligieron ya tiene un tramite activo
    const fechaBusqueda = typeof fechaNueva === 'string' ? fechaNueva : fechaNueva.toISOString().split('T')[0];

    return todosLosRegistrosGlobal.some(reg => {
//si el tramite fue cancelado o rechazado no estorba
        if (reg.estado === 'Rechazado' || reg.estado === 'Cancelado') return false;

        if (reg.tipoTramite === 'Pase') {
//comparamos el dia exacto para los pases de horas
            return reg.fecha_uso.split('T')[0] === fechaBusqueda;
        } else {
//revisamos si la fecha cae dentro del rango de un permiso de varios dias
            const inicio = new Date(reg.fecha_inicio.split('T')[0]);
            const fin = new Date(reg.fecha_fin.split('T')[0]);
            const actual = new Date(fechaBusqueda);
            return (actual >= inicio && actual <= fin);
        }
    });
}
//funcion para contadores
async function actualizarPresupuestoSalidas() {
//obtenemos la llave de seguridad para pedir los datos
    const token = sessionStorage.getItem('token');
    if (!token) return;

    try {
//llamamos a la api para saber cuantos tramites lleva el profe
        const resp = await fetch('/api/login/contadores', {
            headers: { 'x-token': token }
        });
        const data = await resp.json();

        if (data.ok) {
//dibujamos las barras de progreso con la info nueva
            renderizarBarra('pases', data.pases.usados);
            renderizarBarra('permisos', data.permisos.usados);
        }
    } catch (error) {
        console.error("Error al cargar presupuesto:", error);
    }
}
//funcion para barra visual
function renderizarBarra(tipo, usados) {
//buscamos los elementos de la barra y el texto del numero
    const badge = document.getElementById(`${tipo}-badge`);
    const bar = document.getElementById(`${tipo}-bar`);
//calculamos el porcentaje basado en el maximo de tres tramites
    const porcentaje = (usados / 3) * 100;

    badge.textContent = `${usados} / 3`;
    bar.style.width = `${porcentaje}%`;

//si ya uso los tres ponemos la barra en rojo por peligro
    if (usados >= 3) {
        badge.className = "badge rounded-pill bg-danger";
        bar.className = "progress-bar bg-danger";
    } else if (usados === 2) {
//si le queda uno solo la ponemos en amarillo para avisar
        badge.className = "badge rounded-pill bg-warning text-dark";
        bar.className = "progress-bar bg-warning";
    } else {
//si tiene mas de uno libre la dejamos en verde
        badge.className = "badge rounded-pill bg-success";
        bar.className = "progress-bar bg-success";
    }
}

document.addEventListener('DOMContentLoaded', () => {
//apenas carga la pagina pedimos el presupuesto para mostrarlo
    actualizarPresupuestoSalidas();
});
//version movil
function cambiarTabApp(index) {
//sirve para cambiar de vista en el celular entre la lista y el calendario
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.content-area');
    const tabHome = document.getElementById('tab-home');
    const tabCal = document.getElementById('tab-cal');

    if (index === 0) {
//muestra la lista de tramites y oculta el calendario
        sidebar.classList.remove('hidden-tab');
        content.classList.remove('active-tab');
        if (tabHome) tabHome.classList.add('active');
        if (tabCal) tabCal.classList.remove('active');
    } else if (index === 1) {
//muestra el calendario y oculta la lista de tramites
        sidebar.classList.add('hidden-tab');
        content.classList.add('active-tab');
        if (tabHome) tabHome.classList.remove('active');
        if (tabCal) tabCal.classList.add('active');

//ajustamos el tamaño del calendario para que no se vea cortado
        if (calendarioOficial) {
            setTimeout(() => {
                calendarioOficial.updateSize();
            }, 50);
        }
    }
}

//semana actual
function abrirModalSemanaRAPIDO() {
//prepara la ventanita para elegir un dia de esta semana rapido
    const contenedor = document.getElementById('contenedor-dias-semana');
    contenedor.innerHTML = '';

    const hoyReal = new Date();
//calculamos que dia de la semana es hoy para sacar los demas
    const diaSemana = hoyReal.getDay() === 0 ? 7 : hoyReal.getDay();
    const hoyCheck = new Date();
    hoyCheck.setHours(0, 0, 0, 0);

    const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

//hacemos un boton por cada dia de lunes a viernes
    for (let i = 1; i <= 5; i++) {
        const diaTarget = new Date(hoyReal.getFullYear(), hoyReal.getMonth(), hoyReal.getDate());
        diaTarget.setDate(hoyReal.getDate() - diaSemana + i);


        const y = diaTarget.getFullYear();
        const m = String(diaTarget.getMonth() + 1).padStart(2, '0');
        const d = String(diaTarget.getDate()).padStart(2, '0');
        const fechaStr = `${y}-${m}-${d}`;

//revisamos si el dia ya paso o si esta ocupado por otro motivo
        const esPasado = diaTarget < hoyCheck;
        const ocupado = verificarDias(fechaStr);
        const esFestivo = festivosGlobales.some(f => f.fecha.split('T')[0] === fechaStr);
        const esCumple = usuario?.fecha_nacimiento && fechaStr.substring(5, 10) === usuario.fecha_nacimiento.substring(5, 10);

        const esBloqueado = esPasado || ocupado || esFestivo || esCumple;

//creamos la etiqueta que dice porque no se puede elegir el dia
        let labelEstado = '';
        if (esPasado) labelEstado = 'Pasado';
        else if (esFestivo) labelEstado = 'Festivo';
        else if (esCumple) labelEstado = 'Cumpleaños';
        else if (ocupado) labelEstado = 'Ocupado';

        const btn = document.createElement('button');
//le ponemos el diseño al boton y lo bloqueamos si es necesario
        btn.className = `btn w-100 fw-bold d-flex justify-content-between align-items-center mb-1 ${esBloqueado ? 'btn-light border text-muted' : 'btn-outline-primary'}`;
        btn.style.borderRadius = "14px";
        btn.innerHTML = `<span class="fs-6">${nombresDias[i - 1]} ${diaTarget.getDate()} ${labelEstado ? `<span class="badge bg-secondary ms-2 opacity-50" style="font-size:0.6rem">${labelEstado}</span>` : ''}</span> <i class="fa-solid ${esBloqueado ? 'fa-ban text-danger opacity-50' : 'fa-chevron-right'}"></i>`;

        if (!esBloqueado) {
//si el dia esta disponible abrimos el formulario con esa fecha lista
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

//abrimos el modal con toda la semana dibujada
    modalSemanaFABInstancia.show();
}