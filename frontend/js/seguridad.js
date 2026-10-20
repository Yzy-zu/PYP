// La interfaz empieza sólo después de validar la sesión con el servidor.
window.Seguridad = (() => {
    const fetchOriginal = window.fetch.bind(window);
    let esRoot = false;
    let cerrando = false;
    const sockets = new Set();
    const claveToken = () => esRoot ? 'sys_tkn' : 'token';
    const claveUsuario = () => esRoot ? 'sys_usuario' : 'usuario';
    const login = () => esRoot ? 'Rlogin.html' : 'login.html';

    function escapeHTML(valor) {
        return String(valor ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function guardar(datos) {
        const anterior = sessionStorage.getItem(claveToken());
        if (datos.token) sessionStorage.setItem(claveToken(), datos.token);
        if (datos.usuario) sessionStorage.setItem(claveUsuario(), JSON.stringify(datos.usuario));
        if (datos.token && anterior !== datos.token) sockets.forEach(socket => { socket.disconnect(); socket.connect(); });
    }

    function expirar() {
        sessionStorage.removeItem(claveToken());
        sessionStorage.removeItem(claveUsuario());
        sockets.forEach(socket => socket.disconnect());
        window.location.replace(login());
    }

    async function salir() {
        if (cerrando) return;
        cerrando = true;
        try {
            await fetchOriginal(esRoot ? '/api/root/logout' : '/api/login/logout', {
                method: 'POST', headers: { 'x-token': sessionStorage.getItem(claveToken()) || '' },
                signal: AbortSignal.timeout(5000)
            });
        } catch (_) { /* Se limpia también la sesión local si no hay red. */ }
        finally { expirar(); }
    }

    // Cada petición utiliza la credencial vigente, incluso después de cambiarla.
    window.fetch = async (input, config = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        const protegida = url.origin === window.location.origin && url.pathname.startsWith('/api/') &&
            !['/api/login/login', '/api/root/login'].includes(url.pathname);
        let opciones = config;
        if (protegida) {
            const headers = new Headers(config.headers || (input instanceof Request ? input.headers : undefined));
            headers.set('x-token', sessionStorage.getItem(claveToken()) || '');
            opciones = { ...config, headers };
        }
        const respuesta = await fetchOriginal(input, opciones);
        if (protegida && respuesta.status === 401) expirar();
        if (protegida && respuesta.ok && url.pathname === '/api/login/npassword') {
            const datos = await respuesta.clone().json();
            if (datos.ok) guardar(datos);
        }
        return respuesta;
    };

    function alCargar(funcion) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', funcion, { once: true });
        else funcion();
    }

    function socket() {
        const conexion = io({ auth: callback => callback({ token: sessionStorage.getItem(claveToken()) }) });
        sockets.add(conexion);
        // Un token anterior puede dejar de ser válido después del cambio de clave.
        conexion.on('connect_error', error => {
            if (/token|autoriz|sesión|sesion/i.test(error.message)) {
                // La siguiente carga valida otra vez la cuenta. Evita bucles de reconexión con credenciales inválidas.
                conexion.disconnect();
            }
        });
        return conexion;
    }

    async function cambiarTemporal() {
        await new Promise(resolve => {
            const capa = document.createElement('div');
            capa.style.cssText = 'position:fixed;inset:0;z-index:20000;background:#f5f5f5;display:grid;place-items:center;padding:24px';
            capa.innerHTML = `<form style="max-width:420px;width:100%;padding:24px;background:white;border:1px solid #ddd;border-radius:12px">
                <h2>Actualiza tu contraseña</h2><p>Tu contraseña es temporal. Elige una nueva para continuar.</p>
                <label style="display:block">Contraseña temporal<input name="actual" type="password" autocomplete="current-password" required style="display:block;width:100%;margin:8px 0 16px"></label>
                <label style="display:block">Nueva contraseña (mínimo 10 caracteres)<input name="nueva" type="password" autocomplete="new-password" minlength="10" required style="display:block;width:100%;margin:8px 0 16px"></label>
                <label style="display:block">Repite la nueva contraseña<input name="repetir" type="password" autocomplete="new-password" minlength="10" required style="display:block;width:100%;margin:8px 0 16px"></label>
                <p role="alert" style="color:#b42318"></p><button type="submit">Guardar contraseña</button>
                <button type="button" data-salir>Cerrar sesión</button>
            </form>`;
            document.body.appendChild(capa);
            const form = capa.querySelector('form');
            capa.querySelector('[data-salir]').addEventListener('click', salir);
            form.addEventListener('submit', async evento => {
                evento.preventDefault();
                const mensaje = form.querySelector('[role="alert"]');
                const password = form.elements.actual.value;
                const npassword = form.elements.nueva.value;
                if (npassword !== form.elements.repetir.value) { mensaje.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
                if (new TextEncoder().encode(npassword).length > 72) { mensaje.textContent = 'La contraseña puede ocupar como máximo 72 bytes.'; return; }
                const boton = form.querySelector('[type="submit"]');
                boton.disabled = true;
                try {
                    const resp = await fetch('/api/login/npassword', {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, npassword })
                    });
                    const datos = await resp.json();
                    if (!datos.ok) mensaje.textContent = datos.msg || 'No se pudo actualizar la contraseña.';
                    else { guardar(datos); capa.remove(); resolve(); }
                } catch (_) { mensaje.textContent = 'No hay conexión. Intenta de nuevo.'; }
                finally { boton.disabled = false; }
            });
        });
    }

    async function cargar(rutaScript, rol) {
        esRoot = rol === 'Sysadmin';
        if (!sessionStorage.getItem(claveToken())) { expirar(); return; }
        try {
            const respuesta = await fetchOriginal(esRoot ? '/api/root/sesion' : '/api/login/ntoken', {
                headers: { 'x-token': sessionStorage.getItem(claveToken()) }, cache: 'no-store'
            });
            if (!respuesta.ok) { expirar(); return; }
            const datos = await respuesta.json();
            if (!datos.ok || !datos.usuario || datos.usuario.rol !== rol) { expirar(); return; }
            guardar(datos);
            if (datos.usuario.debe_cambiar_password) await cambiarTemporal();
            // Espera los scripts compartidos (PDF/Bootstrap) y el DOM antes de cargar la pantalla.
            if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
            const script = document.createElement('script');
            script.src = rutaScript;
            document.body.appendChild(script);
        } catch (_) {
            const aviso = document.createElement('p');
            aviso.setAttribute('role', 'alert');
            aviso.textContent = 'No se pudo validar la sesión. Revisa la conexión y vuelve a cargar la página.';
            document.body.prepend(aviso);
        }
    }
    return { escapeHTML, guardar, expirar, salir, alCargar, socket, cargar };
})();
