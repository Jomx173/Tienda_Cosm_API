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

// Borra del disco los archivos que multer ya escribio pero que se rechazan
// despues (por ejemplo, por superar el maximo de 8). Sin esto quedarian
// archivos huerfanos en uploads/.
const descartarArchivos = (...grupos) => {
    for (const grupo of grupos) {
        if (!grupo) continue;

        const lista = Array.isArray(grupo) ? grupo : [grupo];

        for (const archivo of lista) {
            const ruta = archivo && archivo.path;

            // Solo rutas locales; las URLs de Cloudinary no viven en disco.
            if (ruta && !/^https?:\/\//i.test(ruta)) {
                try {
                    fs.unlinkSync(ruta);
                } catch {
                    // El archivo puede no existir: no hay nada que limpiar.
                }
            }
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

    productosUpload: (req, res, next) =>
        upload.fields([
            { name: 'imagenes', maxCount: 8 },
            { name: 'imagen', maxCount: 8 },
        ])(req, res, (err) => {
            if (err) return next(err);

            // Máximo 8 fotos por producto en total (la galería acepta hasta 8)
            const total =
                (req.files?.imagenes?.length || 0) + (req.files?.imagen?.length || 0);
            if (total > 8) {
                // multer ya escribió los archivos: hay que borrarlos para no
                // dejar archivos huérfanos en uploads/.
                descartarArchivos(req.files?.imagenes, req.files?.imagen);

                return next(
                    Object.assign(
                        new Error('Se superó el número máximo de imágenes permitidas (máximo 8).'),
                        { code: 'LIMIT_FILE_COUNT' }
                    )
                );
            }

            if (req.files) {
                if (req.files.imagenes) normalizarArchivos(req.files.imagenes);
                if (req.files.imagen) normalizarArchivos(req.files.imagen);
            }
            if (req.file) {
                normalizarArchivos(req.file);
            }
            next();
        }),
};
