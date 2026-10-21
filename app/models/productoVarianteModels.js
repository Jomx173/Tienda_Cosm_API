'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ProductoVariante = sequelize.define('ProductoVariante', {
        id_variante: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_producto: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        tono: {
            type: DataTypes.STRING(80),
            allowNull: false,
        },
        color: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        precio: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        precio_anterior: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        stock: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        codigo: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        orden: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        estado: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        tableName: 'producto_variante',
        timestamps: false,
    });

    return ProductoVariante;
};
