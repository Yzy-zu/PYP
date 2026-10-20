// Seguridad.cargar valida el rol RRHH antes de ejecutar este archivo.
const URL_BASE = '/api';
const ESTADOS_INFORME = ['Pendiente', 'Vo.Bo.', 'Aprobado', 'Rechazado', 'Cancelado'];
let dataGlobal = [];
let datosInforme = [];
let charts = {};
let hoyEscolar = '';
let festivosInforme = new Set();

function fechaInforme(valor) {
    const fecha = String(valor || '').split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '';
    const dia = new Date(`${fecha}T12:00:00Z`);
    return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha ? fecha : '';
}

async function consultarInforme(ruta) {
    // El wrapper de Seguridad añade siempre el token vigente y trata sesiones vencidas.
    const respuesta = await fetch(`${URL_BASE}${ruta}`, { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('No se pudo consultar el informe. Revisa tu sesión y vuelve a intentar.');
    const datos = await respuesta.json();
    if (datos.ok === false) throw new Error('No se pudo consultar el informe. Vuelve a intentar.');
    return datos;
}

async function cargarInforme() {
    const mensaje = document.getElementById('mensaje-informe');
    const boton = document.getElementById('btn-recargar-informe');
    boton.disabled = true;
    mensaje.textContent = 'Cargando información…';
    try {
        const [pases, permisos, config, festivos] = await Promise.all([
            consultarInforme('/pases/todos'), consultarInforme('/permisos/todos'),
            consultarInforme('/negocio/config'), consultarInforme('/dias/ver')
        ]);
        if (!Array.isArray(pases.data) || !Array.isArray(permisos.data) || !Array.isArray(festivos) || !fechaInforme(config.hoy)) {
            throw new Error('El servidor devolvió información incompleta. Vuelve a intentar.');
        }
        hoyEscolar = config.hoy;
        festivosInforme = new Set(festivos.map(f => fechaInforme(f.fecha)).filter(Boolean));
        const normalizar = (registro, tipo) => {
            const fechaClave = fechaInforme(tipo === 'Pase' ? registro.fecha_uso : registro.fecha_inicio);
            const fechaFin = tipo === 'Pase' ? fechaClave : fechaInforme(registro.fecha_fin);
            const dias = Number(registro.cantidad_dias);
            if (!fechaClave || !fechaFin || fechaFin < fechaClave || !ESTADOS_INFORME.includes(registro.estado) ||
                (tipo === 'Permiso' && (!Number.isFinite(dias) || dias <= 0))) {
                throw new Error('Hay registros con fechas, días o estados incompletos. El informe no se calculó; revisa los datos.');
            }
            return { ...registro, tipo, fechaClave, fechaFin, diasImpacto: tipo === 'Permiso' ? dias : 0 };
        };
        dataGlobal = [...pases.data.map(p => normalizar(p, 'Pase')), ...permisos.data.map(p => normalizar(p, 'Permiso'))];
        document.getElementById('fecha-reporte').textContent = `Día escolar: ${hoyEscolar} · ${config.zonaHoraria || 'America/Mexico_City'}`;
        recargarDashboard();
    } catch (error) {
        dataGlobal = [];
        datosInforme = [];
        recargarDashboard();
        mensaje.textContent = error.message || 'No hay conexión. Vuelve a intentar.';
        mensaje.className = 'alert alert-danger';
        document.getElementById('btn-exportar-informe').disabled = true;
    } finally { boton.disabled = false; }
}

function recargarDashboard() {
    const mes = document.getElementById('filtro-mes-graficos').value;
    const tipo = document.getElementById('filtro-tipo-informe').value;
    const estado = document.getElementById('filtro-estado-informe').value;
    datosInforme = dataGlobal.filter(d => (!mes || d.fechaClave.startsWith(mes)) && (!tipo || d.tipo === tipo) && (!estado || d.estado === estado));
    const aprobados = datosInforme.filter(d => d.estado === 'Aprobado');
    const decisiones = datosInforme.filter(d => d.estado === 'Aprobado' || d.estado === 'Rechazado');
    document.getElementById('stat-hoy').textContent = datosInforme.filter(d => d.fechaClave === hoyEscolar).length;
    document.getElementById('stat-total').textContent = datosInforme.length;
    document.getElementById('stat-dias').textContent = aprobados.reduce((total, d) => total + d.diasImpacto, 0);
    const horasPases = aprobados.filter(d => d.tipo === 'Pase').reduce((total, d) => total + horasPaseInforme(d), 0);
    document.getElementById('stat-horas').textContent = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(horasPases);
    document.getElementById('stat-tasa').textContent = decisiones.length ? `${Math.round(aprobados.length / decisiones.length * 100)}%` : 'Sin decisiones';
    document.getElementById('stat-vobo').textContent = datosInforme.filter(d => d.estado === 'Vo.Bo.').length;
    document.getElementById('periodo-informe').textContent = mes ? `Periodo de uso/inicio: ${mes}` : 'Histórico de uso/inicio completo';
    const mensaje = document.getElementById('mensaje-informe');
    mensaje.className = 'alert alert-info';
    mensaje.textContent = datosInforme.length ? `${datosInforme.length} trámites coinciden con los filtros.` : 'No hay trámites que coincidan con los filtros.';
    document.getElementById('btn-exportar-informe').disabled = !datosInforme.length;
    limpiarCharts();
    renderDoughnut(datosInforme.filter(d => d.tipo === 'Pase').length, datosInforme.filter(d => d.tipo === 'Permiso').length);
    const areas = new Map();
    datosInforme.forEach(d => { const area = d.area_adscripcion || 'Sin área registrada'; areas.set(area, (areas.get(area) || 0) + 1); });
    renderAreas(areas);
    renderTendencia(datosInforme);
    renderRanking(datosInforme);
    renderColisiones(datosInforme);
}

function dibujarGrafica(clave, id, config) {
    const canvas = document.getElementById(id);
    if (typeof Chart !== 'function') {
        canvas.hidden = true;
        const aviso = document.getElementById('aviso-graficas');
        aviso.hidden = false;
        return;
    }
    charts[clave] = new Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, animation: false, ...config.options } });
}

