'use strict';

const bcrypt = require('bcrypt');

const db = require('./app/config/db');
const app = require('./app/app');

const PORT = process.env.PORT || 3000;

// Categorías por defecto
const CATEGORIAS_DEFECTO = [
    { nombre: 'Maquillaje', descripcion: 'Labiales, sombras, brochas y más' },
    { nombre: 'Perfumes', descripcion: 'Fragancias para hombre y mujer' },
    { nombre: 'Joyería', descripcion: 'Cadenas, collares y accesorios' },
    { nombre: 'Ofertas', descripcion: 'Productos con descuento especial' },
    { nombre: 'Cuidado Personal', descripcion: 'Cremas, serums y mascarillas' },
];

// Banners por defecto
const BANNERS_DEFECTO = [
    {
        titulo: 'Maquillaje Profesional',
        descripcion: 'Resalta tu belleza con nuestra colección exclusiva.',
        boton: 'Ver productos',
        imagen: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&auto=format&fit=crop&q=80',
        orden: 1,
    },
    {
        titulo: 'Perfumes',
        descripcion: 'Fragancias para cada momento especial.',
        boton: 'Ver colección',
        imagen: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=1200&auto=format&fit=crop&q=80',
        orden: 2,
    },
    {
        titulo: 'Cuidado Personal',
        descripcion: 'Productos que cuidan tu piel todos los días.',
        boton: 'Explorar',
        imagen: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=1200&auto=format&fit=crop&q=80',
        orden: 3,
    },
    {
        titulo: 'Ofertas Especiales',
        descripcion: 'Aprovecha nuestros descuentos por tiempo limitado.',
        boton: 'Ver ofertas',
        imagen: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&auto=format&fit=crop&q=80',
        orden: 4,
    },
];

// Seed: categorías, banners y administrador por defecto
const seed = async () => {
    for (const cat of CATEGORIAS_DEFECTO) {
        const existe = await db.categoria.findOne({ where: { nombre: cat.nombre } });

        if (!existe) {
            await db.categoria.create(cat);
            console.log(`✅ Categoría creada: ${cat.nombre}`);
        }
    }

    for (const banner of BANNERS_DEFECTO) {
        const existe = await db.banner.findOne({ where: { titulo: banner.titulo } });

        if (!existe) {
            await db.banner.create(banner);
            console.log(`✅ Banner creado: ${banner.titulo}`);
        }
    }

    let admin = await db.administrador
        .scope('withPassword')
        .findOne({ where: { identidad: '0801-1990-12345' } });

    if (!admin) {
        admin = await db.administrador
            .scope('withPassword')
            .findOne({ where: { correo: 'admin@cosmeticos.com' } });
    }

    if (!admin) {
        const hash = await bcrypt.hash('admin123', 10);

        await db.administrador.create({
            nombre: 'Administrador',
            identidad: '0801-1990-12345',
            correo: 'admin@cosmeticos.com',
            password: hash,
        });

        console.log('✅ Administrador creado: identidad 0801-1990-12345 / admin123');
    } else {
        let cambios = false;

        if (!admin.identidad) {
            admin.identidad = '0801-1990-12345';
            cambios = true;
        }

        if (!admin.password.startsWith('$2')) {
            admin.password = await bcrypt.hash('admin123', 10);
            cambios = true;
        }

        if (cambios) {
            await admin.save();
            console.log('✅ Administrador actualizado: identidad 0801-1990-12345 / admin123');
        }
    }
};

// Sincronizar modelos con la base de datos
db.sequelizeInstance.sync()
    .then(() => {
        console.log('✅ Tablas sincronizadas correctamente.');
        return seed();
    })
    .then(() => {
        console.log('✅ Datos iniciales listos.');
    })
    .catch((error) => {
        console.error('❌ Error al sincronizar la base de datos:', error.message);
    });

// Iniciar servidor
app.listen(parseInt(PORT), (error) => {
    if (error) return console.error(error);
    console.log(`✅ Servidor ejecutándose en http://localhost:${PORT}`);
});
