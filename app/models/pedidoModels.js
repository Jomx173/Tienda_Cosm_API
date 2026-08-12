'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Pedido = sequelize.define('Pedido', {
        id_pedido: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        nombre_cliente: {
            type: DataTypes.STRING(150),
            allowNull: true,
        },
        telefono_cliente: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        direccion: {
            type: DataTypes.STRING(300),
            allowNull: true,
        },
        productos: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        total: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        estado: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'pendiente',
        },
        fecha: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'Pedido',
        timestamps: false,
    });

    return Pedido;
};
