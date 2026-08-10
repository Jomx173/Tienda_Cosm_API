const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            ok: false,
            mensaje: "No autorizado"
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            ok: false,
            mensaje: "Token inválido o expirado"
        });
    }
};

module.exports = { verificarToken };
