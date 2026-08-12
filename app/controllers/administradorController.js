'use strict';

const bcrypt = require('bcrypt');

const db = require('../config/db');

const Administrador = db.administrador;

const FORMATO_IDENTIDAD = /^\d{4}-\d{4}-\d{5}$/;

const sanitizar = (admin) => ({
    id: admin.id_admin,
    nombre: admin.nombre,
    identidad: admin.identidad,
    correo: admin.correo,
    rolId: 1,
});

// Perfil del administrador autenticado
const obtenerPerfil = async (req, res) => {
    try {
        const admin = await Administrador.findByPk(req.user.sub);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: sanitizar(admin),
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Actualizar datos de usuario (nombre / identidad)
const actualizarPerfil = async (req, res) => {
    try {
        const { nombre, identidad } = req.body;

        if (!nombre || !String(nombre).trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El nombre es obligatorio',
            });
        }

        if (!identidad || !String(identidad).trim()) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El número de identidad es obligatorio',
            });
        }

        const identidadLimpia = String(identidad).trim();

        if (!FORMATO_IDENTIDAD.test(identidadLimpia)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El número de identidad debe tener el formato 0000-0000-00000',
            });
        }

        const admin = await Administrador.findByPk(req.user.sub);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        const duplicado = await Administrador.findOne({ where: { identidad: identidadLimpia } });

        if (duplicado && Number(duplicado.id_admin) !== Number(req.user.sub)) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Ese número de identidad ya está registrado',
            });
        }

        admin.nombre = String(nombre).trim();
        admin.identidad = identidadLimpia;

        await admin.save();

        res.status(200).json({
            ok: true,
            data: sanitizar(admin),
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Cambiar contraseña (verifica la actual antes de permitir el cambio)
const cambiarPassword = async (req, res) => {
    try {
        const { passwordActual, passwordNueva } = req.body;

        if (!passwordActual) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debes ingresar tu contraseña actual',
            });
        }

        if (!passwordNueva) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Debes ingresar la nueva contraseña',
            });
        }

        if (String(passwordNueva).length < 8) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La nueva contraseña debe tener al menos 8 caracteres',
            });
        }

        const admin = await Administrador.scope('withPassword').findByPk(req.user.sub);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        const valida = await bcrypt.compare(String(passwordActual), admin.password);

        if (!valida) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La contraseña actual es incorrecta',
            });
        }

        const igualActual = await bcrypt.compare(String(passwordNueva), admin.password);

        if (igualActual) {
            return res.status(400).json({
                ok: false,
                mensaje: 'La nueva contraseña no puede ser igual a la actual',
            });
        }

        admin.password = await bcrypt.hash(String(passwordNueva), 10);

        await admin.save();

        res.status(200).json({
            ok: true,
            mensaje: 'Contraseña actualizada correctamente',
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Gestión de administradores (solo rol administrador)

const obtenerAdministradores = async (req, res) => {
    try {
        const admins = await Administrador.findAll({
            order: [['id_admin', 'ASC']],
        });

        res.status(200).json({
            ok: true,
            data: admins.map(sanitizar),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const obtenerAdministrador = async (req, res) => {
    try {
        const admin = await Administrador.findByPk(req.params.id);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        res.status(200).json({
            ok: true,
            data: sanitizar(admin),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const crearAdministrador = async (req, res) => {
    try {
        const { nombre, identidad, correo, password } = req.body;

        if (!nombre || !identidad || !password) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Nombre, identidad y contraseña son obligatorios',
            });
        }

        const existe = await Administrador.findOne({ where: { identidad } });

        if (existe) {
            return res.status(400).json({
                ok: false,
                mensaje: 'El número de identidad ya está registrado',
            });
        }

        const hash = await bcrypt.hash(password, 10);

        const admin = await Administrador.create({
            nombre,
            identidad,
            correo,
            password: hash,
        });

        res.status(201).json({
            ok: true,
            mensaje: 'Administrador creado correctamente',
            data: sanitizar(admin),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const actualizarAdministrador = async (req, res) => {
    try {
        const admin = await Administrador.findByPk(req.params.id);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        const datos = { ...req.body };

        if (datos.password) {
            datos.password = await bcrypt.hash(datos.password, 10);
        }

        await admin.update(datos);

        res.status(200).json({
            ok: true,
            mensaje: 'Administrador actualizado correctamente',
            data: sanitizar(admin),
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

const eliminarAdministrador = async (req, res) => {
    try {
        const admin = await Administrador.findByPk(req.params.id);

        if (!admin) {
            return res.status(404).json({
                ok: false,
                mensaje: 'Administrador no encontrado',
            });
        }

        await admin.update({ estado: false });

        res.status(200).json({
            ok: true,
            mensaje: 'Administrador eliminado correctamente',
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    obtenerPerfil,
    actualizarPerfil,
    cambiarPassword,
    obtenerAdministradores,
    obtenerAdministrador,
    crearAdministrador,
    actualizarAdministrador,
    eliminarAdministrador,
};
