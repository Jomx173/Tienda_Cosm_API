'use strict';

const Sequelize = require('sequelize');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// En local tiene prioridad .env.local (BD local de desarrollo).
// En Vercel no existe ese archivo, por lo que sigue comportandose igual.
const RUTA_ENV_LOCAL = path.join(__dirname, '..', '..', '.env.local');

if (fs.existsSync(RUTA_ENV_LOCAL)) {
    dotenv.config({ path: RUTA_ENV_LOCAL });
}

dotenv.config();

// SSL solo si el servidor lo pide explicitamente (Aiven en produccion).
const usarSSL = ['1', 'true', 'yes'].includes(
    String(process.env.DB_SSL ?? '1').toLowerCase()
);

const sequelizeInstance = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false,
        dialectOptions: usarSSL
            ? {
                ssl: {
                    require: true,
                    rejectUnauthorized: false,
                },
            }
            : {},
        pool: {
            max: parseInt(process.env.POOL_MAX) || 5,
            min: parseInt(process.env.POOL_MIN) || 0,
            acquire: parseInt(process.env.POOL_ACQUIRE) || 30000,
            idle: parseInt(process.env.POOL_IDLE) || 10000,
        },
    }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelizeInstance = sequelizeInstance;

// =======================
// MODELOS
// =======================

db.categoria = require('../models/categoriaModels')(sequelizeInstance);
db.producto = require('../models/productoModels')(sequelizeInstance);
db.productoVariante = require('../models/productoVarianteModels')(sequelizeInstance);
db.productoImagen = require('../models/productoImagenModels')(sequelizeInstance);
db.movimientoInventario = require('../models/movimientoInventarioModels')(sequelizeInstance);
db.banner = require('../models/bannerModels')(sequelizeInstance);
db.pedido = require('../models/pedidoModels')(sequelizeInstance);
db.detallepedido = require('../models/detallepedidoModels')(sequelizeInstance);
db.administrador = require('../models/administradorModels')(sequelizeInstance);

/* =======================
   CATEGORIA -> PRODUCTO
======================= */

db.categoria.hasMany(db.producto, {
    foreignKey: 'id_categoria',
    as: 'productos',
});

db.producto.belongsTo(db.categoria, {
    foreignKey: 'id_categoria',
    as: 'categoria',
});


/* =======================
   PEDIDO -> DETALLEPEDIDO
======================= */

db.pedido.hasMany(db.detallepedido, {
    foreignKey: 'id_pedido',
    as: 'detalles',
});

db.detallepedido.belongsTo(db.pedido, {
    foreignKey: 'id_pedido',
    as: 'pedido',
});

db.producto.hasMany(db.detallepedido, {
    foreignKey: 'id_producto',
    as: 'detallesPedido',
});

db.detallepedido.belongsTo(db.producto, {
    foreignKey: 'id_producto',
    as: 'producto',
});

/* =======================
   PRODUCTO -> VARIANTES / IMAGENES
   (Nuevas tablas. Producto, Pedido y detallepedido se mantienen intactos
    para conservar compatibilidad con los productos antiguos.)
======================= */

db.producto.hasMany(db.productoVariante, {
    foreignKey: 'id_producto',
    as: 'variantes',
    onDelete: 'CASCADE',
});

db.productoVariante.belongsTo(db.producto, {
    foreignKey: 'id_producto',
    as: 'producto',
});

db.producto.hasMany(db.productoImagen, {
    foreignKey: 'id_producto',
    as: 'imagenes',
    onDelete: 'CASCADE',
});

db.productoImagen.belongsTo(db.producto, {
    foreignKey: 'id_producto',
    as: 'producto',
});

db.productoVariante.hasMany(db.productoImagen, {
    foreignKey: 'id_variante',
    as: 'imagenes',
    onDelete: 'CASCADE',
});

db.productoImagen.belongsTo(db.productoVariante, {
    foreignKey: 'id_variante',
    as: 'variante',
});

// Relacion opcional detallepedido -> variante (los pedidos antiguos no la tienen)
db.productoVariante.hasMany(db.detallepedido, {
    foreignKey: 'id_variante',
    as: 'detalles',
    onDelete: 'SET NULL',
});

db.detallepedido.belongsTo(db.productoVariante, {
    foreignKey: 'id_variante',
    as: 'variante',
});

module.exports = db;
