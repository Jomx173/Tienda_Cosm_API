'use strict';

const Sequelize = require('sequelize');
require('dotenv').config();

const sequelizeInstance = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false,
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false,
            },
        },
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

module.exports = db;
