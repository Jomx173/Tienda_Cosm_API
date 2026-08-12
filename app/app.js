'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Archivos subidos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================
// RUTAS
// ======================

const productoRoutes = require('./routes/productoRoutes');
app.use('/api/productos', productoRoutes);

const categoriaRoutes = require('./routes/categoriaRoutes');
app.use('/api/categorias', categoriaRoutes);

const bannerRoutes = require('./routes/bannerRoutes');
app.use('/api/banners', bannerRoutes);

const pedidoRoutes = require('./routes/pedidoRoutes');
app.use('/api/pedidos', pedidoRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const administradorRoutes = require('./routes/administradorRoutes');
app.use('/api/administradores', administradorRoutes);

// Manejo de errores en JSON (subidas de multer, etc.)
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const estatus = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;

    res.status(estatus).json({
        ok: false,
        mensaje:
            err.code === 'LIMIT_FILE_SIZE'
                ? 'La imagen supera el tamaño máximo de 5 MB.'
                : err.message || 'Error al procesar la solicitud.',
    });
});

// Servir la web compilada (si existe el build de Vite)
const WEB_DIST = path.join(__dirname, '..', 'Web', 'dist');

if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));

    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
        res.sendFile(path.join(WEB_DIST, 'index.html'));
    });

    console.log('✅ Sirviendo la web desde /Web/dist');
}

module.exports = app;
