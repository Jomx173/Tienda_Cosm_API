'use strict';

const express = require('express');
const administradorController = require('../Controllers/administradorController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/me', isAuth, administradorController.obtenerPerfil);
router.put('/me', isAuth, administradorController.actualizarPerfil);
router.put('/me/password', isAuth, administradorController.cambiarPassword);

router.get('/', isAuth, role.isAdmin, administradorController.obtenerAdministradores);
router.get('/:id', isAuth, role.isAdmin, administradorController.obtenerAdministrador);
router.post('/', isAuth, role.isAdmin, administradorController.crearAdministrador);
router.put('/:id', isAuth, role.isAdmin, administradorController.actualizarAdministrador);
router.delete('/:id', isAuth, role.isAdmin, administradorController.eliminarAdministrador);

module.exports = router;
