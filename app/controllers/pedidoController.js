'use strict';

const db = require('../config/db');

const Pedido = db.pedido;
const DetallePedido = db.detallepedido;
const Producto = db.producto;

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
        }

        const total = productos.reduce(
            (suma, item) => suma + Number(item.precio) * Number(item.cantidad),
            0
        );

        const transaction = await db.sequelizeInstance.transaction();

        try {
            for (const item of productos) {
                const productoExiste = await Producto.findByPk(
                    Number(item.id_producto),
                    { transaction }
                );

                if (!productoExiste) {
                    throw new Error(
                        `El producto con ID ${item.id_producto} no existe`
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

                await DetallePedido.create({
                    id_pedido: pedido.id_pedido,
                    id_producto: Number(item.id_producto),
                    cantidad,
                    precio,
                    subtotal,
                }, {
                    transaction,
                });
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
    try {
        const pedido = await Pedido.findByPk(req.params.id);

        if (!pedido) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Pedido no encontrado',
            });
        }

        await pedido.destroy();

        res.status(200).json({
            ok: true,
            mensaje: 'Pedido eliminado correctamente',
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
