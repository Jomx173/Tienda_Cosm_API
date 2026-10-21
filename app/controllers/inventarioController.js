'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const db = require('../config/db');
const respaldoService = require('../Service/respaldoInventario');

const Producto = db.producto;
const ProductoVariante = db.productoVariante;
const ProductoImagen = db.productoImagen;
const Categoria = db.categoria;
const DetallePedido = db.detallepedido;
const MovimientoInventario = db.movimientoInventario;

const UPLOADS_DIR = respaldoService.UPLOADS_DIR;
const BACKUPS_DIR = path.join(__dirname, '..', '..', 'backups');

/* =======================
   SUBIDA DEL ARCHIVO DE RESPALDO (solo memoria, no se guarda en disco)
======================= */

const subirRespaldo = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: respaldoService.TAMANO_MAXIMO_ARCHIVO, files: 1 },
    fileFilter: (req, file, cb) => {
        const ok =
            /\.json$/i.test(file.originalname) ||
            ['application/json', 'text/plain', 'application/octet-stream'].includes(file.mimetype);
        cb(ok ? null : new Error('El archivo de respaldo debe ser un JSON (.json).'), ok);
    },
});

/* =======================
   HELPERS
======================= */

/** Lee y parsea el JSON subido, validando el tamaño. */
const leerRespaldo = (req, res) => {
    if (!req.file) {
        res.status(400).json({ ok: false, mensaje: 'Selecciona un archivo de respaldo.' });
        return null;
    }

    if (req.file.size > respaldoService.TAMANO_MAXIMO_ARCHIVO) {
        res.status(413).json({
            ok: false,
            mensaje: `El archivo supera el limite de ${Math.round(
                respaldoService.TAMANO_MAXIMO_ARCHIVO / (1024 * 1024)
            )} MB.`,
        });
        return null;
    }

    let contenido;

    try {
        contenido = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
        res.status(400).json({ ok: false, mensaje: 'El archivo no es un JSON valido.' });
        return null;
    }

    return contenido;
};

/** Carga el estado actual del inventario para comparar. */
const cargarEstadoActual = async () => {
    const [categorias, productos, variantes, imagenes] = await Promise.all([
        Categoria.findAll({ order: [['id_categoria', 'ASC']] }),
        Producto.findAll({ order: [['id_producto', 'ASC']] }),
        ProductoVariante.findAll({ order: [['id_variante', 'ASC']] }),
        ProductoImagen.findAll({ order: [['id_imagen', 'ASC']] }),
    ]);

    return { categorias, productos, variantes, imagenes };
};

/** Productos y variantes referenciados por pedidos (no se pueden eliminar). */
const obtenerProtegidos = async () => {
    const detalles = await DetallePedido.findAll({
        attributes: ['id_producto', 'id_variante'],
    });

    const productos = new Set();
    const variantes = new Set();

    for (const d of detalles) {
        if (d.id_producto) productos.add(d.id_producto);
        if (d.id_variante) variantes.add(d.id_variante);
    }

    return { productos, variantes };
};

/** Genera y guarda en disco un respaldo del estado actual (red de seguridad). */
const guardarRespaldoLocal = async () => {
    const estado = await cargarEstadoActual();
    const respaldo = respaldoService.construirRespaldo({ ...estado, incluirImagenes: false });

    if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const nombre = `md-beauty-antes-restauracion-${sello}.json`;
    const ruta = path.join(BACKUPS_DIR, nombre);

    fs.writeFileSync(ruta, JSON.stringify(respaldo, null, 2), 'utf8');

    // Se conservan solo las ultimas copias automaticas para no llenar el disco
    const previas = fs
        .readdirSync(BACKUPS_DIR)
        .filter((f) => f.startsWith('md-beauty-antes-restauracion-') && f.endsWith('.json'))
        .sort()
        .reverse();

    for (const viejo of previas.slice(10)) {
        try {
            fs.unlinkSync(path.join(BACKUPS_DIR, viejo));
        } catch {
            /* si no se puede borrar, se ignora */
        }
    }

    return { nombre, ruta };
};

/* =======================
   1. DESCARGAR COPIA DE SEGURIDAD
======================= */

