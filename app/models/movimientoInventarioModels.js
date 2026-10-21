'use strict';

const { DataTypes } = require('sequelize');

/**
 * Historial de movimientos de inventario.
 *
 * Tabla nueva (movimiento_inventario) creada por sequelize.sync(), por lo que
 * es aditiva: no modifica ni reinicia ninguna tabla existente.
 *
 * Se guardan los tres tipos de ajuste manual:
 *   - entrada    : se suman unidades
 *   - salida     : se restan unidades
 *   - correccion : el stock se fija a un valor (conteo fisico)
 *
 * No se declaran referencias (foreign keys) hacia Producto/ProductoVariante
 * para que el historial sobreviva a un reemplazo de inventario y nunca
 * bloquee el borrado de productos.
 */
module.exports = (sequelize) => {
    const MovimientoInventario = sequelize.define(
        'MovimientoInventario',
        {
            id_movimiento: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            tipo: {
                type: DataTypes.STRING(20),
                allowNull: false,
            },
            id_producto: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            id_variante: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            /** Tono o referencia legible del producto/variante afectado */
            referencia: {
                type: DataTypes.STRING(160),
                allowNull: true,
            },
            /** Cantidad aplicada (positiva). En correccion es el valor final. */
            cantidad: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            stock_anterior: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            stock_nuevo: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            motivo: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            id_administrador: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: DataTypes.NOW,
            },
        },
        {
            tableName: 'movimiento_inventario',
            timestamps: false,
        }
    );

    return MovimientoInventario;
};
