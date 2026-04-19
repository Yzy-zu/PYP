const API = '/api/root';
const formulario = document.getElementById('formulario');
const nombre = document.getElementById('name');
const correo = document.getElementById('mail');
const fecha = document.getElementById('date');
const contra = document.getElementById('pass');
const categoria = document.getElementById('categoria');
const rfc = document.getElementById('rfc');
const fechaI = document.getElementById('date_ingreso');
const tipo = document.getElementById('tipo');
const contrato = document.getElementById('contrato');


formulario.addEventListener('submit', async (event) => {
    event.preventDefault();

    const datos = {
        nombre_completo: nombre.value,
        correo_institucional: correo.value,
        contraseña: contra.value,
        rol: "Docente",
        fecha_nacimiento: fecha.value,
        rfc: rfc ? rfc.value : "FERF450822FB1",
        fecha_ingreso: fechaI ? fechaI.value : "2009-12-12",
        categoria: tipo ? tipo.value : "Profesor de Asignatura",
        area_adscripcion: categoria.value,
        tipo_contrato: contrato ? contrato.value : "Determinado"
    };
    try {
        const envio = await fetch(`${API}/usuarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datos)
        });
        if (envio.ok) {
            const resultado = await envio.json();
            alert("Registro creado con exito");
            window.location.replace("../login.html");
        } else {
            console.error("Error en el servidor");

        }
    } catch (error) {
        console.error("Error de red:", error);
    }
})