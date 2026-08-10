const pedidoService = require("../Service/pedidoService");

// Obtener todos los pedidos
const obtenerPedidos = async (req, res) => {
    try {
        const pedidos = await pedidoService.obtenerPedidos();

        const pedidosFormateados = pedidos.map((pedido) => ({
            ...pedido.toJSON(),
            productos: pedido.productos ? JSON.parse(pedido.productos) : [],
        }));

        res.status(200).json({
            ok: true,
            data: pedidosFormateados,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Obtener un pedido por ID
const obtenerPedido = async (req, res) => {
    try {
        const pedido = await pedidoService.obtenerPedido(req.params.id);

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: "Pedido no encontrado",
            });
        }

        res.status(200).json({
            ok: true,
            data: {
                ...pedido.toJSON(),
                productos: pedido.productos ? JSON.parse(pedido.productos) : [],
            },
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Crear un pedido (público: lo hace el cliente desde la tienda)
const crearPedido = async (req, res) => {
    try {
        const datos = req.body;

        if (!Array.isArray(datos.productos) || datos.productos.length === 0) {
            return res.status(400).json({
                ok: false,
                mensaje: "El pedido debe incluir al menos un producto",
            });
        }

        if (datos.nombre_cliente && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ' ]+$/.test(datos.nombre_cliente)) {
            return res.status(400).json({
                ok: false,
                mensaje: "El nombre solo puede contener letras",
            });
        }

        if (datos.telefono_cliente && !/^[0-9+()\- ]+$/.test(datos.telefono_cliente)) {
            return res.status(400).json({
                ok: false,
                mensaje: "El teléfono solo puede contener números",
            });
        }

        if (datos.direccion && datos.direccion.length > 300) {
            return res.status(400).json({
                ok: false,
                mensaje: "La dirección es demasiado larga",
            });
        }

        const pedido = await pedidoService.crearPedido(datos);

        res.status(201).json({
            ok: true,
            mensaje: "Pedido creado correctamente",
            data: {
                ...pedido.toJSON(),
                productos: pedido.productos ? JSON.parse(pedido.productos) : [],
            },
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar el estado de un pedido
const actualizarEstadoPedido = async (req, res) => {
    try {
        const { estado } = req.body;

        if (!estado) {
            return res.status(400).json({
                ok: false,
                mensaje: "El estado es obligatorio",
            });
        }

        const pedido = await pedidoService.actualizarEstadoPedido(
            req.params.id,
            estado
        );

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: "Pedido no encontrado",
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Estado del pedido actualizado",
            data: pedido,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Eliminar un pedido
const eliminarPedido = async (req, res) => {
    try {
        const pedido = await pedidoService.eliminarPedido(req.params.id);

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: "Pedido no encontrado",
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Pedido eliminado correctamente",
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    obtenerPedidos,
    obtenerPedido,
    crearPedido,
    actualizarEstadoPedido,
    eliminarPedido,
};
