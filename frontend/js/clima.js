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
    const url = `${apiUrl}?q=${city}&appid=${apiKey}&units=metric&lang=es`;

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

    document.getElementById('weatherResult').innerHTML = `
        <h3>${name}</h3>
        <p>${weather[0].description}</p>
        <p>Temperatura: ${main.temp}°C</p>
        <p>Humedad: ${main.humidity}%</p>
    `;
}