// 1. Coloca tu API Key aquí (sin los símbolos ${ })
const apiKey = '91ae82249083ba5fe5cd7fec7007bb44'; 
const apiUrl = 'https://api.openweathermap.org/data/2.5/weather';

async function getWeather() {
    // Obtenemos el valor y quitamos espacios accidentales
    const city = document.getElementById('cityInput').value.trim();
    
    if (city === "") {
        alert("Por favor, escribe una ciudad");
        return;
    }

    // La URL debe usar comillas invertidas (backticks) ``
    const url = `${apiUrl}?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=es`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Ciudad no encontrada');
        }

        const data = await response.json();
        displayWeather(data);

    } catch (error) {
        document.getElementById('weatherResult').innerHTML = 
            `<p class="text-danger">Ciudad no encontrada o error en la API.</p>`;
    }
}

function displayWeather(data) {
    // Extraemos los datos del JSON
    const { main, name, weather } = data;

    const contenedor = document.getElementById('weatherResult');
    contenedor.replaceChildren();
    for (const [tag, texto] of [['h3', name], ['p', weather[0].description], ['p', `Temperatura: ${main.temp}°C`], ['p', `Humedad: ${main.humidity}%`]]) {
        const elemento = document.createElement(tag);
        elemento.textContent = texto;
        contenedor.appendChild(elemento);
    }
}

// El regreso respeta el perfil sin depender del historial de otra pestaña.
try {
    const rol = JSON.parse(sessionStorage.getItem('usuario') || '{}').rol;
    const destinos = { Docente: 'principal.html', Administrador: 'vista_jefe_inmediato.html', RRHH: 'vistaRH.html' };
    document.getElementById('volver-sistema').href = Object.hasOwn(destinos, rol) ? destinos[rol] : 'login.html';
} catch (_) { /* Se conserva el enlace al login si no hay sesión válida. */ }
