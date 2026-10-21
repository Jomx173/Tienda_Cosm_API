'use strict';

const db = require('../config/db');

const Pedido = db.pedido;
const DetallePedido = db.detallepedido;
const Producto = db.producto;
const ProductoVariante = db.productoVariante;
const { recalcularStockProducto } = require('./productoController');

const formatearPedido = (pedido) => ({
    ...pedido.toJSON(),
    productos: pedido.productos ? JSON.parse(pedido.productos) : [],
});

// Obtener todos los pedidos (más recientes primero)
const obtenerPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.findAll({
            order: [['id_pedido', 'DESC']],
        });

        res.status(200).json({
            ok: true,
            data: pedidos.map(formatearPedido),
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
        const pedido = await Pedido.findByPk(req.params.id);

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Pedido no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: formatearPedido(pedido),
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
                mensaje: 'El pedido debe incluir al menos un producto',
            });
        }

        if (datos.nombre_cliente && !/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ' ]+$/.test(datos.nombre_cliente)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El nombre solo puede contener letras',
            });
        }

        if (datos.telefono_cliente && !/^[0-9+()\- ]+$/.test(datos.telefono_cliente)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El teléfono solo puede contener números',
            });
        }

        if (!datos.direccion || !datos.direccion.trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La dirección es obligatoria',
            });
        }

        if (datos.direccion.length > 300) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La dirección es demasiado larga',
            });
        }

        const productos = datos.productos;

        for (const item of productos) {
            const idProducto = Number(item.id_producto);
            const cantidad = Number(item.cantidad);
            const precio = Number(item.precio);

            if (!Number.isInteger(idProducto) || idProducto <= 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'Uno o más productos tienen un ID inválido',
                });
            }

            if (!Number.isInteger(cantidad) || cantidad <= 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'La cantidad de un producto no es válida',
                });
            }

            if (!Number.isFinite(precio) || precio < 0) {
                return res.status(400).json({
                    ok: false,
                    mensaje: 'El precio de un producto no es válido',
                });
            }

            if (item.id_variante !== undefined && item.id_variante !== null && item.id_variante !== '') {
                const idVariante = Number(item.id_variante);

                if (!Number.isInteger(idVariante) || idVariante <= 0) {
                    return res.status(400).json({
                        ok: false,
                        mensaje: 'Una o más variantes tienen un ID inválido',
                    });
                }
            }
        }

        const total = productos.reduce(
            (suma, item) => suma + Number(item.precio) * Number(item.cantidad),
            0
        );

        const transaction = await db.sequelizeInstance.transaction();

        try {
            const productosAfectados = new Set();

            for (const item of productos) {
                const idProducto = Number(item.id_producto);
                const cantidad = Number(item.cantidad);

                const productoExiste = await Producto.findByPk(idProducto, { transaction });

                if (!productoExiste) {
                    throw new Error(
                        `El producto con ID ${item.id_producto} no existe`
                    );
                }

                const idVariante =
                    item.id_variante === undefined || item.id_variante === null || item.id_variante === ''
                        ? null
                        : Number(item.id_variante);

                if (idVariante) {
                    const variante = await ProductoVariante.findOne({
                        where: { id_variante: idVariante, id_producto: idProducto },
                        transaction,
                    });

                    if (!variante) {
                        throw new Error(
                            `El tono seleccionado del producto "${productoExiste.nombre}" ya no está disponible`
                        );
                    }

                    if (Number(variante.stock) < cantidad) {
                        throw new Error(
                            `Solo quedan ${Number(variante.stock)} unidad(es) del tono "${variante.tono}"`
                        );
                    }

                    // Reservar inventario de la variante seleccionada
                    await variante.update(
                        { stock: Number(variante.stock) - cantidad },
                        { transaction }
                    );

                    item.tono = variante.tono;
                    item.codigo = variante.codigo || productoExiste.codigo || '';
                    productosAfectados.add(idProducto);
                } else {
                    if (Number(productoExiste.stock) < cantidad) {
                        throw new Error(
                            `Solo quedan ${Number(productoExiste.stock)} unidad(es) de "${productoExiste.nombre}"`
                        );
                    }

                    await productoExiste.update(
                        { stock: Number(productoExiste.stock) - cantidad },
                        { transaction }
                    );
                }
            }

            const pedido = await Pedido.create({
                nombre_cliente: datos.nombre_cliente || '',
                telefono_cliente: datos.telefono_cliente || '',
                direccion: datos.direccion || '',
                productos: JSON.stringify(productos),
                total,
                estado: 'pendiente',
            }, {
                transaction,
            });

            for (const item of productos) {
                const cantidad = Number(item.cantidad);
                const precio = Number(item.precio);
                const subtotal = precio * cantidad;
                const idVariante =
                    item.id_variante === undefined || item.id_variante === null || item.id_variante === ''
                        ? null
                        : Number(item.id_variante);

                await DetallePedido.create({
                    id_pedido: pedido.id_pedido,
                    id_producto: Number(item.id_producto),
                    id_variante: idVariante,
                    tono: item.tono || null,
                    codigo: item.codigo || null,
                    cantidad,
                    precio,
                    subtotal,
                }, {
                    transaction,
                });
            }

            // El stock del producto principal refleja la suma de sus variantes
            for (const idProducto of productosAfectados) {
                await recalcularStockProducto(idProducto, transaction);
            }

            await transaction.commit();

            res.status(201).json({
                ok: true,
                mensaje: 'Pedido creado correctamente',
                data: formatearPedido(pedido),
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
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
                mensaje: 'El estado es obligatorio',
            });
        }

        const pedido = await Pedido.findByPk(req.params.id);

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Pedido no encontrado',
            });
        }

        await pedido.update({ estado });

        res.status(200).json({
            ok: true,
            mensaje: 'Estado del pedido actualizado',
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
    const transaction = await db.sequelizeInstance.transaction();

    try {
        const pedido = await Pedido.findByPk(req.params.id, {
            transaction,
        });

        if (!pedido) {
            await transaction.rollback();
            return res.status(404).json({
                ok: false,
                mensaje: 'Pedido no encontrado',
            });
        }

        await DetallePedido.destroy({
            where: {
                id_pedido: pedido.id_pedido,
            },
            transaction,
        });

        await pedido.destroy({
            transaction,
        });

        await transaction.commit();

        res.status(200).json({
            ok: true,
            mensaje: 'Pedido eliminado correctamente',
        });
    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }

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
