//ruta para conectar con la api
const URL_BASE = '/api';
//sacamos la llave de seguridad de la sesion
const token = sessionStorage.getItem('token');
//aca vamos a guardar toda la informacion junta
let dataGlobal = [];
//objeto para guardar los dibujos de las graficas
let charts = {};

//si no hay llave lo mandamos de regreso al login
if (!token) window.location.href = "login.html";

//cuando la ventana termina de cargar arrancamos todo
Seguridad.alCargar(async () => {
    try {
        //pedimos los pases y los permisos al mismo tiempo para no tardar
        const [resPases, resPermisos] = await Promise.all([
            fetch(`${URL_BASE}/pases/todos`, { headers: { 'x-token': token } }),
            fetch(`${URL_BASE}/permisos/todos`, { headers: { 'x-token': token } })
        ]);

        //convertimos la respuesta del servidor en listas de datos
        const pasesRaw = (await resPases.json()).data || [];
        const permisosRaw = (await resPermisos.json()).data || [];

        //acomodamos los pases para que tengan el mismo formato
        const pases = pasesRaw.map(p => ({
            ...p,
            tipo: 'Pase',
            fechaClave: p.fecha_uso.split('T')[0],
            diasImpacto: 0.1 //un pase vale como un ratito del dia
        }));

        //acomodamos los permisos con sus dias completos
        const permisos = permisosRaw.map(p => ({
            ...p,
            tipo: 'Permiso',
            fechaClave: p.fecha_inicio.split('T')[0],
            diasImpacto: parseFloat(p.cantidad_dias || 1) //usamos los dias que vienen de la base
        }));

        //juntamos todo en la lista global y dibujamos el tablero
        dataGlobal = [...pases, ...permisos];
        recargarDashboard();

    } catch (error) {
        //si algo falla mostramos el error en la consola
        console.error("Fallo crítico en dashboard:", error);
    }
});

//esta funcion actualiza los numeros y las graficas
function recargarDashboard() {
    //miramos si el usuario eligio un mes en el filtro
    const filtroMes = document.getElementById('filtro-mes-graficos').value;
    //si hay filtro cortamos la lista y si no usamos todo
    let datos = filtroMes ? dataGlobal.filter(d => d.fechaClave.startsWith(filtroMes)) : dataGlobal;

    //sacamos la fecha de hoy para los contadores
    const hoy = new Date().toISOString().split('T')[0];
    //filtramos solo lo que ya esta aceptado
    const aprobados = datos.filter(d => d.estado === 'Aprobado');

    //ponemos los numeros en los cuadritos de texto de la pantalla
    document.getElementById('stat-hoy').textContent = datos.filter(d => d.fechaClave === hoy).length;
    document.getElementById('stat-total').textContent = datos.length;

    //sumamos todos los dias de falta para ver el total
    const diasTotales = aprobados.reduce((acc, curr) => acc + curr.diasImpacto, 0).toFixed(1);
    document.getElementById('stat-dias').textContent = diasTotales;

    //calculamos el porcentaje de cosas aprobadas
    const tasa = datos.length > 0 ? ((aprobados.length / datos.length) * 100).toFixed(0) : 0;
    document.getElementById('stat-tasa').textContent = `${tasa}%`;

    //limpiamos los dibujos viejos antes de hacer los nuevos
    limpiarCharts();

    //dibujamos la grafica de circulo para pases y permisos
    renderDoughnut(datos.filter(d => d.tipo === 'Pase').length, datos.filter(d => d.tipo === 'Permiso').length);

    //contamos cuantos tramites tiene cada area de la escuela
    const areas = {};
    datos.forEach(d => {
        const a = d.area_adscripcion || 'No Definida';
        areas[a] = (areas[a] || 0) + 1;
    });
    //dibujamos las barras de los departamentos
    renderAreas(areas);

    //dibujamos la linea de tiempo con la actividad
    renderTendencia(datos);

    //llenamos las tablas de los maestros y los choques de horario
    renderRanking(datos);
    renderColisiones(datos);
}

