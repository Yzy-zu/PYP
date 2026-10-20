// Las altas requieren la sesión de administración técnica.
const formulario = document.getElementById('formulario');
const aviso = document.createElement('p');
aviso.setAttribute('role', 'alert');
formulario.appendChild(aviso);
const tokenAdmin = sessionStorage.getItem('sys_tkn');
if (!tokenAdmin) {
    aviso.textContent = 'Solicita tu cuenta a la administración. El registro requiere acceso administrativo.';
    formulario.querySelectorAll('input,select,button').forEach(el => { el.disabled = true; });
}
formulario.addEventListener('submit', async event => {
    event.preventDefault();
    if (!tokenAdmin) return;
    const valor = id => document.getElementById(id)?.value || null;
    const datos = {
        nombre_completo: valor('name'), correo_institucional: valor('mail'), contraseña: valor('pass') || '',
        rol: 'Docente', fecha_nacimiento: valor('date'), rfc: valor('rfc'), fecha_ingreso: valor('date_ingreso'),
        categoria: valor('tipo') || 'Profesor de Asignatura', area_adscripcion: valor('categoria'),
        tipo_contrato: valor('contrato') || 'Determinado'
    };
    try {
        const respuesta = await fetch('/api/root/usuarios', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': tokenAdmin }, body: JSON.stringify(datos)
        });
        const resultado = await respuesta.json();
        aviso.textContent = resultado.ok ? 'Cuenta creada. El usuario deberá cambiar su contraseña inicial.' : resultado.msg || 'No se pudo crear la cuenta.';
        if (resultado.passwordTemporal) alert('Contraseña temporal: ' + resultado.passwordTemporal);
        if (resultado.ok) formulario.reset();
    } catch { aviso.textContent = 'No se pudo conectar con el servidor.'; }
});
