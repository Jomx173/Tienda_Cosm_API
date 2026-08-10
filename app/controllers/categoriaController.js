const categoriaService = require("../Service/categoriaService");

// Obtener todas las categorías
const obtenerCategorias = async (req, res) => {
    try {
        const categorias = await categoriaService.obtenerCategorias();

        res.status(200).json({
            ok: true,
            data: categorias
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Obtener una categoría por ID
const obtenerCategoria = async (req, res) => {
    try {
        const categoria = await categoriaService.obtenerCategoria(req.params.id);

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: "Categoría no encontrada"
            });
        }

        res.status(200).json({
            ok: true,
            data: categoria
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Crear categoría
const crearCategoria = async (req, res) => {
    try {
        const categoria = await categoriaService.crearCategoria(req.body);

        res.status(201).json({
            ok: true,
            mensaje: "Categoría creada correctamente",
            data: categoria
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Actualizar categoría
const actualizarCategoria = async (req, res) => {
    try {
        const categoria = await categoriaService.actualizarCategoria(
            req.params.id,
            req.body
        );

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: "Categoría no encontrada"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Categoría actualizada correctamente",
            data: categoria
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Eliminar categoría
const eliminarCategoria = async (req, res) => {
    try {
        const categoria = await categoriaService.eliminarCategoria(req.params.id);

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: "Categoría no encontrada"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Categoría eliminada correctamente"
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

module.exports = {
    obtenerCategorias,
    obtenerCategoria,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria
};
