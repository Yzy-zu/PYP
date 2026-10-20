// Fechas civiles y folios compartidos por las tres pantallas escolares.
window.Tramites = (() => {
    function fecha(valor) {
        const texto = String(valor || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
        const [anio, mes, dia] = texto.split('-').map(Number);
        const prueba = new Date(anio, mes - 1, dia, 12);
        return prueba.getFullYear() === anio && prueba.getMonth() === mes - 1 && prueba.getDate() === dia ? texto : null;
    }
    function sumarDias(valor, dias) {
        const civil = fecha(valor);
        if (!civil) return null;
        const [anio, mes, dia] = civil.split('-').map(Number);
        const resultado = new Date(anio, mes - 1, dia + dias, 12);
        return `${resultado.getFullYear()}-${String(resultado.getMonth() + 1).padStart(2, '0')}-${String(resultado.getDate()).padStart(2, '0')}`;
    }
    function hoy() {
        const partes = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const valor = tipo => partes.find(p => p.type === tipo).value;
        return `${valor('year')}-${valor('month')}-${valor('day')}`;
    }
    function folio(registro) {
        return `${registro.tipoTramite === 'Pase' ? 'PASE' : 'PERM'}-${String(registro.id).padStart(8, '0')}`;
    }
    function evento(registro) {
        const esPase = registro.tipoTramite === 'Pase';
        const inicio = fecha(esPase ? registro.fecha_uso : registro.fecha_inicio);
        const fin = fecha(esPase ? registro.fecha_uso : registro.fecha_fin) || inicio;
        return {
            id: folio(registro),
            start: esPase ? `${inicio}T${String(registro.hora_inicio).slice(0, 8)}` : inicio,
            end: esPase ? `${fin}T${String(registro.hora_fin).slice(0, 8)}` : sumarDias(fin, 1),
            allDay: !esPase
        };
    }
    // Coincidencia por día civil, incluidos permisos históricos de varios días.
    function coinciden(a, b) {
        const inicioA = fecha(a.tipoTramite === 'Pase' ? a.fecha_uso : a.fecha_inicio);
        const inicioB = fecha(b.tipoTramite === 'Pase' ? b.fecha_uso : b.fecha_inicio);
        const finA = fecha(a.tipoTramite === 'Pase' ? a.fecha_uso : a.fecha_fin) || inicioA;
        const finB = fecha(b.tipoTramite === 'Pase' ? b.fecha_uso : b.fecha_fin) || inicioB;
        if (!(inicioA && inicioB && finA && finB && inicioA <= finB && inicioB <= finA)) return false;
        if (a.tipoTramite === 'Pase' && b.tipoTramite === 'Pase') {
            const hora = valor => { const texto = String(valor || '').slice(0, 8); return texto.length === 5 ? `${texto}:00` : texto; };
            const horas = [a.hora_inicio, a.hora_fin, b.hora_inicio, b.hora_fin].map(hora);
            if (horas.every(valor => /^\d{2}:\d{2}:\d{2}$/.test(valor))) {
                return `${inicioA}T${horas[0]}` < `${finB}T${horas[3]}` && `${inicioB}T${horas[2]}` < `${finA}T${horas[1]}`;
            }
        }
        return true;
    }
    function cumpleanos(rango, personas) {
        const inicio = fecha(rango.startStr);
        const fin = fecha(rango.endStr);
        if (!inicio || !fin) return [];
        const eventos = [], vistos = new Set();
        for (const persona of personas) {
            const nacimiento = fecha(persona.fecha_nacimiento);
            if (!nacimiento) continue;
            const usuarioId = persona.usuario_id ?? persona.id_usuario ?? (persona.tipoTramite ? persona.nombre_completo : persona.id) ?? persona.nombre_completo;
            for (let anio = Number(inicio.slice(0, 4)); anio <= Number(fin.slice(0, 4)); anio++) {
                const dia = fecha(`${anio}-${nacimiento.slice(5, 10)}`);
                const clave = `cumple-${usuarioId}-${anio}`;
                if (!dia || dia < inicio || dia >= fin || vistos.has(clave)) continue;
                vistos.add(clave);
                eventos.push({
                    id: clave,
                    title: `Cumpleaños: ${persona.nombre_completo || 'Docente'}`,
                    start: dia, end: sumarDias(dia, 1), allDay: true,
                    backgroundColor: '#6f42c1', borderColor: 'transparent',
                    extendedProps: { esCumpleanos: true, esTramite: false }
                });
            }
        }
        return eventos;
    }
    return { fecha, sumarDias, hoy, folio, evento, coinciden, cumpleanos };
})();
