const Banner = require("../models/Banner");

// Obtener todos los banners activos (o todos si se pide)
const obtenerBanners = async (todos = false) => {
    return await Banner.findAll({
        where: todos ? {} : { estado: true },
        order: [["orden", "ASC"], ["id_banner", "ASC"]],
    });
};

// Obtener un banner por ID
const obtenerBanner = async (id) => {
    return await Banner.findByPk(id);
};

// Crear un banner
const crearBanner = async (datos) => {
    return await Banner.create(datos);
};

// Actualizar un banner
const actualizarBanner = async (id, datos) => {
    const banner = await Banner.findByPk(id);

    if (!banner) {
        return null;
    }

    await banner.update(datos);
    return banner;
};

// Eliminar un banner (baja lógica)
const eliminarBanner = async (id) => {
    const banner = await Banner.findByPk(id);

    if (!banner) {
        return null;
    }

    await banner.update({ estado: false });
    return banner;
};

module.exports = {
    obtenerBanners,
    obtenerBanner,
    crearBanner,
    actualizarBanner,
    eliminarBanner,
};
