'use strict';

const db = require('../config/db');

const Producto = db.producto;
const Categoria = db.categoria;
const sequelize = db.sequelizeInstance;

// Limpiar campos numéricos vacíos que llegan como string ""
const normalizarDatos = (datos) => {
    const limpios = { ...datos };

    for (const campo of ['precio', 'precio_anterior']) {
        if (limpios[campo] === '' || limpios[campo] === null) {
            limpios[campo] = null;
        }
    }

    return limpios;
};

// Obtener todos los productos activos (o todos si se pide)
const obtenerProductos = async (req, res) => {
    try {
        const todos = req.query.todos === '1';
        const productos = await Producto.findAll({
            where: todos ? {} : { estado: true },
            include: [
                {
                    model: Categoria,
                    as: 'categoria',
                    attributes: ['id_categoria', 'nombre'],
                },
            ],
            order: [['id_producto', 'DESC']],
        });

        res.status(200).json({
            ok: true,
            data: productos,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Obtener un producto activo por ID
const obtenerProducto = async (req, res) => {
    try {
        const producto = await Producto.findOne({
            where: { id_producto: req.params.id, estado: true },
            include: [
                {
                    model: Categoria,
                    as: 'categoria',
                    attributes: ['id_categoria', 'nombre'],
                },
            ],
        });

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: producto,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Crear producto
const crearProducto = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = req.file.path;
        }

        const producto = await Producto.create(normalizarDatos(datos));

        res.status(201).json({
            ok: true,
            mensaje: 'Producto creado correctamente',
            data: producto,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar producto
const actualizarProducto = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = req.file.path;
        }

        const producto = await Producto.findByPk(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        await producto.update(normalizarDatos(datos));

        res.status(200).json({
            ok: true,
            mensaje: 'Producto actualizado correctamente',
            data: producto,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Eliminar un producto (borrado físico limpiando detalles asociados)
const eliminarProducto = async (req, res) => {
    try {
        const producto = await Producto.findByPk(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        await producto.destroy();

        res.status(200).json({
            ok: true,
            mensaje: 'Producto eliminado correctamente',
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const quitarAcentos = (texto) =>
    (texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const normalizarNombre = (nombre) =>
    quitarAcentos(nombre)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const distanciaLevenshtein = (a, b) => {
    const filas = a.length + 1;
    const columnas = b.length + 1;
    const matriz = Array.from({ length: filas }, (_, i) =>
        Array.from({ length: columnas }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i < filas; i++) {
        for (let j = 1; j < columnas; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            matriz[i][j] = Math.min(
                matriz[i - 1][j] + 1,
                matriz[i][j - 1] + 1,
                matriz[i - 1][j - 1] + costo
            );
        }
    }

    return matriz[filas - 1][columnas - 1];
};

const similitudNombres = (a, b) => {
    const na = normalizarNombre(a);
    const nb = normalizarNombre(b);

    if (!na || !nb) return 0;
    if (na === nb) return 1;

    if (na.includes(nb) || nb.includes(na)) {
        const corto = Math.min(na.length, nb.length);
        const largo = Math.max(na.length, nb.length);
        return corto / largo >= 0.5 ? 0.9 : corto / largo;
    }

    const distancia = distanciaLevenshtein(na, nb);
    const largoMaximo = Math.max(na.length, nb.length);

    return largoMaximo === 0 ? 0 : 1 - distancia / largoMaximo;
};

const UMBRAL_SIMILITUD = 0.75;

const buscarDuplicados = async ({ nombre, id_categoria, subcategoria = '', excluirId = null }) => {
    if (!nombre || !id_categoria) {
        return null;
    }

    const productos = await Producto.findAll({
        where: { id_categoria },
        include: [
            {
                model: Categoria,
                as: 'categoria',
                attributes: ['id_categoria', 'nombre'],
            },
        ],
    });

    const subcategoriaNorm = normalizarNombre(subcategoria);

    const candidatos = productos.filter(
        (p) =>
            String(p.id_producto) !== String(excluirId) &&
            (!subcategoriaNorm ||
                normalizarNombre(p.subcategoria) === subcategoriaNorm)
    );

    let mejor = null;

    for (const producto of candidatos) {
        const similitud = similitudNombres(nombre, producto.nombre);

        if (similitud >= UMBRAL_SIMILITUD && (!mejor || similitud > mejor.similitud)) {
            mejor = {
                id_producto: producto.id_producto,
                nombre: producto.nombre,
                subcategoria: producto.subcategoria || '',
                categoria: producto.categoria?.nombre || '',
                similitud: Number(similitud.toFixed(2)),
            };
        }
    }

    return mejor;
};

// Buscar un posible producto duplicado por nombre en la misma categoría/subcategoría
const buscarDuplicadosHandler = async (req, res) => {
    try {
        const { nombre, id_categoria, subcategoria, excluir } = req.query;

        if (!nombre || !id_categoria) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Faltan el nombre y la categoría del producto',
            });
        }

        const resultado = await buscarDuplicados({
            nombre,
            id_categoria: Number(id_categoria),
            subcategoria: subcategoria || '',
            excluirId: excluir ? Number(excluir) : null,
        });

        res.status(200).json({
            ok: true,
            data: resultado,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    obtenerProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    buscarDuplicadosHandler,
};
