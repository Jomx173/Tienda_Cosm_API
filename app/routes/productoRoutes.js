'use strict';

const express = require('express');
const productoController = require('../controllers/productoController');
const upload = require('../middlewares/upload');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/', productoController.obtenerProductos);
router.get('/duplicados', isAuth, role.isAdmin, productoController.buscarDuplicadosHandler);
router.get('/:id', productoController.obtenerProducto);

router.post('/', isAuth, role.isAdmin, upload.single('imagen'), productoController.crearProducto);
router.put('/:id', isAuth, role.isAdmin, upload.single('imagen'), productoController.actualizarProducto);
router.delete('/:id', isAuth, role.isAdmin, productoController.eliminarProducto);

/* =======================
   VARIANTES (tonos)
======================= */

router.post('/:id/variantes', isAuth, role.isAdmin, productoController.crearVariante);
router.put('/variantes/:idVariante', isAuth, role.isAdmin, productoController.actualizarVariante);
router.delete('/variantes/:idVariante', isAuth, role.isAdmin, productoController.eliminarVariante);

/* =======================
   IMAGENES (galería)
======================= */

router.post(
    '/:id/imagenes',
    isAuth,
    role.isAdmin,
    upload.array('imagenes', 12),
    productoController.subirImagenes
);

router.delete('/imagenes/:idImagen', isAuth, role.isAdmin, productoController.eliminarImagen);

module.exports = router;
