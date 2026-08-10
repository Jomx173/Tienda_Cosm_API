const obtenerAdministradores = (req, res) => {
    res.status(200).json({
        ok: true,
        mensaje: "Obtener todos los usuarios"
    });
};

const obtenerAdministrador = (req, res) => {
    res.status(200).json({
        ok: true,
        mensaje: "Obtener un usuario",
        id: req.params.id
    });
};

const crearAdministrador = (req, res) => {
    res.status(201).json({
        ok: true,
        mensaje: "Crear usuario"
    });
};

const actualizarAdministrador = (req, res) => {
    res.status(200).json({
        ok: true,
        mensaje: "Actualizar usuario",
        id: req.params.id
    });
};

const eliminarAdministrador = (req, res) => {
    res.status(200).json({
        ok: true,
        mensaje: "Eliminar usuario",
        id: req.params.id
    });
};

module.exports = {
    obtenerAdministradores,
    obtenerAdministrador,
    crearAdministrador,
    actualizarAdministrador,
    eliminarAdministrador
};