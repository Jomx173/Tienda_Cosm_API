'use strict';

const db = require('../config/db');

const Producto = db.producto;
const Categoria = db.categoria;
const ProductoVariante = db.productoVariante;
const ProductoImagen = db.productoImagen;
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

const incluirRelaciones = () => [
    {
        model: Categoria,
        as: 'categoria',
        attributes: ['id_categoria', 'nombre'],
    },
    {
        model: ProductoVariante,
        as: 'variantes',
        separate: false,
        order: [['orden', 'ASC'], ['id_variante', 'ASC']],
        include: [
            {
                model: ProductoImagen,
                as: 'imagenes',
                attributes: ['id_imagen', 'id_variante', 'imagen', 'orden'],
            },
        ],
    },
    {
        model: ProductoImagen,
        as: 'imagenes',
        attributes: ['id_imagen', 'id_variante', 'imagen', 'orden'],
    },
];

const limpiarRelaciones = (producto) => {
    const json = producto.toJSON();

    json.variantes = (json.variantes || []).map((v) => ({
        ...v,
        imagenes: v.imagenes || [],
    }));

    json.imagenes = (json.imagenes || []).filter(
        (img) => img.id_variante === null || img.id_variante === undefined
    );

    // Compatibilidad: el stock del producto principal sigue existiendo.
    // Cuando tiene variantes, se refleja como la suma de sus existencias.
    if (json.variantes.length > 0) {
        json.stock_total = json.variantes.reduce(
            (suma, v) => suma + Number(v.stock || 0),
            0
        );
    }

    return json;
};

