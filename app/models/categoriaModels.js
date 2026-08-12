'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Categoria = sequelize.define('Categoria', {
        id_categoria: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        descripcion: {
            type: DataTypes.TEXT,
        },
        estado: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    }, {
        tableName: 'Categoria',
        timestamps: false,
    });

    return Categoria;
};
