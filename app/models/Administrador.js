const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Administrador = sequelize.define(
    "Administrador",
    {
        id_admin: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        identidad: {
            type: DataTypes.STRING(30),
            allowNull: false,
            unique: true,
        },
        correo: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        estado: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "Administrador",
        timestamps: false,
    }
);

module.exports = Administrador;