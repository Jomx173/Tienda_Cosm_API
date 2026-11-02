'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PushSuscripcion = sequelize.define('PushSuscripcion', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true,
        },
        id_administrador: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            references: {
                model: 'Administrador',
                key: 'id_admin',
            },
            onDelete: 'CASCADE',
        },
        endpoint: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        endpoint_hash: {
            type: DataTypes.CHAR(64), // SHA-256 del endpoint (índice único, sin límite de longitud)
            allowNull: false,
        },
        p256dh: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        auth: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        user_agent: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        created_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'push_suscripcion',
        timestamps: false, // las columnas de fecha se gestionan explícitamente
    });

    return PushSuscripcion;
};
