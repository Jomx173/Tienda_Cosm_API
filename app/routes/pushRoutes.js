'use strict';

const express = require('express');
const pushController = require('../controllers/pushController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

// Todas las rutas de push requieren autenticación y rol de administrador.
router.get('/clave', isAuth, role.isAdmin, pushController.obtenerClaveVapid);
router.post('/suscribir', isAuth, role.isAdmin, pushController.suscribir);
router.delete('/suscribir', isAuth, role.isAdmin, pushController.desuscribir);

module.exports = router;
