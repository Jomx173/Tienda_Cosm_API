'use strict';

const express = require('express');
const pedidoController = require('../controllers/pedidoController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.post('/', pedidoController.crearPedido);

router.get('/', isAuth, role.isAdmin, pedidoController.obtenerPedidos);
router.get('/:id', isAuth, role.isAdmin, pedidoController.obtenerPedido);
router.put('/:id/estado', isAuth, role.isAdmin, pedidoController.actualizarEstadoPedido);
router.delete('/:id', isAuth, role.isAdmin, pedidoController.eliminarPedido);

module.exports = router;
