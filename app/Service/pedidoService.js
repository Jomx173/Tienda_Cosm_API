const Pedido = require("../models/Pedido");

// Obtener todos los pedidos (más recientes primero)
const obtenerPedidos = async () => {
    return await Pedido.findAll({
        order: [["id_pedido", "DESC"]],
    });
};

// Obtener un pedido por ID
const obtenerPedido = async (id) => {
    return await Pedido.findByPk(id);
};

// Crear un pedido (productos: array de {id_producto, nombre, precio, cantidad})
const crearPedido = async (datos) => {
    const productos = Array.isArray(datos.productos) ? datos.productos : [];

    const total = productos.reduce(
        (suma, item) => suma + Number(item.precio) * Number(item.cantidad),
        0
    );

    return await Pedido.create({
        nombre_cliente: datos.nombre_cliente || "",
        telefono_cliente: datos.telefono_cliente || "",
        direccion: datos.direccion || "",
        productos: JSON.stringify(productos),
        total,
        estado: "pendiente",
    });
};

// Actualizar el estado de un pedido
const actualizarEstadoPedido = async (id, estado) => {
    const pedido = await Pedido.findByPk(id);

    if (!pedido) {
        return null;
    }

    await pedido.update({ estado });
    return pedido;
};

// Eliminar un pedido
const eliminarPedido = async (id) => {
    const pedido = await Pedido.findByPk(id);

    if (!pedido) {
        return null;
    }

    await pedido.destroy();
    return pedido;
};

module.exports = {
    obtenerPedidos,
    obtenerPedido,
    crearPedido,
    actualizarEstadoPedido,
    eliminarPedido,
};
