'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

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

const inventarioRoutes = require('./routes/inventarioRoutes');
app.use('/api/inventario', inventarioRoutes);

// Manejo de errores en JSON (subidas de multer, tamaño excedido, etc.)
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    let estatus = 400;
    let mensaje = err.message || 'Error al procesar la solicitud.';

    if (err.code === 'LIMIT_FILE_SIZE') {
        estatus = 413;
        mensaje = 'Una de las imágenes supera el tamaño máximo de 10 MB.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
        estatus = 400;
        mensaje = 'Se superó el número máximo de imágenes permitidas (máximo 8).';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        estatus = 400;
        mensaje = 'Campo de archivo no esperado o exceso de imágenes.';
    }

    res.status(estatus).json({
        ok: false,
        mensaje,
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
