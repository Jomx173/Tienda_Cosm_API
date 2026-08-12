'use strict';

// Necesario para que Vercel empaquete el driver en el bundle serverless
require('mysql2');

const app = require('../app/app');

module.exports = app;
