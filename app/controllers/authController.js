const authService = require("../Service/authService");

// Iniciar sesión
const login = async (req, res) => {
    try {
        const { identidad, password } = req.body;

        if (!identidad || !password) {
            return res.status(400).json({
                ok: false,
                mensaje: "Número de identidad y contraseña son obligatorios"
            });
        }

        const resultado = await authService.iniciarSesion(identidad, password);

        res.status(200).json({
            ok: true,
            data: resultado
        });

    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Registrar administrador
const register = async (req, res) => {
    try {
        const admin = await authService.registrar(req.body);

        res.status(201).json({
            ok: true,
            mensaje: "Administrador creado correctamente",
            data: admin
        });

    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message
        });
    }
};

module.exports = {
    login,
    register
};
