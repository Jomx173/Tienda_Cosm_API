'use strict';

const crypto = require('crypto');
const webpush = require('web-push');

const { sequelizeInstance } = require('../config/db');
const PushSuscripcion = require('../models/pushSuscripcionModels')(sequelizeInstance);

// Configurar VAPID solo si ambas claves están presentes. Si faltan, el push
// simplemente no se envía y el pedido sigue funcionando normalmente.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@md.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

const endpointHash = (endpoint) =>
    crypto.createHash('sha256').update(endpoint).digest('hex');

const suscripcionParaWebpush = (fila) => ({
    endpoint: fila.endpoint,
    keys: {
        p256dh: fila.p256dh,
        auth: fila.auth,
    },
});

// Tiempo máximo de espera por cada envío de push (ms).
const TIEMPO_ESPERA_PUSH_MS = 3000;

const enviarPushConTimeout = (suscripcion, payload) => {
    const promesaPush = webpush.sendNotification(
        suscripcion,
        JSON.stringify(payload)
    );
    const promesaTimeout = new Promise((_, reject) => {
        setTimeout(
            () => reject(new Error('Tiempo de espera agotado para el push')),
            TIEMPO_ESPERA_PUSH_MS
        );
    });
    return Promise.race([promesaPush, promesaTimeout]);
};

// ============================================================================
// Rutas protegidas (misma proteccion del admin: isAuth + role.isAdmin)
// ============================================================================

// Devuelve la clave pública VAPID para que el frontend se suscriba.
const obtenerClaveVapid = (req, res) => {
    res.status(200).json({
        ok: true,
        clavePublica: process.env.VAPID_PUBLIC_KEY || null,
    });
};

// Guarda la suscripción del administrador logueado (sin duplicar).
const suscribir = async (req, res) => {
    try {
        const idAdministrador = Number(req.user.sub);
        const { endpoint, p256dh, auth, user_agent } = req.body || {};

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({
                ok: false,
                mensaje: 'endpoint, p256dh y auth son obligatorios',
            });
        }

        const hash = endpointHash(endpoint);

        const existente = await PushSuscripcion.findOne({
            where: { endpoint_hash: hash, id_administrador: idAdministrador },
        });

        if (existente) {
            return res.status(200).json({
                ok: true,
                mensaje: 'Ya estás suscrito a las notificaciones',
                data: { id: existente.id },
            });
        }

        const nueva = await PushSuscripcion.create({
            id_administrador: idAdministrador,
            endpoint,
            endpoint_hash: hash,
            p256dh,
            auth,
            user_agent: user_agent || null,
        });

        return res.status(201).json({
            ok: true,
            mensaje: 'Suscripción guardada correctamente',
            data: { id: nueva.id },
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Elimina la suscripción del administrador logueado (por endpoint).
const desuscribir = async (req, res) => {
    try {
        const idAdministrador = Number(req.user.sub);
        const { endpoint } = req.body || {};

        if (!endpoint) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El endpoint es obligatorio',
            });
        }

        const hash = endpointHash(endpoint);

        const eliminadas = await PushSuscripcion.destroy({
            where: { endpoint_hash: hash, id_administrador: idAdministrador },
        });

        return res.status(200).json({
            ok: true,
            mensaje: 'Suscripción eliminada correctamente',
            data: { eliminadas },
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// ============================================================================
// Envío de push tras crear un pedido (llamar desde pedidoController.crearPedido)
// ============================================================================

/**
 * Envía notificación push a todas las suscripciones de administradores.
 * Nunca interrumpe el flujo del pedido: si falla o faltan claves VAPID,
 * el pedido sigue guardado y la respuesta al cliente no cambia.
 * Si el servicio de push responde 404 o 410, borra esa suscripción.
 */
const enviarPushANuevosPedidos = async (idPedido, total, cantidadProductos) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        // No hay claves VAPID configuradas: no se envía push, sin error.
        return;
    }

    let suscripciones;
    try {
        suscripciones = await PushSuscripcion.findAll({
            attributes: ['id', 'endpoint', 'p256dh', 'auth'],
        });
    } catch {
        // La tabla puede no existir todavía: ignorar y seguir.
        return;
    }

    if (!suscripciones || suscripciones.length === 0) {
        return;
    }

    const payload = {
        title: `Nuevo pedido #${idPedido}`,
        body: `${cantidadProductos} producto(s) - Total L${Number(total).toFixed(2)}`,
        tag: `pedido-${idPedido}`,
        urgency: 'high',
    };

    const resultados = await Promise.allSettled(
        suscripciones.map((s) =>
            enviarPushConTimeout(suscripcionParaWebpush(s), payload).catch(
                (error) => {
                    const status = error.statusCode || error.status;
                    if (status === 404 || status === 410) {
                        // Suscripción expirada/inválida: borrarla.
                        return PushSuscripcion.destroy({
                            where: { id: s.id },
                        }).catch(() => {
                            // Ignorar errores al borrar.
                        });
                    }
                    // Otros errores de push: no afectan al pedido.
                    return null;
                }
            )
        )
    );

    // Los resultados de allSettled se ignoran deliberadamente: el pedido
    // ya se guardó y la respuesta al cliente no cambia.
    return resultados;
};

module.exports = {
    obtenerClaveVapid,
    suscribir,
    desuscribir,
    enviarPushANuevosPedidos,
};
