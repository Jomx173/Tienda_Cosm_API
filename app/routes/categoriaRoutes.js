'use strict';

const express = require('express');
const categoriaController = require('../controllers/categoriaController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/', categoriaController.obtenerCategorias);
router.get('/:id', categoriaController.obtenerCategoria);

router.post('/', isAuth, role.isAdmin, categoriaController.crearCategoria);
router.put('/:id', isAuth, role.isAdmin, categoriaController.actualizarCategoria);
router.delete('/:id', isAuth, role.isAdmin, categoriaController.eliminarCategoria);

module.exports = router;
