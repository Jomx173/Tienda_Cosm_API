'use strict';

const bcrypt = require('bcrypt');

const db = require('../config/db');
const tokenService = require('../Service/Token');

const Administrador = db.administrador;

// Iniciar sesión
const login = async (req, res) => {
    try {
        const { identidad, password } = req.body;

        if (!identidad || !password) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Número de identidad y contraseña son obligatorios',
            });
        }

        const admin = await Administrador.scope('withPassword').findOne({
            where: { identidad },
        });

        if (!admin) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Identidad o contraseña incorrectos',
            });
        }

        const valido = await bcrypt.compare(password, admin.password);

        if (!valido) {
            return res.status(400).json({
                ok: false,
                mensaje: 'Identidad o contraseña incorrectos',
            });
        }

        const token = tokenService.createToken(admin.id_admin, 1);

        res.status(200).json({
            ok: true,
            data: {
                token,
                admin: {
                    id: admin.id_admin,
                    nombre: admin.nombre,
                    identidad: admin.identidad,
                    correo: admin.correo,
                    rolId: 1,
                },
            },
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

// Registrar administrador
const register = async (req, res) => {
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
            data: admin,
        });
    } catch (error) {
        res.status(400).json({
            ok: false,
            mensaje: error.message,
        });
    }
};

module.exports = {
    login,
    register,
};
