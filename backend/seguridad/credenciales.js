function passwordValida(password) {
    return typeof password === 'string' && password.length >= 10 && Buffer.byteLength(password, 'utf8') <= 72;
}
const intentos = new Map();
const ventana = 15 * 60 * 1000;
const limpiar = setInterval(() => {
    for (const [key, entry] of intentos) if (entry.hasta <= Date.now()) intentos.delete(key);
}, 60000);
limpiar.unref();
function limitarLogin(req, res, next) {
    const cuenta = String(req.body?.correo || req.body?.user || '').trim().toLowerCase().slice(0, 250);
    const ahora = Date.now();
    const ruta = `${req.baseUrl}${req.path}`.toLowerCase().replace(/\/+$/, '');
    for (const [key, limite] of [[`ip:${req.ip}`, 150], [`cuenta:${ruta}:${cuenta}`, 30]]) {
        let entry = intentos.get(key);
        if (!entry || entry.hasta <= ahora) {
            if (intentos.size >= 5000) intentos.delete(intentos.keys().next().value);
            entry = { cantidad: 0, hasta: ahora + ventana };
            intentos.set(key, entry);
        }
        entry.cantidad++;
        if (entry.cantidad > limite) {
            res.set('Retry-After', String(Math.ceil((entry.hasta - ahora) / 1000)));
            return res.status(429).json({ ok: false, msg: 'Demasiados intentos. Intenta más tarde.' });
        }
    }
    next();
}
module.exports = { passwordValida, limitarLogin };
