'use strict';

const express = require('express');
const productoController = require('../Controllers/productoController');
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

module.exports = router;
