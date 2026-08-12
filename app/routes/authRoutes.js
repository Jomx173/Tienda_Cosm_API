'use strict';

const express = require('express');
const authController = require('../Controllers/authController');
const isAuth = require('../middlewares/auth');
const role = require('../middlewares/role');

const router = express.Router();

router.post('/login', authController.login);
router.post('/register', isAuth, role.isAdmin, authController.register);

module.exports = router;
