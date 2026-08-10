const Producto = require("../models/Producto");
const Categoria = require("../models/Categoria");

// Obtener todos los productos activos (o todos si se pide)
const obtenerProductos = async (todos = false) => {
    return await Producto.findAll({
        where: todos ? {} : { estado: true },
        include: [
            {
                model: Categoria,
                as: "categoria",
                attributes: ["id_categoria", "nombre"],
            },
        ],
        order: [["id_producto", "DESC"]],
    });
};

// Obtener un producto por ID
const obtenerProducto = async (id) => {
    return await Producto.findByPk(id, {
        include: [
            {
                model: Categoria,
                as: "categoria",
                attributes: ["id_categoria", "nombre"],
            },
        ],
    });
};

// Crear un producto
const crearProducto = async (datos) => {
    return await Producto.create(datos);
};

// Actualizar un producto
const actualizarProducto = async (id, datos) => {
    const producto = await Producto.findByPk(id);

    if (!producto) {
        return null;
    }

    await producto.update(datos);
    return producto;
};

// Eliminar un producto (baja lógica)
const eliminarProducto = async (id) => {
    const producto = await Producto.findByPk(id);

    if (!producto) {
        return null;
    }

    await producto.update({ estado: false });
    return producto;
};

module.exports = {
    obtenerProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
};