const generarRespaldo = async (req, res) => {
    try {
        const estado = await cargarEstadoActual();

        const incluirImagenes = req.query.imagenes !== '0';

        const respaldo = respaldoService.construirRespaldo({ ...estado, incluirImagenes });

        const ahora = new Date();
        const sello =
            `${ahora.getFullYear()}-` +
            `${String(ahora.getMonth() + 1).padStart(2, '0')}-` +
            `${String(ahora.getDate()).padStart(2, '0')}_` +
            `${String(ahora.getHours()).padStart(2, '0')}-` +
            `${String(ahora.getMinutes()).padStart(2, '0')}`;

        const nombreArchivo = `md-beauty-inventario-${sello}.json`;

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${nombreArchivo}"`
        );
        res.setHeader('X-Formato-Respaldo', respaldoService.FORMATO);
        res.setHeader('X-Version-Respaldo', String(respaldoService.VERSION_FORMATO));

        res.send(JSON.stringify(respaldo, null, 2));
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo generar la copia de seguridad: ${error.message}`,
        });
    }
};

/* =======================
   2. VALIDAR RESPALDO (vista previa)
======================= */

const validarRespaldo = async (req, res) => {
    try {
        const contenido = leerRespaldo(req, res);

        if (!contenido) return;

        const validacion = respaldoService.validarRespaldo(contenido);

        if (!validacion.valido) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El archivo no es un respaldo valido.',
                errores: validacion.errores,
                advertencias: validacion.advertencias,
            });
        }

        const estado = await cargarEstadoActual();
        const protegidos = await obtenerProtegidos();

        const { plan } = respaldoService.calcularPlan({
            respaldo: validacion.datos,
            categoriasActuales: estado.categorias,
            productosActuales: estado.productos,
            variantesActuales: estado.variantes,
            imagenesActuales: estado.imagenes,
            productosProtegidos: protegidos.productos,
            variantesProtegidas: protegidos.variantes,
            modo: 'combinar',
        });

        const { plan: planReemplazar } = respaldoService.calcularPlan({
            respaldo: validacion.datos,
            categoriasActuales: estado.categorias,
            productosActuales: estado.productos,
            variantesActuales: estado.variantes,
            imagenesActuales: estado.imagenes,
            productosProtegidos: protegidos.productos,
            variantesProtegidas: protegidos.variantes,
            modo: 'reemplazar',
        });

        return res.status(200).json({
            ok: true,
            mensaje: 'Archivo de respaldo valido.',
            meta: validacion.datos.meta,
            conteos: {
                categorias: validacion.datos.categorias.length,
                productos: validacion.datos.productos.length,
                variantes: validacion.datos.variantes.length,
                imagenes: validacion.datos.imagenes.length,
            },
            advertencias: validacion.advertencias,
            planCombinar: plan,
            planReemplazar,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo validar el archivo: ${error.message}`,
        });
    }
};

/* =======================
   3. RESTAURAR INVENTARIO
======================= */