// Obtener todos los productos activos (o todos si se pide)
const obtenerProductos = async (req, res) => {
    try {
        const todos = req.query.todos === '1';
        const productos = await Producto.findAll({
            where: todos ? {} : { estado: true },
            include: incluirRelaciones(),
            order: [['id_producto', 'DESC']],
        });

        res.status(200).json({
            ok: true,
            data: productos.map(limpiarRelaciones),
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
            include: incluirRelaciones(),
        });

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: limpiarRelaciones(producto),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Parsea el campo "variantes" que llega como string JSON desde FormData
const parsearVariantes = (entrada) => {
    if (!entrada) return [];

    let datos = entrada;

    if (typeof datos === 'string') {
        const texto = datos.trim();

        try {
            datos = JSON.parse(texto);
        } catch {
            // Tolerante a JSON sin comillas en las claves/valores
            // (algunos clientes multipart las eliminan).
            try {
                const reparado = texto
                    .replace(/([{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
                    .replace(/:\s*([A-Za-z_][A-Za-z0-9_ ]*?)\s*([,}])/g, ':"$1"$2');

                datos = JSON.parse(reparado);
            } catch {
                return [];
            }
        }
    }

    // Puede llegar como array o como un unico objeto (crear/editar una variante)
    if (!Array.isArray(datos)) {
        datos = [datos];
    }

    return datos
        .filter((v) => v && String(v.tono || '').trim())
        .map((v, indice) => ({
            tono: String(v.tono).trim().slice(0, 80),
            color: v.color ? String(v.color).slice(0, 20) : null,
            precio: v.precio === '' || v.precio === null || v.precio === undefined
                ? null
                : Number(v.precio),
            precio_anterior:
                v.precio_anterior === '' || v.precio_anterior === null || v.precio_anterior === undefined
                    ? null
                    : Number(v.precio_anterior),
            stock: v.stock === '' || v.stock === null || v.stock === undefined
                ? 0
                : Math.max(0, Math.trunc(Number(v.stock))),
            codigo: v.codigo ? String(v.codigo).slice(0, 80) : null,
            orden: Number.isFinite(Number(v.orden)) ? Number(v.orden) : indice,
            estado: v.estado === undefined ? true : Boolean(v.estado),
        }));
};

// El stock del producto principal queda como la suma de sus variantes
const recalcularStockProducto = async (idProducto, transaction = null) => {
    const variantes = await ProductoVariante.findAll({
        where: { id_producto: idProducto },
        transaction,
    });

    if (variantes.length === 0) return null;

    const total = variantes.reduce((suma, v) => suma + Number(v.stock || 0), 0);
    await Producto.update({ stock: total }, { where: { id_producto: idProducto }, transaction });

    return total;
};

// Crear producto (admite "variantes" como JSON en el body)
const crearProducto = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = req.file.path;
        }

        const producto = await Producto.create(normalizarDatos(datos), { transaction });

        const variantes = parsearVariantes(datos.variantes);

        if (variantes.length > 0) {
            for (const variante of variantes) {
                await ProductoVariante.create({
                    ...variante,
                    id_producto: producto.id_producto,
                }, { transaction });
            }

            await recalcularStockProducto(producto.id_producto, transaction);
        }

        await transaction.commit();

        const completo = await Producto.findByPk(producto.id_producto, {
            include: incluirRelaciones(),
        });

        res.status(201).json({
            ok: true,
            mensaje: 'Producto creado correctamente',
            data: limpiarRelaciones(completo),
        });
    } catch (error) {
        await transaction.rollback();

        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar producto (nunca borra variantes existentes)
const actualizarProducto = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = req.file.path;
        }

        const producto = await Producto.findByPk(req.params.id, { transaction });

        if (!producto) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        delete datos.variantes;

        await producto.update(normalizarDatos(datos), { transaction });

        await transaction.commit();

        const completo = await Producto.findByPk(req.params.id, {
            include: incluirRelaciones(),
        });

        res.status(200).json({
            ok: true,
            mensaje: 'Producto actualizado correctamente',
            data: limpiarRelaciones(completo),
        });
    } catch (error) {
        await transaction.rollback();

        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Eliminar un producto (borrado físico limpiando detalles asociados)
const eliminarProducto = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const producto = await Producto.findByPk(req.params.id, { transaction });

        if (!producto) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        await producto.destroy({ transaction });

        await transaction.commit();

        res.status(200).json({
            ok: true,
            mensaje: 'Producto eliminado correctamente',
        });
    } catch (error) {
        await transaction.rollback();

        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

/* =======================
   VARIANTES
======================= */

const obtenerVariante = async (idVariante) =>
    ProductoVariante.findByPk(idVariante, {
        include: [
            {
                model: ProductoImagen,
                as: 'imagenes',
                attributes: ['id_imagen', 'id_variante', 'imagen', 'orden'],
            },
        ],
    });

const crearVariante = async (req, res) => {
    try {
        const producto = await Producto.findByPk(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        const [variante] = parsearVariantes([req.body]);

        if (!variante) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El tono de la variante es obligatorio',
            });
        }

        if (variante.precio === null || !Number.isFinite(variante.precio)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El precio de la variante es obligatorio',
            });
        }

        const creada = await ProductoVariante.create({
            ...variante,
            id_producto: producto.id_producto,
        });

        await recalcularStockProducto(producto.id_producto);

        res.status(201).json({
            ok: true,
            mensaje: 'Variante creada correctamente',
            data: await obtenerVariante(creada.id_variante),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const actualizarVariante = async (req, res) => {
    try {
        const variante = await ProductoVariante.findByPk(req.params.idVariante);

        if (!variante) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Variante no encontrada',
            });
        }

        const [datos] = parsearVariantes([req.body]);

        if (!datos) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El tono de la variante es obligatorio',
            });
        }

        await variante.update(datos);

        await recalcularStockProducto(variante.id_producto);

        res.status(200).json({
            ok: true,
            mensaje: 'Variante actualizada correctamente',
            data: await obtenerVariante(variante.id_variante),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const eliminarVariante = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const variante = await ProductoVariante.findByPk(req.params.idVariante, { transaction });

        if (!variante) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                mensaje: 'Variante no encontrada',
            });
        }

        const idProducto = variante.id_producto;

        await variante.destroy({ transaction });

        await recalcularStockProducto(idProducto, transaction);

        await transaction.commit();

        res.status(200).json({
            ok: true,
            mensaje: 'Variante eliminada correctamente',
        });
    } catch (error) {
        await transaction.rollback();

        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

/* =======================
   IMAGENES (galería del producto y de cada variante)
======================= */

const subirImagenes = async (req, res) => {
    try {
        const producto = await Producto.findByPk(req.params.id);

        if (!producto) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        const archivos = req.files || [];

        if (archivos.length === 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debes adjuntar al menos una imagen',
            });
        }

        const idVariante = req.body.id_variante ? Number(req.body.id_variante) : null;

        if (idVariante) {
            const variante = await ProductoVariante.findOne({
                where: { id_variante: idVariante, id_producto: producto.id_producto },
            });

            if (!variante) {
                return res.status(404).json({
                    ok: false,
                    mensaje: 'La variante no pertenece a este producto',
                });
            }
        }

        const existentes = await ProductoImagen.count({
            where: { id_producto: producto.id_producto, id_variante: idVariante },
        });

        const creadas = [];

        for (let i = 0; i < archivos.length; i++) {
            creadas.push(await ProductoImagen.create({
                id_producto: producto.id_producto,
                id_variante: idVariante,
                imagen: archivos[i].path,
                orden: existentes + i,
            }));
        }

        // La primera imagen del producto principal también pasa a ser la portada
        if (!idVariante && existentes === 0 && !producto.imagen) {
            await producto.update({ imagen: archivos[0].path });
        }

        res.status(201).json({
            ok: true,
            mensaje: `${creadas.length} imagen(es) agregada(s) correctamente`,
            data: creadas,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const eliminarImagen = async (req, res) => {
    try {
        const imagen = await ProductoImagen.findByPk(req.params.idImagen);

        if (!imagen) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Imagen no encontrada',
            });
        }

        await imagen.destroy();

        res.status(200).json({
            ok: true,
            mensaje: 'Imagen eliminada correctamente',
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
    crearVariante,
    actualizarVariante,
    eliminarVariante,
    subirImagenes,
    eliminarImagen,
    recalcularStockProducto,
};
