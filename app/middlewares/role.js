'use strict';

function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            ok: false,
            mensaje: 'Usuario no autenticado',
        });
    }

    if (req.user.rolId !== 1) {
        return res.status(403).json({
            ok: false,
            mensaje: 'Acceso denegado',
        });
    }

    next();
}

module.exports = {
    isAdmin,
};
