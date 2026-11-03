'use strict';

const crypto = require('crypto');
const webpush = require('web-push');

const { sequelizeInstance } = require('../config/db');
const PushSuscripcion = require('../models/pushSuscripcionModels')(sequelizeInstance);

// ============================================================================
// Configuración VAPID
//
// Se valida una sola vez, al cargar el módulo (después de que ../config/db
// haya cargado .env.local / .env). Si falta algo o está mal, el push queda
// desactivado con un aviso claro en el log, pero la API NO se cae: los
// pedidos deben seguir funcionando aunque las notificaciones no.
// ============================================================================

const TIEMPO_ESPERA_PUSH_MS = 3000;
const TTL_SEGUNDOS = 3600;
const ASUNTO_POR_DEFECTO = 'mailto:admin@md.com';

let pushHabilitado = false;
let clavePublicaVapid = null;
let motivoDeshabilitado = '';

// Limpia espacios, saltos de línea y comillas que se cuelan al copiar y pegar
// las claves en el panel de Vercel o en un .env.
const texto = (valor) =>
    typeof valor === 'string'
        ? valor
              .trim()
              .replace(/^["']|["']$/g, '')
              .replace(/\s+/g, '')
        : '';

const base64UrlABytes = (valor) => {
    try {
        return Buffer.from(valor, 'base64url');
    } catch {
        return null;
    }
};

// VAPID exige un mailto: o una URL https como "subject".
const asuntoValido = (asunto) =>
    /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(asunto) ||
    /^https?:\/\/[^\s]+$/i.test(asunto);

// Deriva la clave pública (65 bytes, punto P-256 sin comprimir) a partir de
// la privada. Es la misma operación que usa generateVAPIDKeys(): así el par
// siempre coincide, aunque en Vercel falte la pública o sea de otro par.
const derivarClavePublica = (bytesPrivada) => {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(bytesPrivada);

    return ecdh.getPublicKey();
};

const configurarWebPush = () => {
    // VAPID_PUBLIC_KEY es el nombre correcto. Se acepta VITE_VAPID_PUBLIC_KEY
    // como alias porque es el que ya estaba configurado en Vercel; el prefijo
    // VITE_ solo tiene sentido en el frontend.
    const clavePublicaConfigurada =
        texto(process.env.VAPID_PUBLIC_KEY) ||
        texto(process.env.VITE_VAPID_PUBLIC_KEY);
    const clavePrivada = texto(process.env.VAPID_PRIVATE_KEY);
    const asunto = texto(process.env.VAPID_SUBJECT);

    if (
        !texto(process.env.VAPID_PUBLIC_KEY) &&
        texto(process.env.VITE_VAPID_PUBLIC_KEY)
    ) {
        console.warn(
            '[push] Se está usando VITE_VAPID_PUBLIC_KEY como VAPID_PUBLIC_KEY. ' +
                'En Vercel, renómbrala a VAPID_PUBLIC_KEY: el prefijo VITE_ es solo para el frontend.'
        );
    }

    if (!clavePrivada) {
        pushHabilitado = false;
        motivoDeshabilitado = 'falta VAPID_PRIVATE_KEY';
        console.error(
            `[push] Web Push desactivado: ${motivoDeshabilitado}. Los pedidos seguirán funcionando sin notificación.`
        );
        return;
    }

    // La privada son 32 bytes; de ella se deriva la pública (65 bytes).
    const bytesPrivada = base64UrlABytes(clavePrivada);

    if (!bytesPrivada || bytesPrivada.length !== 32) {
        pushHabilitado = false;
        motivoDeshabilitado =
            'VAPID_PRIVATE_KEY no es una clave válida (se esperan 32 bytes en base64url)';
        console.error(`[push] Web Push desactivado: ${motivoDeshabilitado}.`);
        return;
    }

    let bytesPublica;

    try {
        bytesPublica = derivarClavePublica(bytesPrivada);
    } catch (error) {
        pushHabilitado = false;
        motivoDeshabilitado = `VAPID_PRIVATE_KEY no es una clave P-256 válida (${error.message})`;
        console.error(`[push] Web Push desactivado: ${motivoDeshabilitado}.`);
        return;
    }

    if (clavePublicaConfigurada) {
        const bytesConfigurada = base64UrlABytes(clavePublicaConfigurada);

        if (!bytesConfigurada || bytesConfigurada.length !== 65) {
            console.warn(
                '[push] VAPID_PUBLIC_KEY no es una clave P-256 válida; se usa la derivada de la privada.'
            );
        } else if (!bytesConfigurada.equals(bytesPublica)) {
            console.warn(
                '[push] VAPID_PUBLIC_KEY no corresponde a VAPID_PRIVATE_KEY; se usa la derivada de la privada.'
            );
        }
    } else {
        console.warn(
            '[push] VAPID_PUBLIC_KEY no está definida; se deriva de VAPID_PRIVATE_KEY.'
        );
    }

    // Se usa siempre la forma canónica base64url que genera web-push.
    const clavePublica = bytesPublica.toString('base64url');
    const asuntoFinal = asunto || ASUNTO_POR_DEFECTO;

    if (!asuntoValido(asuntoFinal)) {
        pushHabilitado = false;
        motivoDeshabilitado = `VAPID_SUBJECT inválido ("${asuntoFinal}"): debe ser mailto: o una URL https`;
        console.error(`[push] Web Push desactivado: ${motivoDeshabilitado}.`);
        return;
    }

    try {
        // setVapidDetails también valida; si algo no cuadra lanza y queda desactivado.
        webpush.setVapidDetails(asuntoFinal, clavePublica, clavePrivada);

        pushHabilitado = true;
        clavePublicaVapid = clavePublica;
        motivoDeshabilitado = '';

        if (!asunto) {
            console.warn(
                `[push] VAPID_SUBJECT no está definido; se usa "${ASUNTO_POR_DEFECTO}".`
            );
        }

        console.log(`[push] Web Push configurado correctamente (subject: ${asuntoFinal}).`);
    } catch (error) {
        pushHabilitado = false;
        motivoDeshabilitado = `VAPID mal configurado (${error.message})`;
        console.error(`[push] Web Push desactivado: ${motivoDeshabilitado}.`);
    }
};

configurarWebPush();

// ============================================================================
// Utilidades
// ============================================================================

const endpointHash = (endpoint) =>
    crypto.createHash('sha256').update(endpoint).digest('hex');

const suscripcionParaWebpush = (fila) => ({
    endpoint: fila.endpoint,
    keys: {
        p256dh: fila.p256dh,
        auth: fila.auth,
    },
});

const normalizarUserAgent = (valor) =>
    typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, 255) : null;

/**
 * Valida el cuerpo de una suscripción recibida desde el navegador.
 * Devuelve null si es válida o un mensaje de error si no lo es.
 */
const validarSuscripcion = ({ endpoint, p256dh, auth }) => {
    if (!endpoint || !p256dh || !auth) {
        return 'endpoint, p256dh y auth son obligatorios';
    }

    let url;

    try {
        url = new URL(endpoint);
    } catch {
        return 'El endpoint no es una URL válida';
    }

    if (url.protocol !== 'https:') {
        return 'El endpoint debe usar HTTPS';
    }

    const bytesP256dh = base64UrlABytes(p256dh);

    if (!bytesP256dh || bytesP256dh.length !== 65) {
        return 'La clave p256dh no es válida';
    }

    const bytesAuth = base64UrlABytes(auth);

    if (!bytesAuth || bytesAuth.length !== 16) {
        return 'La clave auth no es válida';
    }

    return null;
};

// ============================================================================
// Rutas protegidas (misma protección del admin: isAuth + role.isAdmin)
// ============================================================================

// Devuelve la clave pública VAPID para que el frontend se suscriba.
const obtenerClaveVapid = (req, res) => {
    res.status(200).json({
        ok: true,
        clavePublica: pushHabilitado ? clavePublicaVapid : null,
        habilitado: pushHabilitado,
        motivo: pushHabilitado ? null : motivoDeshabilitado,
    });
};

// Guarda (o actualiza) la suscripción del administrador logueado.
const suscribir = async (req, res) => {
    try {
        const idAdministrador = Number(req.user && req.user.sub);

        if (!Number.isInteger(idAdministrador) || idAdministrador <= 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Sesión no válida',
            });
        }

        const { endpoint, p256dh, auth, user_agent } = req.body || {};
        const errorValidacion = validarSuscripcion({ endpoint, p256dh, auth });

        if (errorValidacion) {
            return res.status(400).json({
                ok: false,
                mensaje: errorValidacion,
            });
        }

        const hash = endpointHash(endpoint);
        const datos = {
            id_administrador: idAdministrador,
            endpoint,
            endpoint_hash: hash,
            p256dh,
            auth,
            user_agent: normalizarUserAgent(user_agent),
        };

        // Un mismo navegador puede cambiar de administrador: se reasigna en vez
        // de duplicar. También se refrescan las claves, que el navegador rota.
        const existente = await PushSuscripcion.findOne({
            where: { endpoint_hash: hash },
        });

        if (existente) {
            await existente.update(datos);

            return res.status(200).json({
                ok: true,
                mensaje: 'Suscripción actualizada correctamente',
                data: { id: existente.id },
            });
        }

        try {
            const nueva = await PushSuscripcion.create(datos);

            return res.status(201).json({
                ok: true,
                mensaje: 'Suscripción guardada correctamente',
                data: { id: nueva.id },
            });
        } catch (error) {
            // Carrera entre dos peticiones con el mismo endpoint.
            if (error && error.name === 'SequelizeUniqueConstraintError') {
                const otra = await PushSuscripcion.findOne({
                    where: { endpoint_hash: hash },
                });

                if (otra) {
                    await otra.update(datos);

                    return res.status(200).json({
                        ok: true,
                        mensaje: 'Suscripción actualizada correctamente',
                        data: { id: otra.id },
                    });
                }
            }

            throw error;
        }
    } catch (error) {
        console.error(`[push] No se pudo guardar la suscripción: ${error.message}`);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo guardar la suscripción a las notificaciones.',
        });
    }
};

