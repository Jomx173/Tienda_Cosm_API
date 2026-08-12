'use strict';

const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'md/productos',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'jfif'],
        transformation: [{ width: 1200, crop: 'limit' }],
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
