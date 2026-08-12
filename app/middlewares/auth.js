'use strict';

const service = require('../Service/Token');

function isAuth(req, res, next) {
    if (!req.headers.authorization) {
        return res.status(401).json({
            ok: false,
            mensaje: 'No autorizado',
        });
    }

    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Token no válido',
        });
    }

    service.decodeToken(token)
        .then((data) => {
            req.user = data;
            next();
        })
        .catch((err) => {
            return res.status(err.status || 401).json({
                ok: false,
                mensaje: err.message,
            });
        });
}

module.exports = isAuth;