const restaurarInventario = async (req, res) => {
    try {
        const modo = req.body.modo === 'reemplazar' ? 'reemplazar' : 'combinar';

        if (req.body.confirmado !== 'true' && req.body.confirmado !== true) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Falta la confirmacion explicita del administrador.',
            });
        }

        const contenido = leerRespaldo(req, res);

        if (!contenido) return;

        const validacion = respaldoService.validarRespaldo(contenido);

        if (!validacion.valido) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El archivo no es un respaldo valido. No se modifico nada.',
                errores: validacion.errores,
            });
        }

        const respaldo = validacion.datos;

        // Respaldo de seguridad del estado actual ANTES de aplicar cambios
        const seguridad = await guardarRespaldoLocal();

        const transaction = await db.sequelizeInstance.transaction();

        try {
            const estado = await cargarEstadoActual();
            const protegidos = await obtenerProtegidos();

            const { plan, mapaCategoria } = respaldoService.calcularPlan({
                respaldo,
                categoriasActuales: estado.categorias,
                productosActuales: estado.productos,
                variantesActuales: estado.variantes,
                imagenesActuales: estado.imagenes,
                productosProtegidos: protegidos.productos,
                variantesProtegidas: protegidos.variantes,
                modo,
            });

            /* --- categorias --- */
            const categoriasPorNombre = new Map();
            for (const c of estado.categorias) {
                categoriasPorNombre.set(respaldoService.normalizar(c.nombre), c);
            }

            for (const c of respaldo.categorias) {
                const clave = respaldoService.normalizar(c.nombre);
                const actual = categoriasPorNombre.get(clave);

                if (actual) {
                    await actual.update(
                        {
                            nombre: c.nombre,
                            descripcion: c.descripcion ?? null,
                            estado: respaldoService.aBooleano(c.estado, true),
                        },
                        { transaction }
                    );
                } else {
                    const nueva = await Categoria.create(
                        {
                            nombre: c.nombre,
                            descripcion: c.descripcion ?? null,
                            estado: respaldoService.aBooleano(c.estado, true),
                        },
                        { transaction }
                    );
                    categoriasPorNombre.set(clave, nueva);
                }
            }

            /* --- productos --- */
            // Mismo emparejamiento que usa el plan: codigo > nombre + categoria,
            // sin emparejar dos veces el mismo producto.
            const emparejamiento = respaldoService.emparejarProductos({
                productosRespaldo: respaldo.productos,
                productosActuales: estado.productos,
                mapaCategoria,
            });

            const mapaProducto = new Map(emparejamiento.mapaProducto);
            const clavesAmbiguas = emparejamiento.clavesAmbiguas;

            for (const p of respaldo.productos) {
                const idRespaldo = respaldoService.aEntero(p.id_producto);
                let actual = estado.productos.find(
                    (x) => x.id_producto === mapaProducto.get(idRespaldo)
                ) || null;

                const idCategoriaDestino = mapaCategoria.has(respaldoService.aEntero(p.id_categoria))
                    ? mapaCategoria.get(respaldoService.aEntero(p.id_categoria))
                    : respaldoService.aEntero(p.id_categoria) || categoriasPorNombre.values().next().value?.id_categoria;

                const codigoRespaldo = (p.codigo || '').trim();
                const subcategoriaRespaldo = (p.subcategoria || '').trim();

                const datos = {
                    nombre: p.nombre,
                    descripcion: p.descripcion ?? null,
                    precio: respaldoService.aDecimal(p.precio) ?? 0,
                    precio_anterior:
                        p.precio_anterior === null || p.precio_anterior === undefined
                            ? null
                            : respaldoService.aDecimal(p.precio_anterior),
                    stock: Math.max(0, respaldoService.aEntero(p.stock) ?? 0),
                    // Se conserva el valor original cuando el producto no tiene codigo.
                    codigo: codigoRespaldo ? codigoRespaldo : actual ? actual.codigo : null,
                    subcategoria: subcategoriaRespaldo
                        ? subcategoriaRespaldo
                        : actual
                          ? actual.subcategoria
                          : null,
                    destacado: respaldoService.aBooleano(p.destacado, false),
                    imagen: p.imagen || null,
                    estado: respaldoService.aBooleano(p.estado, true),
                    id_categoria: idCategoriaDestino,
                };

                if (actual) {
                    await actual.update(datos, { transaction });
                } else {
                    const nuevo = await Producto.create(datos, { transaction });
                    mapaProducto.set(idRespaldo, nuevo.id_producto);
                }
            }

            /* --- variantes --- */
            const variantesPorProducto = new Map();
            for (const v of estado.variantes) {
                if (!variantesPorProducto.has(v.id_producto)) variantesPorProducto.set(v.id_producto, []);
                variantesPorProducto.get(v.id_producto).push(v);
            }

            const mapaVariante = new Map();

            for (const v of respaldo.variantes) {
                const idProducto = mapaProducto.get(respaldoService.aEntero(v.id_producto));

                if (!idProducto) continue; // producto no restaurado: se omite la variante

                const actuales = variantesPorProducto.get(idProducto) || [];

                let actual = null;

                if (v.codigo && String(v.codigo).trim()) {
                    actual =
                        actuales.find(
                            (x) => x.codigo && respaldoService.normalizar(x.codigo) === respaldoService.normalizar(v.codigo)
                        ) || null;
                }

                if (!actual) {
                    actual =
                        actuales.find(
                            (x) => respaldoService.normalizar(x.tono) === respaldoService.normalizar(v.tono)
                        ) || null;
                }

                const datos = {
                    id_producto: idProducto,
                    tono: v.tono,
                    color: v.color || null,
                    precio: respaldoService.aDecimal(v.precio) ?? 0,
                    precio_anterior:
                        v.precio_anterior === null || v.precio_anterior === undefined
                            ? null
                            : respaldoService.aDecimal(v.precio_anterior),
                    stock: Math.max(0, respaldoService.aEntero(v.stock) ?? 0),
                    codigo: v.codigo || '',
                    orden: respaldoService.aEntero(v.orden) ?? 0,
                    estado: respaldoService.aBooleano(v.estado, true),
                };

                if (actual) {
                    await actual.update(datos, { transaction });
                    mapaVariante.set(respaldoService.aEntero(v.id_variante), actual.id_variante);
                } else {
                    const nueva = await ProductoVariante.create(datos, { transaction });
                    mapaVariante.set(respaldoService.aEntero(v.id_variante), nueva.id_variante);
                    if (!variantesPorProducto.has(idProducto)) variantesPorProducto.set(idProducto, []);
                    variantesPorProducto.get(idProducto).push(nueva);
                }
            }

            /* --- imagenes --- */
            const imagenesActuales = await ProductoImagen.findAll({ transaction });
            const claveImagen = (p, v, img) =>
                `${p}::${v ?? 0}::${respaldoService.normalizar(img)}`;

            const mapaImagenes = new Map();
            for (const img of imagenesActuales) {
                mapaImagenes.set(claveImagen(img.id_producto, img.id_variante, img.imagen), img);
            }

            let imagenesCreadas = 0;
            let imagenesRestauradas = 0;

            for (const img of respaldo.imagenes) {
                const idProducto = mapaProducto.get(respaldoService.aEntero(img.id_producto));
                if (!idProducto) continue;

                const idVariante =
                    img.id_variante === null || img.id_variante === undefined
                        ? null
                        : mapaVariante.get(respaldoService.aEntero(img.id_variante)) ?? null;

                // Se recupera el archivo embebido si esta en almacenamiento local
                if (img.archivo && img.archivo.base64 && img.archivo.nombre) {
                    const nombre = path.basename(String(img.archivo.nombre));

                    if (/^[A-Za-z0-9._-]+$/.test(nombre) && !nombre.includes('..')) {
                        const destino = path.join(UPLOADS_DIR, nombre);

                        if (path.dirname(path.resolve(destino)) === path.resolve(UPLOADS_DIR)) {
                            if (!fs.existsSync(destino)) {
                                if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
                                fs.writeFileSync(destino, Buffer.from(img.archivo.base64, 'base64'));
                                imagenesRestauradas += 1;
                            }
                        }
                    }
                }

                const clave = claveImagen(idProducto, idVariante, img.imagen);
                const actual = mapaImagenes.get(clave);

                if (actual) {
                    await actual.update({ orden: Number(img.orden || 0) }, { transaction });
                } else {
                    await ProductoImagen.create(
                        {
                            id_producto: idProducto,
                            id_variante: idVariante,
                            imagen: img.imagen,
                            orden: Number(img.orden || 0),
                        },
                        { transaction }
                    );
                    imagenesCreadas += 1;
                }
            }

            /* --- eliminaciones (solo modo reemplazar) --- */
            let productosEliminados = 0;
            let variantesEliminadas = 0;
            let productosProtegidos = 0;
            let variantesProtegidas = 0;
            let productosAmbiguos = 0;

            if (modo === 'reemplazar') {
                const idsEnRespaldo = new Set(mapaProducto.values());

                for (const p of estado.productos) {
                    if (idsEnRespaldo.has(p.id_producto)) continue;
                    if (protegidos.productos.has(p.id_producto)) {
                        productosProtegidos += 1;
                        continue;
                    }
                    // Products that share a name and category cannot be told
                    // apart: they are kept so that nothing is deleted by mistake.
                    if (
                        clavesAmbiguas.has(
                            respaldoService.claveProducto(p.nombre, p.id_categoria)
                        )
                    ) {
                        productosAmbiguos += 1;
                        continue;
                    }
                    await Producto.destroy({ where: { id_producto: p.id_producto }, transaction });
                    productosEliminados += 1;
                }

                const idsVariantesEnRespaldo = new Set(mapaVariante.values());

                for (const v of estado.variantes) {
                    if (idsVariantesEnRespaldo.has(v.id_variante)) continue;
                    if (protegidos.variantes.has(v.id_variante)) {
                        variantesProtegidas += 1;
                        continue;
                    }
                    await ProductoVariante.destroy({ where: { id_variante: v.id_variante }, transaction });
                    variantesEliminadas += 1;
                }
            }

            // El stock del producto principal refleja la suma de sus variantes
            for (const idProducto of new Set(mapaProducto.values())) {
                const variantes = await ProductoVariante.findAll({
                    where: { id_producto: idProducto },
                    transaction,
                });
                if (variantes.length > 0) {
                    const total = variantes.reduce((s, v) => s + Number(v.stock || 0), 0);
                    await Producto.update({ stock: total }, { where: { id_producto: idProducto }, transaction });
                }
            }

            await transaction.commit();

            return res.status(200).json({
                ok: true,
                mensaje:
                    modo === 'reemplazar'
                        ? 'Inventario reemplazado correctamente.'
                        : 'Inventario restaurado y combinado correctamente.',
                modo,
                resultado: {
                    categorias: plan.categorias,
                    productos: plan.productos,
                    variantes: plan.variantes,
                    imagenes: plan.imagenes,
                    productosEliminados,
                    variantesEliminadas,
                    productosProtegidos,
                    variantesProtegidas,
                    productosAmbiguos,
                    imagenesCreadas,
                    imagenesRestauradas,
                },
                respaldoSeguridad: seguridad.nombre,
            });
        } catch (error) {
            await transaction.rollback();

            return res.status(500).json({
                ok: false,
                mensaje: `La restauracion fallo y se revirtio por completo. No quedo informacion a medias. (${error.message})`,
                respaldoSeguridad: seguridad.nombre,
            });
        }
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo restaurar el inventario: ${error.message}`,
        });
    }
};

/* =======================
   4. RESUMEN DEL INVENTARIO
======================= */

const obtenerResumen = async (req, res) => {
    try {
        const [productos, variantes] = await Promise.all([
            Producto.findAll(),
            ProductoVariante.findAll(),
        ]);

        const umbral = Number(req.query.umbral ?? 5);
        const productosConVariantes = new Set(variantes.map((v) => v.id_producto));

        let activos = 0;
        let stockBajo = 0;
        let agotados = 0;
        let unidades = 0;
        let unidadesSimples = 0;
        let unidadesVariantes = 0;
        let itemsBajo = 0;
        let itemsAgotados = 0;

        for (const p of productos) {
            if (!p.estado) continue;

            activos += 1;

            if (productosConVariantes.has(p.id_producto)) {
                // Producto con variantes: se cuentan las variantes, no el producto
                const propias = variantes.filter((v) => v.id_producto === p.id_producto);
                const total = propias.reduce((s, v) => s + Number(v.stock || 0), 0);

                unidadesVariantes += total;

                const propiasAgotadas = propias.filter((v) => Number(v.stock || 0) <= 0).length;

                itemsAgotados += propiasAgotadas;
                itemsBajo += propias.filter((v) => Number(v.stock || 0) > 0 && Number(v.stock || 0) <= umbral).length;

                if (total <= 0) agotados += 1;
                else if (total <= umbral) stockBajo += 1;
            } else {
                const stock = Number(p.stock || 0);

                unidadesSimples += stock;
                unidades += stock;

                if (stock <= 0) {
                    agotados += 1;
                    itemsAgotados += 1;
                } else if (stock <= umbral) {
                    stockBajo += 1;
                    itemsBajo += 1;
                }
            }
        }

        return res.status(200).json({
            ok: true,
            umbral,
            resumen: {
                productosActivos: activos,
                productosStockBajo: stockBajo,
                productosAgotados: agotados,
                unidadesDisponibles: unidadesSimples + unidadesVariantes,
                unidadesProductosSimples: unidadesSimples,
                unidadesVariantes: unidadesVariantes,
                itemsStockBajo: itemsBajo,
                itemsAgotados: itemsAgotados,
                itemsReposicion: itemsBajo + itemsAgotados,
                variantesTotales: variantes.length,
            },
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo calcular el resumen: ${error.message}`,
        });
    }
};

