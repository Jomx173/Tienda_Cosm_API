const Categoria = require("../models/Categoria");

// Obtener todas las categorías activas
const obtenerCategorias = async () => {
    return await Categoria.findAll({
        where: { estado: true },
        order: [["nombre", "ASC"]],
    });
};

// Obtener una categoría por ID
const obtenerCategoria = async (id) => {
    return await Categoria.findByPk(id);
};

// Crear categoría
const crearCategoria = async (datos) => {
    return await Categoria.create(datos);
};

// Actualizar categoría
const actualizarCategoria = async (id, datos) => {
    const categoria = await Categoria.findByPk(id);

    if (!categoria) {
        return null;
    }

    await categoria.update(datos);
    return categoria;
};

// Eliminar categoría (baja lógica)
const eliminarCategoria = async (id) => {
    const categoria = await Categoria.findByPk(id);

    if (!categoria) {
        return null;
    }

    await categoria.update({ estado: false });
    return categoria;
};

module.exports = {
    obtenerCategorias,
    obtenerCategoria,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
};
