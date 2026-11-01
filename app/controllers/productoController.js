'use strict';

const fs = require('fs');
const path = require('path');
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
    const json = producto.toJSON ? producto.toJSON() : producto;

    json.variantes = (json.variantes || []).map((v) => ({
        ...v,
        imagenes: v.imagenes || [],
    }));

    const imagenesGenerales = (json.imagenes || []).filter(
        (img) => img.id_variante === null || img.id_variante === undefined
    );

    // Compatibilidad: si el producto tiene imagen principal y no figura en imagenesGenerales,
    // incluirla para que la galería siempre contenga la foto principal.
    if (json.imagen && !imagenesGenerales.some((img) => img.imagen === json.imagen)) {
        imagenesGenerales.unshift({
            id_imagen: 0,
            id_producto: json.id_producto,
            id_variante: null,
            imagen: json.imagen,
            orden: 0,
        });
    }

    json.imagenes = imagenesGenerales.sort(
        (a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id_imagen - b.id_imagen
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

/**
 * Elimina un archivo de la carpeta uploads si ninguna entidad lo sigue usando.
 * Seguro e idempotente.
 */
const eliminarArchivoSiNoSeUsa = async (rutaRelativa) => {
    if (!rutaRelativa || typeof rutaRelativa !== 'string') return;
    if (!rutaRelativa.startsWith('/uploads/')) return;

    try {
        const nombreArchivo = path.basename(rutaRelativa);
        const rutaCompleta = path.join(__dirname, '..', 'uploads', nombreArchivo);

        const enProducto = await Producto.count({ where: { imagen: rutaRelativa } });
        if (enProducto > 0) return;

        const enImagenes = await ProductoImagen.count({ where: { imagen: rutaRelativa } });
        if (enImagenes > 0) return;

        const enBanner = await db.banner.count({ where: { imagen: rutaRelativa } });
        if (enBanner > 0) return;

        if (fs.existsSync(rutaCompleta)) {
            await fs.promises.unlink(rutaCompleta);
            console.log(`🗑️ Archivo huérfano eliminado de uploads: ${nombreArchivo}`);
        }
    } catch (err) {
        console.warn(`No se pudo eliminar el archivo en disco (${rutaRelativa}):`, err.message);
    }
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

// Crear producto (admite múltiples fotos y variantes sin imagen)
const crearProducto = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const datos = req.body;

        const archivos = [
            ...(req.files?.imagenes || []),
            ...(req.files?.imagen || []),
            ...(req.file ? [req.file] : []),
        ];

        let indicePrincipal = 0;
        if (datos.indice_principal !== undefined && datos.indice_principal !== null && datos.indice_principal !== '') {
            indicePrincipal = Math.max(0, Math.min(Number(datos.indice_principal) || 0, archivos.length - 1));
        } else if (datos.indice_principal_nuevo !== undefined && datos.indice_principal_nuevo !== null && datos.indice_principal_nuevo !== '') {
            indicePrincipal = Math.max(0, Math.min(Number(datos.indice_principal_nuevo) || 0, archivos.length - 1));
        }

        if (archivos.length > 0) {
            datos.imagen = archivos[indicePrincipal].path;
        }

        delete datos.indice_principal;
        delete datos.indice_principal_nuevo;
        delete datos.imagen_principal;
        delete datos.id_imagen_principal;
        delete datos.imagenes_eliminar;
        delete datos.imagenes_orden;

        const producto = await Producto.create(normalizarDatos(datos), { transaction });

        if (archivos.length > 0) {
            for (let i = 0; i < archivos.length; i++) {
                await ProductoImagen.create({
                    id_producto: producto.id_producto,
                    id_variante: null,
                    imagen: archivos[i].path,
                    orden: i,
                }, { transaction });
            }
        } else if (datos.imagen && typeof datos.imagen === 'string' && datos.imagen.trim()) {
            await ProductoImagen.create({
                id_producto: producto.id_producto,
                id_variante: null,
                imagen: datos.imagen.trim(),
                orden: 0,
            }, { transaction });
        }

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

// Actualizar producto (admite agregar nuevas fotos, eliminar fotos específicas, reordenar y cambiar foto principal)
const actualizarProducto = async (req, res) => {
    const transaction = await sequelize.transaction();
    const archivosAEvaluarBorrado = [];

    try {
        const datos = req.body;
        const producto = await Producto.findByPk(req.params.id, { transaction });

        if (!producto) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        // 1. Eliminar imágenes marcadas (si vienen en imagenes_eliminar)
        let idsEliminar = [];
        if (datos.imagenes_eliminar) {
            try {
                idsEliminar = typeof datos.imagenes_eliminar === 'string'
                    ? JSON.parse(datos.imagenes_eliminar)
                    : datos.imagenes_eliminar;
            } catch {
                idsEliminar = [];
            }
        }

        if (Array.isArray(idsEliminar) && idsEliminar.length > 0) {
            const imagenesABorrar = await ProductoImagen.findAll({
                where: {
                    id_imagen: idsEliminar,
                    id_producto: producto.id_producto,
                },
                transaction,
            });

            for (const img of imagenesABorrar) {
                archivosAEvaluarBorrado.push(img.imagen);
                await img.destroy({ transaction });
            }
        }

        // 2. Actualizar el orden de las imágenes existentes si viene imagenes_orden
        if (datos.imagenes_orden) {
            let listaOrden = [];
            try {
                listaOrden = typeof datos.imagenes_orden === 'string'
                    ? JSON.parse(datos.imagenes_orden)
                    : datos.imagenes_orden;
            } catch {
                listaOrden = [];
            }

            if (Array.isArray(listaOrden)) {
                for (const item of listaOrden) {
                    if (item && item.id_imagen && Number.isFinite(Number(item.orden))) {
                        await ProductoImagen.update(
                            { orden: Number(item.orden) },
                            {
                                where: {
                                    id_imagen: Number(item.id_imagen),
                                    id_producto: producto.id_producto,
                                },
                                transaction,
                            }
                        );
                    }
                }
            }
        }

        // 3. Subir nuevas imágenes adjuntas
        const archivosNuevos = [
            ...(req.files?.imagenes || []),
            ...(req.files?.imagen || []),
            ...(req.file ? [req.file] : []),
        ];

        const maxOrdenActual = await ProductoImagen.max('orden', {
            where: { id_producto: producto.id_producto, id_variante: null },
            transaction,
        }) || 0;

        let siguienteOrden = Number(maxOrdenActual) + 1;
        for (let i = 0; i < archivosNuevos.length; i++) {
            await ProductoImagen.create({
                id_producto: producto.id_producto,
                id_variante: null,
                imagen: archivosNuevos[i].path,
                orden: siguienteOrden + i,
            }, { transaction });
        }

        // 4. Determinar la imagen principal del producto
        let nuevaImagenPrincipal = undefined;

        if (datos.indice_principal_nuevo !== undefined && datos.indice_principal_nuevo !== null && datos.indice_principal_nuevo !== '') {
            const idxNuevo = Number(datos.indice_principal_nuevo);
            if (archivosNuevos[idxNuevo]) {
                nuevaImagenPrincipal = archivosNuevos[idxNuevo].path;
            }
        } else if (datos.id_imagen_principal) {
            const imgP = await ProductoImagen.findOne({
                where: {
                    id_imagen: Number(datos.id_imagen_principal),
                    id_producto: producto.id_producto,
                },
                transaction,
            });
            if (imgP) {
                nuevaImagenPrincipal = imgP.imagen;
            }
        } else if (datos.imagen_principal && typeof datos.imagen_principal === 'string' && datos.imagen_principal.trim()) {
            nuevaImagenPrincipal = datos.imagen_principal.trim();
        }

        if (nuevaImagenPrincipal !== undefined) {
            datos.imagen = nuevaImagenPrincipal;
        } else {
            // Si la imagen actual fue eliminada o no existe, seleccionar la primera disponible
            const imgActualSigue = producto.imagen
                ? await ProductoImagen.findOne({
                    where: { id_producto: producto.id_producto, imagen: producto.imagen },
                    transaction,
                })
                : null;

            if (!imgActualSigue) {
                const primeraRestante = await ProductoImagen.findOne({
                    where: { id_producto: producto.id_producto, id_variante: null },
                    order: [['orden', 'ASC'], ['id_imagen', 'ASC']],
                    transaction,
                });
                datos.imagen = primeraRestante ? primeraRestante.imagen : null;
            }
        }

        delete datos.variantes;
        delete datos.imagenes_eliminar;
        delete datos.imagenes_orden;
        delete datos.imagen_principal;
        delete datos.id_imagen_principal;
        delete datos.indice_principal_nuevo;
        delete datos.indice_principal;

        await producto.update(normalizarDatos(datos), { transaction });

        // Asegurar que producto.imagen exista en producto_imagen si no está registrada
        if (producto.imagen) {
            const existeEnTabla = await ProductoImagen.findOne({
                where: { id_producto: producto.id_producto, imagen: producto.imagen },
                transaction,
            });
            if (!existeEnTabla) {
                await ProductoImagen.create({
                    id_producto: producto.id_producto,
                    id_variante: null,
                    imagen: producto.imagen,
                    orden: 0,
                }, { transaction });
            }
        }

        await transaction.commit();

        // Limpieza de archivos en disco si ya no los usa nada más
        for (const ruta of archivosAEvaluarBorrado) {
            await eliminarArchivoSiNoSeUsa(ruta);
        }

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
    const archivosAEvaluarBorrado = [];

    try {
        const producto = await Producto.findByPk(req.params.id, { transaction });

        if (!producto) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                mensaje: 'Producto no encontrado',
            });
        }

        const imagenes = await ProductoImagen.findAll({
            where: { id_producto: producto.id_producto },
            attributes: ['imagen'],
            transaction,
        });

        for (const img of imagenes) {
            if (img.imagen) archivosAEvaluarBorrado.push(img.imagen);
        }
        if (producto.imagen) {
            archivosAEvaluarBorrado.push(producto.imagen);
        }

        await producto.destroy({ transaction });

        await transaction.commit();

        for (const ruta of archivosAEvaluarBorrado) {
            await eliminarArchivoSiNoSeUsa(ruta);
        }

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

        const ruta = imagen.imagen;
        const idProd = imagen.id_producto;

        await imagen.destroy();

        const prod = await Producto.findByPk(idProd);
        if (prod && prod.imagen === ruta) {
            const siguiente = await ProductoImagen.findOne({
                where: { id_producto: idProd, id_variante: null },
                order: [['orden', 'ASC'], ['id_imagen', 'ASC']],
            });
            await prod.update({ imagen: siguiente ? siguiente.imagen : null });
        }

        await eliminarArchivoSiNoSeUsa(ruta);

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
