const API = '/api/root';
const formulario = document.getElementById('formulario');
const nombre = document.getElementById('name');
const correo = document.getElementById('mail');
const fecha = document.getElementById('date');
const contra = document.getElementById('pass');
const categoria = document.getElementById('categoria');


formulario.addEventListener('submit', async (event) => {
    event.preventDefault();

    const datos = {
        nombre_completo: nombre.value,
        correo_institucional: correo.value,
        contraseña: contra.value,
        rol: "Docente",
        fecha_nacimiento: fecha.value,
        rfc: "FERF450822FB1",
        fecha_ingreso: "2009-12-12",
        categoria: "Profesor de Asignatura",
        area_adscripcion: categoria.value,
        tipo_contrato: "Determinado"
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