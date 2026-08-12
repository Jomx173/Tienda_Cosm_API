'use strict';

const db = require('../config/db');

const Categoria = db.categoria;

// Obtener todas las categorías (solo activas para la tienda, todas para el admin)
const obtenerCategorias = async (req, res) => {
    try {
        const todos = req.query.todos === '1';
        const categorias = await Categoria.findAll({
            where: todos ? {} : { estado: true },
            order: [['nombre', 'ASC']],
        });

        res.status(200).json({
            ok: true,
            data: categorias,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Obtener una categoría por ID
const obtenerCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findByPk(req.params.id);

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Categoría no encontrada',
            });
        }

        res.status(200).json({
            ok: true,
            data: categoria,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Crear categoría
const crearCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.create(req.body);

        res.status(201).json({
            ok: true,
            mensaje: 'Categoría creada correctamente',
            data: categoria,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar categoría
const actualizarCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findByPk(req.params.id);

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Categoría no encontrada',
            });
        }

        await categoria.update(req.body);

        res.status(200).json({
            ok: true,
            mensaje: 'Categoría actualizada correctamente',
            data: categoria,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Eliminar categoría (baja lógica)
const eliminarCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findByPk(req.params.id);

        if (!categoria) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Categoría no encontrada',
            });
        }

        await categoria.update({ estado: false });

        res.status(200).json({
            ok: true,
            mensaje: 'Categoría eliminada correctamente',
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    obtenerCategorias,
    obtenerCategoria,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
};
