'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const ProductoImagen = sequelize.define('ProductoImagen', {
        id_imagen: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        id_producto: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        id_variante: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        imagen: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        orden: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
    }, {
        tableName: 'producto_imagen',
        timestamps: false,
    });

    return ProductoImagen;
};
