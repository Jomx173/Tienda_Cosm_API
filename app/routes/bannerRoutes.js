'use strict';

const express = require('express');
const bannerController = require('../controllers/bannerController');
const upload = require('../middlewares/upload');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.get('/', bannerController.obtenerBanners);
router.get('/:id', bannerController.obtenerBanner);

router.post('/', isAuth, role.isAdmin, upload.single('imagen'), bannerController.crearBanner);
router.put('/:id', isAuth, role.isAdmin, upload.single('imagen'), bannerController.actualizarBanner);
router.delete('/:id', isAuth, role.isAdmin, bannerController.eliminarBanner);

module.exports = router;
