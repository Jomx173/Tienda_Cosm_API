'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const DetallePedido = sequelize.define('DetallePedido', {
        id_detalle: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_pedido: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        id_producto: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        // Nuevos campos: las filas antiguas quedan con NULL, sin romper nada.
        id_variante: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        tono: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        // Copia del color y del nombre al momento de la compra. Las filas
        // antiguas quedan en NULL y se muestran como "No aplica".
        color: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        nombre: {
            type: DataTypes.STRING(150),
            allowNull: true,
        },
        imagen: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        codigo: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        cantidad: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        precio: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        subtotal: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
    }, {
        tableName: 'detallepedido',
        timestamps: false,
    });

    return DetallePedido;
};
