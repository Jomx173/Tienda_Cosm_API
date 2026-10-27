'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// En desarrollo se guardan en disco (UPLOAD_STORAGE=local).
// En produccion (Vercel) sigue usando Cloudinary, igual que siempre.
const usarLocal =
    String(process.env.UPLOAD_STORAGE || '').toLowerCase() === 'local' ||
    !process.env.CLOUDINARY_CLOUD_NAME;

const fileFilter = (req, file, cb) => {
    const permitidos = /jpeg|jpg|jpe|jfif|png|gif|webp/;
    const esValido = permitidos.test(path.extname(file.originalname).toLowerCase());
    cb(
        esValido ? null : new Error('Formato de imagen no soportado. Usa JPG, PNG, GIF, WEBP o JFIF.'),
        esValido
    );
};

let storage;

if (usarLocal) {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => {
            const limpio = path
                .basename(file.originalname, path.extname(file.originalname))
                .replace(/[^a-zA-Z0-9-_]/g, '')
                .slice(0, 40);

            cb(
                null,
                `${Date.now()}-${Math.round(Math.random() * 1e9)}${limpio ? `-${limpio}` : ''}${path.extname(file.originalname).toLowerCase()}`
            );
        },
    });
} else {
    const cloudinary = require('../config/cloudinary');
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder: 'md/productos',
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'jfif'],
            transformation: [{ width: 1200, crop: 'limit' }],
        },
    });
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
});

// En local multer devuelve una ruta absoluta del sistema de archivos
// (C:\...\uploads\x.png). Se normaliza a una URL relativa /uploads/x.png
// para que el frontend (rutaImagen) la resuelva contra el origen de la API.
// Con Cloudinary la ruta ya es una URL https y no se toca.
const normalizarArchivos = (archivos) => {
    if (!archivos) return;

    const lista = Array.isArray(archivos) ? archivos : [archivos];

    for (const archivo of lista) {
        if (archivo && archivo.path && !/^https?:\/\//i.test(archivo.path)) {
            archivo.path = `/uploads/${path.basename(archivo.path)}`;
        }
    }
};

module.exports = {
    single: (campo) => (req, res, next) =>
        upload.single(campo)(req, res, (err) => {
            if (err) return next(err);
            normalizarArchivos(req.file);
            next();
        }),

    array: (campo, maximo) => (req, res, next) =>
        upload.array(campo, maximo)(req, res, (err) => {
            if (err) return next(err);
            normalizarArchivos(req.files);
            next();
        }),
};
