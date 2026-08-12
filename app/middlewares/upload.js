'use strict';

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const nombre = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${nombre}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const permitidos = /jpeg|jpg|jpe|jfif|png|gif|webp/;
    const esValido = permitidos.test(path.extname(file.originalname).toLowerCase());
    cb(
        esValido ? null : new Error('Formato de imagen no soportado. Usa JPG, PNG, GIF, WEBP o JFIF.'),
        esValido
    );
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
