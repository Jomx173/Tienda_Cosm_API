const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const Administrador = require("../models/Administrador");

// Registrar un nuevo administrador
const registrar = async (datos) => {
    const { nombre, identidad, correo, password } = datos;

    const existe = await Administrador.findOne({ where: { identidad } });

    if (existe) {
        throw new Error("El número de identidad ya está registrado");
    }

    const hash = await bcrypt.hash(password, 10);

    return await Administrador.create({
        nombre,
        identidad,
        correo,
        password: hash,
    });
};

// Iniciar sesión
const iniciarSesion = async (identidad, password) => {
    const admin = await Administrador.findOne({ where: { identidad } });

    if (!admin) {
        throw new Error("Identidad o contraseña incorrectos");
    }

    const valido = await bcrypt.compare(password, admin.password);

    if (!valido) {
        throw new Error("Identidad o contraseña incorrectos");
    }

    const token = jwt.sign(
        { id: admin.id_admin, nombre: admin.nombre, identidad: admin.identidad },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

    return {
        token,
        admin: {
            id: admin.id_admin,
            nombre: admin.nombre,
            identidad: admin.identidad,
            correo: admin.correo,
        },
    };
};

module.exports = {
    registrar,
    iniciarSesion,
};
