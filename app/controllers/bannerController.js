'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../config/db');

const Banner = db.banner;

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Obtener todos los banners activos (o todos si se pide)
const obtenerBanners = async (req, res) => {
    try {
        const todos = req.query.todos === '1';
        const banners = await Banner.findAll({
            where: todos ? {} : { estado: true },
            order: [['orden', 'ASC'], ['id_banner', 'ASC']],
        });

        res.status(200).json({
            ok: true,
            data: banners,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Obtener un banner por ID
const obtenerBanner = async (req, res) => {
    try {
        const banner = await Banner.findByPk(req.params.id);

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Banner no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: banner,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Crear banner
const crearBanner = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = `/uploads/${req.file.filename}`;
        }

        const banner = await Banner.create(datos);

        res.status(201).json({
            ok: true,
            mensaje: 'Banner creado correctamente',
            data: banner,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar banner
const actualizarBanner = async (req, res) => {
    try {
        const datos = req.body;

        if (req.file) {
            datos.imagen = `/uploads/${req.file.filename}`;
        }

        const banner = await Banner.findByPk(req.params.id);

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Banner no encontrado',
            });
        }

        await banner.update(datos);

        res.status(200).json({
            ok: true,
            mensaje: 'Banner actualizado correctamente',
            data: banner,
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Eliminar banner (borrado físico)
const eliminarBanner = async (req, res) => {
    try {
        const banner = await Banner.findByPk(req.params.id);

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Banner no encontrado',
            });
        }

        await banner.destroy();

        if (banner.imagen) {
            const nombre = path.basename(String(banner.imagen).replace(/^\/uploads\//, ''));
            fs.unlink(path.join(UPLOADS_DIR, nombre), () => {});
        }

        res.status(200).json({
            ok: true,
            mensaje: 'Banner eliminado correctamente',
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    obtenerBanners,
    obtenerBanner,
    crearBanner,
    actualizarBanner,
    eliminarBanner,
};