/* =======================
   5. AJUSTE DE STOCK
======================= */

const ajustarStock = async (req, res) => {
    try {
        const tipo = String(req.body.tipo || '').trim();

        if (!['entrada', 'salida', 'correccion'].includes(tipo)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El tipo de ajuste debe ser entrada, salida o correccion.',
            });
        }

        const idProducto = Number(req.body.id_producto);

        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return res.status(400).json({ ok: false, mensaje: 'El producto no es valido.' });
        }

        const producto = await Producto.findByPk(idProducto);

        if (!producto) {
            return res.status(404).json({ ok: false, mensaje: 'El producto no existe.' });
        }

        const motivo = String(req.body.motivo || '').trim();

        if (!motivo) {
            return res.status(400).json({ ok: false, mensaje: 'Indica el motivo del ajuste.' });
        }

        const cantidad = Number(req.body.cantidad);

        if (!Number.isInteger(cantidad) || cantidad < 0) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La cantidad debe ser un numero entero igual o mayor que cero.',
            });
        }

        const idVariante = req.body.id_variante ? Number(req.body.id_variante) : null;

        const transaction = await db.sequelizeInstance.transaction();

        try {
            let objetivo = null;
            let stockAnterior = 0;
            let stockNuevo = 0;
            let referencia = producto.nombre;

            if (idVariante) {
                if (!Number.isInteger(idVariante) || idVariante <= 0) {
                    await transaction.rollback();
                    return res.status(400).json({ ok: false, mensaje: 'La variante no es valida.' });
                }

                const variante = await ProductoVariante.findOne({
                    where: { id_variante: idVariante, id_producto: idProducto },
                    transaction,
                });

                if (!variante) {
                    await transaction.rollback();
                    return res.status(404).json({
                        ok: false,
                        mensaje: 'La variante no pertenece a ese producto.',
                    });
                }

                objetivo = variante;
                stockAnterior = Number(variante.stock || 0);
                referencia = `${producto.nombre} — ${variante.tono}`;
            } else {
                const variantes = await ProductoVariante.findAll({
                    where: { id_producto: idProducto },
                    transaction,
                });

                if (variantes.length > 0) {
                    await transaction.rollback();
                    return res.status(400).json({
                        ok: false,
                        mensaje:
                            'Este producto tiene variantes. Selecciona el tono concreto que quieres ajustar.',
                    });
                }

                objetivo = producto;
                stockAnterior = Number(producto.stock || 0);
            }

            if (tipo === 'entrada') {
                stockNuevo = stockAnterior + cantidad;
            } else if (tipo === 'salida') {
                stockNuevo = stockAnterior - cantidad;
            } else {
                stockNuevo = cantidad;
            }

            if (stockNuevo < 0) {
                await transaction.rollback();
                return res.status(400).json({
                    ok: false,
                    mensaje: `No se puede dejar el stock en negativo. Hay ${stockAnterior} unidad(es) disponibles.`,
                });
            }

            await objetivo.update({ stock: stockNuevo }, { transaction });

            // El stock del producto principal refleja la suma de sus variantes
            let stockProducto = stockNuevo;

            if (idVariante) {
                const variantes = await ProductoVariante.findAll({
                    where: { id_producto: idProducto },
                    transaction,
                });
                stockProducto = variantes.reduce((s, v) => s + Number(v.stock || 0), 0);
                await Producto.update(
                    { stock: stockProducto },
                    { where: { id_producto: idProducto }, transaction }
                );
            }

            await MovimientoInventario.create(
                {
                    tipo,
                    id_producto: idProducto,
                    id_variante: idVariante,
                    referencia,
                    cantidad,
                    stock_anterior: stockAnterior,
                    stock_nuevo: stockNuevo,
                    motivo,
                    id_administrador: req.user ? req.user.sub ?? null : null,
                    created_at: new Date(),
                },
                { transaction }
            );

            await transaction.commit();

            return res.status(200).json({
                ok: true,
                mensaje: `Ajuste registrado: ${referencia} paso de ${stockAnterior} a ${stockNuevo} unidad(es).`,
                stock_anterior: stockAnterior,
                stock_nuevo: stockNuevo,
                stock_producto: stockProducto,
                id_variante: idVariante,
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo registrar el ajuste: ${error.message}`,
        });
    }
};

/* =======================
   6. HISTORIAL DE MOVIMIENTOS
======================= */

const listarMovimientos = async (req, res) => {
    try {
        const limite = Math.min(Number(req.query.limite) || 50, 200);

        const movimientos = await MovimientoInventario.findAll({
            order: [['id_movimiento', 'DESC']],
            limit: limite,
        });

        res.status(200).json({
            ok: true,
            movimientos: movimientos.map((m) => ({
                id_movimiento: m.id_movimiento,
                tipo: m.tipo,
                id_producto: m.id_producto,
                id_variante: m.id_variante,
                referencia: m.referencia,
                cantidad: m.cantidad,
                stock_anterior: m.stock_anterior,
                stock_nuevo: m.stock_nuevo,
                motivo: m.motivo,
                id_administrador: m.id_administrador,
                created_at: m.created_at,
            })),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: `No se pudo leer el historial: ${error.message}`,
        });
    }
};

module.exports = {
    subirRespaldo,
    generarRespaldo,
    validarRespaldo,
    restaurarInventario,
    obtenerResumen,
    ajustarStock,
    listarMovimientos,
};
