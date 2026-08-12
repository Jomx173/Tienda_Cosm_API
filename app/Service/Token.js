'use strict';

const jwt = require('jwt-simple');
const moment = require('moment');

function createToken(userId, rolId) {
    const payload = {
        sub: userId,
        rolId: rolId,
        iat: moment().unix(),
        exp: moment().add(15, 'days').unix(),
    };

    return jwt.encode(payload, process.env.JWT_SECRET);
}

function decodeToken(token) {
    return new Promise((resolve, reject) => {
        try {
            const payload = jwt.decode(token, process.env.JWT_SECRET);

            if (payload.exp <= moment().unix()) {
                return reject({
                    status: 401,
                    message: 'Token expirado',
                });
            }

            resolve(payload);
        } catch (error) {
            reject({
                status: 401,
                message: 'Token inválido',
            });
        }
    });
}

module.exports = {
    createToken,
    decodeToken,
};