//crea la grafica de dona con los tipos de tramites
function renderDoughnut(p, m) {
    charts.tipos = new Chart(document.getElementById('chartTipos'), {
        type: 'doughnut',
        data: {
            labels: ['Pases', 'Permisos'],
            datasets: [{ data: [p, m], backgroundColor: ['#009186', '#0648a3'], borderWeight: 0 }]
        },
        options: { maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom' } } }
    });
}

//crea las barras horizontales para las areas
function renderAreas(objAreas) {
    //ordenamos de mayor a menor y agarramos las primeras seis
    const labels = Object.keys(objAreas).sort((a,b) => objAreas[b] - objAreas[a]).slice(0, 6);
    charts.areas = new Chart(document.getElementById('chartAreas'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: 'Total Trámites', data: labels.map(l => objAreas[l]), backgroundColor: '#4c51bf', borderRadius: 8 }]
        },
        options: {
            indexAxis: 'y',
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

//crea la grafica de linea para ver la tendencia
function renderTendencia(datos) {
    const timeline = {};
    //agarramos los ultimos registros para ver como va la semana
    datos.slice(0, 30).reverse().forEach(d => {
        timeline[d.fechaClave] = (timeline[d.fechaClave] || 0) + 1;
    });

    charts.tendencia = new Chart(document.getElementById('chartTendencia'), {
        type: 'line',
        data: {
            labels: Object.keys(timeline),
            datasets: [{
                data: Object.values(timeline),
                borderColor: '#009186',
                backgroundColor: 'rgba(0,145,134,0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

//llena la tabla de los maestros que mas piden permisos
function renderRanking(datos) {
    const docentes = Object.create(null);
    //contamos cada vez que aparece un nombre
    datos.forEach(d => {
        docentes[d.nombre_completo] = (docentes[d.nombre_completo] || 0) + 1;
    });

    //ordenamos la lista y solo mostramos a los cinco primeros
    const sorted = Object.entries(docentes).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const tbody = document.getElementById('tabla-top-docentes');
    //metemos el html en la tabla con una barra de progreso
    tbody.innerHTML = sorted.map(([nombre, total]) => `
        <tr>
            <td class="fw-bold">${Seguridad.escapeHTML(nombre.split(' ').slice(0,2).join(' '))}</td>
            <td class="text-center"><span class="badge-soft badge-soft-teal">${total}</span></td>
            <td><div class="progress" style="height: 6px;"><div class="progress-bar bg-teal" style="background:#009186; width: ${Math.min(total*10, 100)}%"></div></div></td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center py-3">Sin actividad</td></tr>';
}

//revisa si hay varios maestros de la misma area faltando el mismo dia
function renderColisiones(datos) {
    const col = Object.create(null);
    datos.forEach(d => {
        //si esta rechazado o no tiene area no nos importa para el choque
        if(d.estado === 'Rechazado' || !d.area_adscripcion) return;
        //creamos una llave con la fecha y el area
        const key = `${d.fechaClave}|${d.area_adscripcion}`;
        if(!col[key]) col[key] = [];
        //guardamos el nombre del maestro en ese grupo
        col[key].push(d.nombre_completo);
    });

    const tbody = document.getElementById('tabla-colisiones');
    tbody.innerHTML = '';
    let count = 0;

    //recorremos los grupos y si hay mas de uno avisamos
    for (const [key, profes] of Object.entries(col)) {
        if (profes.length > 1) {
            count++;
            const [f, a] = key.split('|');
            tbody.innerHTML += `
                <tr>
                    <td><i class="fa-solid fa-calendar-day me-2 text-muted"></i>${Seguridad.escapeHTML(f)}</td>
                    <td><span class="badge-soft badge-soft-red">${Seguridad.escapeHTML(a)}</span></td>
                    <td class="small fw-semibold text-dark">${Seguridad.escapeHTML(profes.join(', '))}</td>
                </tr>`;
        }
    }
    //ponemos el numero de choques en el aviso rojo
    document.getElementById('badge-colisiones').textContent = count;
    //si no hay problemas ponemos un mensaje de exito
    if(count === 0) tbody.innerHTML = '<tr><td colspan="3" class="text-center py-3 text-success small"><i class="fa-solid fa-circle-check me-2"></i>Sin conflictos detectados</td></tr>';
}

//borra los objetos de las graficas para que no den problemas al recargar
function limpiarCharts() {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
}
Seguridad.alCargar(() => document.getElementById('btn-logout')?.addEventListener('click', () => Seguridad.salir()));
