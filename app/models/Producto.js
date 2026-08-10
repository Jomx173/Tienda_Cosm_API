const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Producto = sequelize.define(
    "Producto",
    {
        id_producto: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        nombre: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        descripcion: {
            type: DataTypes.TEXT,
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
        },
        codigo: {
            type: DataTypes.STRING(80),
            allowNull: true,
        },
        subcategoria: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        destacado: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        imagen: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        estado: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        id_categoria: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    },
    {
        tableName: "Producto",
        timestamps: false,
    }
);

module.exports = Producto;