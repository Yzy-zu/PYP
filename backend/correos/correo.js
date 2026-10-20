const nodemailer = require('nodemailer');
const { emailEnabled } = require('../config/env');
const escapar = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

//servicios de correo
const transporter = emailEnabled ? nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
}) : null;

/**
 * Función universal para enviar correos
 * @param {string} emailDestino - Correo del docente
 * @param {string} nombreDocente - Para personalizar el saludo
 * @param {string} tramite - 'Pase' o 'Permiso'
 * @param {string} estado - 'Aprobado' o 'Rechazado'
 */
const enviarNotificacionEstado = async (emailDestino, nombreDocente, tramite, estado) => {
    if (!emailEnabled) {
        console.log('[correo] Envío omitido: EMAIL_ENABLED=false');
        return { enviado: false, desactivado: true };
    }
    const colorEstado = estado === 'Aprobado' ? '#198754' : '#dc3545';

    const mailOptions = {
        from: `"TUNITAS PROYECTO" <${process.env.EMAIL_USER}>`,
        to: emailDestino,
        subject: `Actualización de tu ${tramite}: ${estado}`,
        html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 500px; border: 1px solid #eee; border-radius: 10px; padding: 20px;">
                <h2 style="color: #009186; text-align: center;">Hola, ${escapar(nombreDocente)}</h2>
                <p style="font-size: 16px; color: #333;">Te informamos que tu solicitud de <strong>${escapar(tramite)}</strong> ha sido actualizada.</p>
                
                <div style="background-color: ${colorEstado}; color: white; padding: 15px; text-align: center; border-radius: 8px; font-size: 1.2rem; font-weight: bold; margin: 20px 0;">
                    ESTADO: ${escapar(estado.toUpperCase())}
                </div>

                <p style="font-size: 14px; color: #666; text-align: center;">Puedes consultar los detalles completos iniciando sesión.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #aaa; text-align: center;">Universidad Tecnológica de Morelia 2026</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('[correo] Notificación enviada.');
    } catch (error) {
        console.error('[correo] No se pudo enviar:', error.code || 'error de transporte');
    }
};

module.exports = { enviarNotificacionEstado };