function renderDoughnut(pases, permisos) {
    dibujarGrafica('tipos', 'chartTipos', {
        type: 'doughnut', data: { labels: ['Pases', 'Permisos'], datasets: [{ data: [pases, permisos], backgroundColor: ['#009186', '#0648a3'] }] },
        options: { cutout: '65%', plugins: { legend: { position: 'bottom' } } }
    });
}

function renderAreas(areas) {
    const mayores = [...areas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    dibujarGrafica('areas', 'chartAreas', {
        type: 'bar', data: { labels: mayores.map(([area]) => area), datasets: [{ label: 'Trámites', data: mayores.map(([, total]) => total), backgroundColor: '#4c51bf' }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function renderTendencia(datos) {
    const dias = new Map();
    datos.forEach(d => dias.set(d.fechaClave, (dias.get(d.fechaClave) || 0) + 1));
    const fechas = [...dias.keys()].sort();
    dibujarGrafica('tendencia', 'chartTendencia', {
        type: 'line', data: { labels: fechas, datasets: [{ label: 'Trámites con inicio en la fecha', data: fechas.map(f => dias.get(f)), borderColor: '#009186', backgroundColor: 'rgba(0,145,134,0.1)', fill: true }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

function filaInforme(valores) {
    const fila = document.createElement('tr');
    valores.forEach(valor => { const celda = document.createElement('td'); celda.textContent = String(valor ?? ''); fila.appendChild(celda); });
    return fila;
}

function renderRanking(datos) {
    const docentes = new Map();
    datos.forEach(d => {
        const id = d.usuario_id ?? d.id_usuario ?? `nombre:${d.nombre_completo}`;
        const docente = docentes.get(id) || { nombre: d.nombre_completo || 'Sin nombre', total: 0 };
        docente.total++;
        docentes.set(id, docente);
    });
    const tbody = document.getElementById('tabla-top-docentes');
    tbody.replaceChildren();
    [...docentes.values()].sort((a, b) => b.total - a.total).slice(0, 5).forEach(d => tbody.appendChild(filaInforme([d.nombre, d.total])));
    if (!docentes.size) tbody.appendChild(filaInforme(['Sin actividad', '—']));
}

function renderColisiones(datos) {
    // Una alerta requiere dos personas distintas de la misma área y horarios que se superponen.
    const activos = datos.filter(d => ['Pendiente', 'Aprobado', 'Vo.Bo.'].includes(d.estado) && d.area_adscripcion);
    const coincidencias = new Map();
    for (let i = 0; i < activos.length; i++) {
        const a = activos[i];
        for (let j = i + 1; j < activos.length; j++) {
            const b = activos[j];
            const uidA = String(a.usuario_id ?? a.id_usuario ?? a.nombre_completo);
            const uidB = String(b.usuario_id ?? b.id_usuario ?? b.nombre_completo);
            if (uidA === uidB || a.area_adscripcion !== b.area_adscripcion) continue;
            if (a.tipo === 'Pase' && b.tipo === 'Pase' &&
                !(String(a.hora_inicio) < String(b.hora_fin) && String(b.hora_inicio) < String(a.hora_fin))) continue;
            const inicio = a.fechaClave > b.fechaClave ? a.fechaClave : b.fechaClave;
            const fin = a.fechaFin < b.fechaFin ? a.fechaFin : b.fechaFin;
            if (inicio > fin) continue;
            const dia = new Date(`${inicio}T12:00:00Z`);
            const ultimo = new Date(`${fin}T12:00:00Z`);
            while (dia <= ultimo) {
                const fecha = dia.toISOString().slice(0, 10);
                if (dia.getUTCDay() !== 0 && dia.getUTCDay() !== 6 && !festivosInforme.has(fecha)) {
                    const key = JSON.stringify([fecha, a.area_adscripcion]);
                    const grupo = coincidencias.get(key) || { fecha, area: a.area_adscripcion, personas: new Map() };
                    [a, b].forEach(d => {
                        const id = String(d.usuario_id ?? d.id_usuario ?? d.nombre_completo);
                        const persona = grupo.personas.get(id) || { nombre: d.nombre_completo || 'Sin nombre', estados: new Set() };
                        persona.estados.add(d.estado === 'Vo.Bo.' ? 'Vo.Bo. pendiente de RH' : d.estado);
                        grupo.personas.set(id, persona);
                    });
                    coincidencias.set(key, grupo);
                }
                dia.setUTCDate(dia.getUTCDate() + 1);
            }
        }
    }
    const tbody = document.getElementById('tabla-colisiones');
    tbody.replaceChildren();
    [...coincidencias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).forEach(g => {
        tbody.appendChild(filaInforme([g.fecha, g.area, [...g.personas.values()].map(p => `${p.nombre} (${[...p.estados].join(', ')})`).join('; ')]));
    });
    document.getElementById('badge-colisiones').textContent = coincidencias.size;
    if (!coincidencias.size) tbody.appendChild(filaInforme(['Sin coincidencias en los registros filtrados', '—', '—']));
}

function horasPaseInforme(registro) {
    const minutos = valor => {
        const partes = String(valor || '').split(':').map(Number);
        return partes.length >= 2 && partes.every(Number.isFinite) ? partes[0] * 60 + partes[1] + (partes[2] || 0) / 60 : 0;
    };
    return Math.max(0, minutos(registro.hora_fin) - minutos(registro.hora_inicio)) / 60;
}

function celdaCSVInforme(valor) {
    let texto = String(valor ?? '');
    // Neutraliza fórmulas incluso con espacios o controles delante; conserva comillas y saltos válidos de CSV.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(texto) || /^[\t\r\n]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replace(/"/g, '""')}"`;
}

function exportarInforme() {
    if (!datosInforme.length) return;
    const filas = [['Folio', 'Tipo', 'Docente', 'Área', 'Fecha de uso/inicio', 'Fecha fin', 'Estado', 'Días de permiso', 'Horas de pase', 'Hora inicio', 'Hora fin', 'Fecha solicitud', 'Motivo']];
    datosInforme.forEach(d => filas.push([
        d.folio || `${d.tipo === 'Pase' ? 'PASE' : 'PERM'}-${String(d.id).padStart(8, '0')}`,
        d.tipo, d.nombre_completo, d.area_adscripcion, d.fechaClave, d.fechaFin, d.estado,
        d.tipo === 'Permiso' ? d.diasImpacto : '', d.tipo === 'Pase' ? horasPaseInforme(d) : '', d.hora_inicio, d.hora_fin, d.fecha_solicitud, d.motivo
    ]));
    const archivo = new Blob(['\uFEFF', filas.map(f => f.map(celdaCSVInforme).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `Informe_RH_${document.getElementById('filtro-mes-graficos').value || 'historico'}_${hoyEscolar}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function limpiarCharts() {
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
}

Seguridad.alCargar(() => {
    document.getElementById('btn-logout').addEventListener('click', () => Seguridad.salir());
    document.getElementById('btn-logout-movil').addEventListener('click', () => Seguridad.salir());
    ['filtro-mes-graficos', 'filtro-tipo-informe', 'filtro-estado-informe'].forEach(id => document.getElementById(id).addEventListener('change', recargarDashboard));
    document.getElementById('btn-limpiar-informe').addEventListener('click', () => {
        ['filtro-mes-graficos', 'filtro-tipo-informe', 'filtro-estado-informe'].forEach(id => { document.getElementById(id).value = ''; });
        recargarDashboard();
    });
    document.getElementById('btn-exportar-informe').addEventListener('click', exportarInforme);
    document.getElementById('btn-recargar-informe').addEventListener('click', cargarInforme);
    cargarInforme();
});
