'use strict';

const express = require('express');

const inventarioController = require('../controllers/inventarioController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

/* =======================
   COPIAS DE SEGURIDAD
======================= */

// Descarga el inventario actual en formato JSON
router.get(
    '/respaldo',
    isAuth,
    role.isAdmin,
    inventarioController.generarRespaldo
);

// Valida un archivo de respaldo y muestra el plan (sin tocar la base de datos)
router.post(
    '/respaldo/validar',
    isAuth,
    role.isAdmin,
    inventarioController.subirRespaldo.single('respaldo'),
    inventarioController.validarRespaldo
);

// Restaura el inventario desde un archivo de respaldo
router.post(
    '/restaurar',
    isAuth,
    role.isAdmin,
    inventarioController.subirRespaldo.single('respaldo'),
    inventarioController.restaurarInventario
);

/* =======================
   INVENTARIO Y STOCK
======================= */

// Resumen de indicadores
router.get('/resumen', isAuth, role.isAdmin, inventarioController.obtenerResumen);

// Historial de movimientos
router.get('/movimientos', isAuth, role.isAdmin, inventarioController.listarMovimientos);

// Ajuste manual de stock
router.post('/ajuste', isAuth, role.isAdmin, inventarioController.ajustarStock);

/* =======================
   ERRORES DE SUBIDA (tamaño / tipo de archivo)
======================= */

router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            ok: false,
            mensaje: 'El archivo de respaldo supera el tamaño máximo permitido (40 MB).',
        });
    }

    return res.status(400).json({
        ok: false,
        mensaje: err.message || 'No se pudo procesar el archivo de respaldo.',
    });
});

module.exports = router;