// Elimina la suscripción del administrador logueado (por endpoint).
const desuscribir = async (req, res) => {
    try {
        const idAdministrador = Number(req.user && req.user.sub);
        const { endpoint } = req.body || {};

        if (!Number.isInteger(idAdministrador) || idAdministrador <= 0) {
            return res.status(401).json({
                ok: false,
                mensaje: 'Sesión no válida',
            });
        }

        if (!endpoint || typeof endpoint !== 'string') {
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
        console.error(`[push] No se pudo eliminar la suscripción: ${error.message}`);

        return res.status(500).json({
            ok: false,
            mensaje: 'No se pudo eliminar la suscripción a las notificaciones.',
        });
    }
};

// ============================================================================
// Envío de push tras crear un pedido (se llama desde pedidoController.crearPedido)
// ============================================================================

/**
 * Borra una suscripción sin dejar que un fallo de base de datos rompa el envío.
 * @returns {Promise<number>} filas borradas (0 si falló)
 */
const eliminarSuscripcion = async (id) => {
    try {
        return await PushSuscripcion.destroy({ where: { id } });
    } catch (error) {
        console.warn(
            `[push] No se pudo eliminar la suscripción ${id}: ${error.message}`
        );

        return 0;
    }
};

/**
 * Envía la notificación de pedido nuevo a todas las suscripciones.
 *
 * Garantías:
 *  - Nunca lanza: el pedido ya está guardado y la respuesta al cliente no cambia.
 *  - Timeout por envío gestionado por web-push (no deja promesas colgadas).
 *  - Si el servicio responde 404 o 410 (suscripción vencida/inválida), se borra
 *    la fila de `push_suscripcion`.
 *  - Las filas incompletas (sin endpoint o claves) también se descartan.
 *
 * @returns {Promise<{habilitado: boolean, enviados: number, fallidos: number, eliminadas: number}>}
 */
const enviarPushANuevosPedidos = async (idPedido, total, cantidadProductos) => {
    const resumen = {
        habilitado: pushHabilitado,
        enviados: 0,
        fallidos: 0,
        eliminadas: 0,
    };

    if (!pushHabilitado) {
        return resumen;
    }

    let suscripciones;

    try {
        suscripciones = await PushSuscripcion.findAll({
            attributes: ['id', 'endpoint', 'p256dh', 'auth'],
        });
    } catch (error) {
        // La tabla puede no existir todavía: no se interrumpe el pedido.
        console.warn(
            `[push] No se pudieron leer las suscripciones: ${error.message}`
        );

        return resumen;
    }

    if (!suscripciones || suscripciones.length === 0) {
        return resumen;
    }

    const payload = {
        title: `Nuevo pedido #${idPedido}`,
        body: `${cantidadProductos} producto(s) - Total L${Number(total).toFixed(2)}`,
        tag: `pedido-${idPedido}`,
    };
    const cuerpo = JSON.stringify(payload);

    await Promise.allSettled(
        suscripciones.map(async (suscripcion) => {
            if (
                !suscripcion.endpoint ||
                !suscripcion.p256dh ||
                !suscripcion.auth
            ) {
                const borradas = await eliminarSuscripcion(suscripcion.id);
                resumen.eliminadas += Number(borradas) || 0;
                return;
            }

            try {
                await webpush.sendNotification(
                    suscripcionParaWebpush(suscripcion),
                    cuerpo,
                    {
                        timeout: TIEMPO_ESPERA_PUSH_MS,
                        TTL: TTL_SEGUNDOS,
                        urgency: 'high',
                    }
                );

                resumen.enviados += 1;
            } catch (error) {
                const estado = Number(
                    error && (error.statusCode || error.status)
                );

                // 404/410: la suscripción ya no existe en el servicio de push.
                if (estado === 404 || estado === 410) {
                    const borradas = await eliminarSuscripcion(
                        suscripcion.id
                    );
                    resumen.eliminadas += Number(borradas) || 0;
                    return;
                }

                resumen.fallidos += 1;
                console.warn(
                    `[push] Falló la notificación del pedido #${idPedido} ` +
                        `(suscripción ${suscripcion.id}, estado ${estado || 'desconocido'}): ${error.message}`
                );
            }
        })
    );

    if (resumen.eliminadas > 0) {
        console.log(
            `[push] Pedido #${idPedido}: ${resumen.eliminadas} suscripción(es) vencida(s) eliminada(s).`
        );
    }

    return resumen;
};

module.exports = {
    obtenerClaveVapid,
    suscribir,
    desuscribir,
    enviarPushANuevosPedidos,
};
