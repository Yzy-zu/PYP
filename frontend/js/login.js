const API_URL = '/api/login/login';

const formulario = document.getElementById("loginform");
const correoInput = document.getElementById("correo");
const contraseñaInput = document.getElementById("password");
const errorCorreo = document.getElementById("correoerror");
const errorContraseña = document.getElementById("contraseñaerror");

//creamos el contenedor para mensaje de error global
const errorGlobal = document.createElement("div");
errorGlobal.style.color = "#dc3545";
errorGlobal.style.marginTop = "15px";
errorGlobal.style.textAlign = "center";
errorGlobal.style.fontWeight = "bold";
errorGlobal.style.display = "none";
formulario.appendChild(errorGlobal);

formulario.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    //limpiamos la pantalla
    errorCorreo.style.display = "none";
    errorContraseña.style.display = "none";
    errorGlobal.style.display = "none";

    const correo = correoInput.value.trim();
    const contraseña = contraseñaInput.value;

    if (correo === "") {
        errorCorreo.textContent = "Ingrese su correo institucional";
        errorCorreo.style.display = "block";
        return;
    }
    
    if (contraseña === "") {
        errorContraseña.textContent = "Ingrese su contraseña";
        errorContraseña.style.display = "block";
        return;
    }

    try {
        const btnSubmit = formulario.querySelector('.submit-btn');
        const textoOriginal = btnSubmit.textContent;
        btnSubmit.textContent = "Verificando...";
        btnSubmit.disabled = true;
        //mandamos datos a la api
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ correo, password: contraseña })
        });
        
        const data = await response.json();

        btnSubmit.textContent = textoOriginal;
        btnSubmit.disabled = false;

        if (data.ok) {
            sessionStorage.setItem('token', data.token);
            sessionStorage.setItem('usuario', JSON.stringify(data.usuario));

            const rol = data.usuario.rol;
            
            //redirecciona de acuerdo al rol del usuario
            if (rol === "Administrador") {
                window.location.href = "vista_jefe_inmediato.html";
            } else if (rol === "Docente") {
                window.location.href = "principal.html";
            } else if (rol === "RRHH") {
                window.location.href = "vistaRH.html";
            } else {
                errorGlobal.textContent = "Acceso denegado.";
                errorGlobal.style.display = "block";
            }
        } else {
            errorGlobal.textContent = data.msg || data.mensaje || "Datos de sesion incorrectos";
            errorGlobal.style.display = "block";
        }
    } catch (error) {
        console.error("Error fatal en el fetch:", error);
        errorGlobal.textContent = "error de red";
        errorGlobal.style.display = "block";
        
        //limpiar bton en caso de error
        const btnSubmit = formulario.querySelector('.submit-btn');
        btnSubmit.textContent = "Login";
        btnSubmit.disabled = false;
    }
});