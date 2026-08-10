const productoService = require("../Service/productoService");

// Obtener todos los productos
const obtenerProductos = async (req, res) => {
    try {
        const todos = req.query.todos === "1";
        const productos = await productoService.obtenerProductos(todos);

        res.status(200).json({
            ok: true,
            data: productos
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Obtener un producto por ID
const obtenerProducto = async (req, res) => {
    try {
        const producto = await productoService.obtenerProducto(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: "Producto no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            data: producto
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Crear producto
const crearProducto = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = `/uploads/${req.file.filename}`;
        }

        const producto = await productoService.crearProducto(datos);

        res.status(201).json({
            ok: true,
            mensaje: "Producto creado correctamente",
            data: producto
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Actualizar producto
const actualizarProducto = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = `/uploads/${req.file.filename}`;
        }

        const producto = await productoService.actualizarProducto(
            req.params.id,
            datos
        );

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: "Producto no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Producto actualizado correctamente",
            data: producto
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Eliminar producto
const eliminarProducto = async (req, res) => {
    try {
        const producto = await productoService.eliminarProducto(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: "Producto no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Producto eliminado correctamente"
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

module.exports = {
    obtenerProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    eliminarProducto
};