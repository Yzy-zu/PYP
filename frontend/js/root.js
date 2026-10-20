        const API = '/api/root';
        const tkn = sessionStorage.getItem('sys_tkn');

        if(!tkn) { window.location.href = "Rlogin.html"; }

        document.getElementById('btn-logout').onclick = () => {
            Seguridad.salir();
        };

        document.querySelectorAll('.nav-link').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.add('active');
                cargarDatosPanel(e.target.dataset.target);
            };
        });

        const fReq = async (endpoint, method = 'GET', body = null) => {
            const headers = { 'Content-Type': 'application/json', 'x-token': tkn };
            const config = { method, headers };
            if(body) config.body = JSON.stringify(body);
            try {
                const res = await fetch(`${API}${endpoint}`, config);
                if(res.status === 401 || res.status === 403) {
                    sessionStorage.removeItem('sys_tkn');
                    window.location.href = "Rlogin.html";
                }
                return res.json();
            } catch (err) { alert('FATAL SYS ERROR: ' + err.message); }
        };

        const cargarDatosPanel = (panel) => {
            if(panel === 'sys-dashboard') cargarDashboard();
            if(panel === 'sys-usuarios') cargarUsuarios();
            if(panel === 'sys-pases') cargarPases();
            if(panel === 'sys-permisos') cargarPermisos();
            if(panel === 'sys-festivos') cargarFestivos();
        };

        const cargarDashboard = async () => {
            const u = await fReq('/usuarios');
            const p = await fReq('/pases');
            const pe = await fReq('/permisos');
            if(u && u.data) document.getElementById('c-users').innerText = u.data.length;
            if(p && p.data) document.getElementById('c-pases').innerText = p.data.length;
            if(pe && pe.data) document.getElementById('c-permisos').innerText = pe.data.length;
        };

        const cargarUsuarios = async () => {
            const res = await fReq('/usuarios');
            const tb = document.getElementById('tb-usuarios');
            tb.innerHTML = '';
            if(res && res.data) {
                res.data.forEach(u => {
                    tb.innerHTML += `<tr>
                        <td>${Number(u.id)}</td>
                        <td>${Seguridad.escapeHTML(u.nombre_completo)}</td>
                        <td>${Seguridad.escapeHTML(u.correo_institucional)}</td>
                        <td>
                            <select class="form-select form-select-sm" id="u_rol_${Number(u.id)}">
                                <option value="Docente" ${u.rol==='Docente'?'selected':''}>Docente</option>
                                <option value="Administrador" ${u.rol==='Administrador'?'selected':''}>Jefatura</option>
                                <option value="RRHH" ${u.rol==='RRHH'?'selected':''}>RRHH</option>

                            </select>
                        </td>
                        <td>${Seguridad.escapeHTML(u.area_adscripcion || 'NULL')}</td>
                        <td>${Number(u.activo) === 0 ? 'Inactivo' : 'Activo'}</td>
                        <td>
                            <button class="btn btn-warning btn-xs" onclick="updateRolUsuario(${Number(u.id)})">rol</button>
                            <button class="btn btn-primary btn-xs" onclick="abrirModalUsuario(${Number(u.id)})">editar todo</button>
                            <button class="btn btn-danger btn-xs" onclick="resetPass(${Number(u.id)})">restablecer clave</button>
                            <button class="btn btn-danger btn-xs" style="background:#000;" onclick="eliminarUsuario(${Number(u.id)})" ${Number(u.activo) === 0 ? 'disabled' : ''}>Desactivar</button>
                        </td>
                    </tr>`;
                });
            }
        };

        const cargarPases = async () => {
            const res = await fReq('/pases');
            const tb = document.getElementById('tb-pases');
            tb.innerHTML = '';
            if(res && res.data) {
                res.data.forEach(p => {
                    tb.innerHTML += `<tr>
                        <td>${Number(p.id)}</td>
                        <td>${Seguridad.escapeHTML(p.usuario_id)}</td>
                        <td><input type="date" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.fecha_uso.split('T')[0])}" id="fp_${Number(p.id)}"></td>
                        <td><input type="time" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.hora_inicio)}" id="fhi_${Number(p.id)}"></td>
                        <td><input type="time" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.hora_fin)}" id="fhf_${Number(p.id)}"></td>
                        <td>
                            <select class="form-select form-select-sm" id="sp_${Number(p.id)}">
                                <option value="Pendiente" ${p.estado==='Pendiente'?'selected':''}>Pendiente</option>
                                <option value="Vo.Bo." ${p.estado==='Vo.Bo.'?'selected':''}>Vo.Bo.</option>
                                <option value="Aprobado" ${p.estado==='Aprobado'?'selected':''}>Aprobado</option>
                                <option value="Rechazado" ${p.estado==='Rechazado'?'selected':''}>Rechazado</option>
                                <option value="Cancelado" ${p.estado==='Cancelado'?'selected':''}>Cancelado</option>
                            </select>
                        </td>
                        <td><input type="text" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.motivo)}" id="mp_${Number(p.id)}"></td>
                        <td>
                            <button class="btn btn-success btn-xs" onclick="updatePase(${Number(p.id)})">actualizar</button>
                        </td>
                    </tr>`;
                });
            }
        };

        const cargarPermisos = async () => {
            const res = await fReq('/permisos');
            const tb = document.getElementById('tb-permisos');
            tb.innerHTML = '';
            if(res && res.data) {
                res.data.forEach(p => {
                    tb.innerHTML += `<tr>
                        <td>${Number(p.id)}</td>
                        <td>${Seguridad.escapeHTML(p.usuario_id)}</td>
                        <td>
                            <select class="form-select form-select-sm" id="tper_${Number(p.id)}">
                                <option value="Personal" ${p.tipo_permiso==='Personal'?'selected':''}>Personal</option>
                                <option value="Salud" ${p.tipo_permiso==='Salud'?'selected':''}>Salud</option>
                                <option value="Institucional" ${p.tipo_permiso==='Institucional'?'selected':''}>Institucional</option>
                                <option value="Cumpleaños" ${p.tipo_permiso==='Cumpleaños'?'selected':''}>Cumpleaños</option>
                            </select>
                        </td>
                        <td><input type="date" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.fecha_inicio.split('T')[0])}" id="fip_${Number(p.id)}"></td>
                        <td><input type="date" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.fecha_fin.split('T')[0])}" id="ffp_${Number(p.id)}"></td>
                        <td><input type="number" class="form-control form-control-sm" value="${Seguridad.escapeHTML(p.cantidad_dias)}" id="dp_${Number(p.id)}" style="width:40px;"></td>
                        <td>
                            <select class="form-select form-select-sm" id="sper_${Number(p.id)}">
                                <option value="Pendiente" ${p.estado==='Pendiente'?'selected':''}>Pendiente</option>
                                <option value="Vo.Bo." ${p.estado==='Vo.Bo.'?'selected':''}>Vo.Bo.</option>
                                <option value="Aprobado" ${p.estado==='Aprobado'?'selected':''}>Aprobado</option>
                                <option value="Rechazado" ${p.estado==='Rechazado'?'selected':''}>Rechazado</option>
                                <option value="Cancelado" ${p.estado==='Cancelado'?'selected':''}>Cancelado</option>
                            </select>
                        </td>
                        <td>
                            <button class="btn btn-success btn-xs" onclick="updatePermiso(${Number(p.id)})">actualizar</button>
                        </td>
                    </tr>`;
                });
            }
        };

        const abrirModalUsuario = async (id = null) => {
    document.getElementById('mu-title').innerText = id ? `UPDATE usuarios SET... WHERE id=${id}` : 'INSERT INTO usuarios...';
    let u = {};
    if(id) {
        const res = await fReq(`/usuarios/${id}`);
        if(res.ok) u = res.data;
    }

    document.getElementById('mu-body').innerHTML = `
        <div class="row g-2">
            <input type="hidden" id="nu-id" value="${Seguridad.escapeHTML(u.id || '')}">

            <div class="col-6">
                <label>Nombre Completo</label>
                <input type="text" id="nu-nom" class="form-control form-control-sm" value="${Seguridad.escapeHTML(u.nombre_completo || '')}">
            </div>

            <div class="col-6">
                <label>Correo Institucional</label>
                <input type="email" id="nu-cor" class="form-control form-control-sm" value="${Seguridad.escapeHTML(u.correo_institucional || '')}">
            </div>

            <div class="col-6">
                <label>Contraseña</label>
                <input type="text" id="nu-pass" class="form-control form-control-sm" placeholder="${id ? 'Sin cambios' : 'Vacío: generar contraseña temporal'}">
            </div>

            <div class="col-6">
                <label>Rol</label>
                <select id="nu-rol" class="form-select form-select-sm">
                    <option value="Docente" ${u.rol==='Docente'?'selected':''}>Docente</option>
                    <option value="Administrador" ${u.rol==='Administrador'?'selected':''}>Jefatura</option>
                    <option value="RRHH" ${u.rol==='RRHH'?'selected':''}>RRHH</option>
                </select>
            </div>

            <div class="col-4">
                <label>RFC</label>
                <input type="text" id="nu-rfc" class="form-control form-control-sm" maxlength="13" value="${Seguridad.escapeHTML(u.rfc || '')}">
            </div>

            <div class="col-4">
                <label>F. Nacimiento</label>
                <input type="date" id="nu-nac" class="form-control form-control-sm" value="${Seguridad.escapeHTML(u.fecha_nacimiento ? u.fecha_nacimiento.split('T')[0] : '')}">
            </div>

            <div class="col-4">
                <label>F. Ingreso</label>
                <input type="date" id="nu-ing" class="form-control form-control-sm" value="${Seguridad.escapeHTML(u.fecha_ingreso ? u.fecha_ingreso.split('T')[0] : '')}">
            </div>

            <div class="col-6">
                <label>Categoría</label>
                <select id="nu-cat" class="form-select form-select-sm">
                    <option value="Profesor de Asignatura" ${u.categoria==='Profesor de Asignatura'?'selected':''}>Profesor de Asignatura</option>
                    <option value="Profesor de Tiempo Completo" ${u.categoria==='Profesor de Tiempo Completo'?'selected':''}>Profesor de Tiempo Completo</option>
                    <option value="Técnico Académico" ${u.categoria==='Técnico Académico'?'selected':''}>Técnico Académico</option>
                    <option value="Administrativo" ${u.categoria==='Administrativo'?'selected':''}>Administrativo</option>
                </select>
            </div>

            <div class="col-6">
                <label>Área de Adscripción</label>
                <select id="nu-area" class="form-select form-select-sm">
                    <option value="Tecnologías de la Información" ${u.area_adscripcion==='Tecnologías de la Información'?'selected':''}>Tecnologías de la Información</option>
                    <option value="Gastronomía" ${u.area_adscripcion==='Gastronomía'?'selected':''}>Gastronomía</option>
                    <option value="Enfermería" ${u.area_adscripcion==='Enfermería'?'selected':''}>Enfermería</option>
                    <option value="Energías Renovables" ${u.area_adscripcion==='Energías Renovables'?'selected':''}>Energías Renovables</option>
                    <option value="Mantenimiento Industrial" ${u.area_adscripcion==='Mantenimiento Industrial'?'selected':''}>Mantenimiento Industrial</option>
                    <option value="Contabilidad" ${u.area_adscripcion==='Contabilidad'?'selected':''}>Contabilidad</option>
                </select>
            </div>

            <div class="col-12">
                <label>Tipo de Contrato</label>
                <select id="nu-cont" class="form-select form-select-sm">
                    <option value="Determinado" ${u.tipo_contrato==='Determinado'?'selected':''}>Determinado</option>
                    <option value="Indeterminado" ${u.tipo_contrato==='Indeterminado'?'selected':''}>Indeterminado</option>
                </select>
            </div>
        </div>`;

    document.getElementById('mu-btn-save').onclick = guardarUsuario;
    document.getElementById('modalUniversal').style.display = 'block';
};
        const guardarUsuario = async () => {
            const id = document.getElementById('nu-id').value;
            const payload = {
                nombre_completo: document.getElementById('nu-nom').value,
                correo_institucional: document.getElementById('nu-cor').value,
                rol: document.getElementById('nu-rol').value,
                rfc: document.getElementById('nu-rfc').value,
                fecha_nacimiento: document.getElementById('nu-nac').value,
                fecha_ingreso: document.getElementById('nu-ing').value,
                categoria: document.getElementById('nu-cat').value,
                area_adscripcion: document.getElementById('nu-area').value,
                tipo_contrato: document.getElementById('nu-cont').value
            };
            const pass = document.getElementById('nu-pass').value;
            if(pass) payload.contraseña = pass;
            const res = await fReq(id ? `/usuarios/${id}` : '/usuarios', id ? 'PATCH' : 'POST', payload);
            if(res.ok) {
                if (res.passwordTemporal) alert('Contraseña temporal (entregar al usuario): ' + res.passwordTemporal + '\nDeberá cambiarla al iniciar sesión.');
                cerrarModal(); cargarUsuarios();
            } else { alert(res.msg || 'No se pudo guardar el usuario.'); }
        };

        async function updateRolUsuario(id) {
            const rol = document.getElementById(`u_rol_${id}`).value;
            const res = await fReq(`/usuarios/rol/${id}`, 'PATCH', { rol });
            if(res.ok) alert('actualizacion hecha');
        }

        async function resetPass(id) {
            if(confirm('¿Generar una contraseña temporal y cerrar las sesiones de este usuario?')) {
                const res = await fReq(`/usuarios/resetpass/${id}`, 'PATCH');
                if(res.ok) alert('Contraseña temporal (entregar al usuario): ' + res.passwordTemporal + '\nDeberá cambiarla al iniciar sesión.'); else alert(res.msg || 'No se pudo restablecer.');
            }
        }

        async function eliminarUsuario(id) {
            if(confirm('¿Desactivar esta cuenta y cerrar sus sesiones? Sus expedientes se conservarán.')) {
                const res = await fReq(`/usuarios/${id}`, 'DELETE');
                if(res.ok) cargarUsuarios();
            }
        }

        async function updatePase(id) {
            const payload = {
                fecha_uso: document.getElementById(`fp_${id}`).value,
                hora_inicio: document.getElementById(`fhi_${id}`).value,
                hora_fin: document.getElementById(`fhf_${id}`).value,
                estado: document.getElementById(`sp_${id}`).value,
                motivo: document.getElementById(`mp_${id}`).value
            };
            const res = await fReq(`/pases/override/${id}`, 'PATCH', payload);
            if(res.ok) alert('aactualizacion completa');
        }

        async function updatePermiso(id) {
            const payload = {
                tipo_permiso: document.getElementById(`tper_${id}`).value,
                fecha_inicio: document.getElementById(`fip_${id}`).value,
                fecha_fin: document.getElementById(`ffp_${id}`).value,
                cantidad_dias: document.getElementById(`dp_${id}`).value,
                estado: document.getElementById(`sper_${id}`).value
            };
            const res = await fReq(`/permisos/override/${id}`, 'PATCH', payload);
            if(res.ok) alert('COMMIT SUCCESSFUL');
        }

        const cargarFestivos = async () => {
            const res = await fReq('/dias');
            const tb = document.getElementById('tb-festivos');
            tb.innerHTML = '';
            if(res && res.data) {
                res.data.forEach(d => {
                    tb.innerHTML += `<tr><td>${Number(d.id)}</td><td>${Seguridad.escapeHTML(d.fecha.split('T')[0])}</td><td>${Seguridad.escapeHTML(d.descripcion)}</td>
                    <td><button class="btn btn-danger btn-xs" style="background:#000;" onclick="deleteFestivo(${Number(d.id)})">borrar</button></td></tr>`;
                });
            }
        };

        const abrirModalFestivo = () => {
            document.getElementById('mu-title').innerText = 'INSERT INTO dias_festivos...';
            document.getElementById('mu-body').innerHTML = `<div class="row g-2">
                <div class="col-4"><label>fecha</label><input type="date" id="nf-fec" class="form-control form-control-sm"></div>
                <div class="col-8"><label>descripcion</label><input type="text" id="nf-des" class="form-control form-control-sm"></div></div>`;
            document.getElementById('mu-btn-save').onclick = guardarFestivo;
            document.getElementById('modalUniversal').style.display = 'block';
        };

        const guardarFestivo = async () => {
            const res = await fReq('/dias', 'POST', { fecha: document.getElementById('nf-fec').value, descripcion: document.getElementById('nf-des').value });
            if(res.ok) { cerrarModal(); cargarFestivos(); }
        };

        async function deleteFestivo(id) {
            if(confirm('borrar festivo?')) {
                const res = await fReq(`/dias/${id}`, 'DELETE');
                if(res.ok) cargarFestivos();
            }
        }

        const cerrarModal = () => { document.getElementById('modalUniversal').style.display = 'none'; };
        Seguridad.alCargar(() => cargarDashboard());
