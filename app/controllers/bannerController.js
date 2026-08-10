const bannerService = require("../Service/bannerService");

// Obtener todos los banners
const obtenerBanners = async (req, res) => {
    try {
        const todos = req.query.todos === "1";
        const banners = await bannerService.obtenerBanners(todos);

        res.status(200).json({
            ok: true,
            data: banners
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Obtener un banner por ID
const obtenerBanner = async (req, res) => {
    try {
        const banner = await bannerService.obtenerBanner(req.params.id);

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: "Banner no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            data: banner
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
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

        const banner = await bannerService.crearBanner(datos);

        res.status(201).json({
            ok: true,
            mensaje: "Banner creado correctamente",
            data: banner
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
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

        const banner = await bannerService.actualizarBanner(
            req.params.id,
            datos
        );

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: "Banner no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Banner actualizado correctamente",
            data: banner
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

// Eliminar banner
const eliminarBanner = async (req, res) => {
    try {
        const banner = await bannerService.eliminarBanner(req.params.id);

        if (!banner) {
            return res.status(404).json({
                ok: false,
                mensaje: "Banner no encontrado"
            });
        }

        res.status(200).json({
            ok: true,
            mensaje: "Banner eliminado correctamente"
        });

    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message
        });
    }
};

module.exports = {
    obtenerBanners,
    obtenerBanner,
    crearBanner,
    actualizarBanner,
    eliminarBanner
};
