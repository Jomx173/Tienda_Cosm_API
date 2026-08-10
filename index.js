const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");

const sequelize = require("./app/config/db");
const Categoria = require("./app/models/Categoria");
const Producto = require("./app/models/Producto");
const Administrador = require("./app/models/Administrador");
const Banner = require("./app/models/Banner");
const Pedido = require("./app/models/Pedido");

require("dotenv").config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Archivos subidos
app.use("/uploads", express.static(path.join(__dirname, "app", "uploads")));

// Asociaciones
Categoria.hasMany(Producto, { foreignKey: "id_categoria", as: "productos" });
Producto.belongsTo(Categoria, { foreignKey: "id_categoria", as: "categoria" });

// Importar rutas
const productoRoutes = require("./app/routes/productoRoutes");
const categoriaRoutes = require("./app/routes/categoriaRoutes");
const administradorRoutes = require("./app/routes/administradorRoutes");
const authRoutes = require("./app/routes/authRoutes");
const bannerRoutes = require("./app/routes/bannerRoutes");
const pedidoRoutes = require("./app/routes/pedidoRoutes");

// Rutas de la API
app.use("/api/productos", productoRoutes);
app.use("/api/categorias", categoriaRoutes);
app.use("/api/administradores", administradorRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/pedidos", pedidoRoutes);

// Servir la web compilada (si existe el build de Vite)
const WEB_DIST = path.join(__dirname, "..", "Web", "dist");

if (fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));

    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
        res.sendFile(path.join(WEB_DIST, "index.html"));
    });

    console.log("✅ Sirviendo la web desde /Web/dist");
}

// Categorías por defecto
const CATEGORIAS_DEFECTO = [
    { nombre: "Maquillaje", descripcion: "Labiales, sombras, brochas y más" },
    { nombre: "Perfumes", descripcion: "Fragancias para hombre y mujer" },
    { nombre: "Joyería", descripcion: "Cadenas, collares y accesorios" },
    { nombre: "Ofertas", descripcion: "Productos con descuento especial" },
    { nombre: "Cuidado Personal", descripcion: "Cremas, serums y mascarillas" },
];

// Banners por defecto
const BANNERS_DEFECTO = [
    {
        titulo: "Maquillaje Profesional",
        descripcion: "Resalta tu belleza con nuestra colección exclusiva.",
        boton: "Ver productos",
        imagen: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&auto=format&fit=crop&q=80",
        orden: 1,
    },
    {
        titulo: "Perfumes",
        descripcion: "Fragancias para cada momento especial.",
        boton: "Ver colección",
        imagen: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=1200&auto=format&fit=crop&q=80",
        orden: 2,
    },
    {
        titulo: "Cuidado Personal",
        descripcion: "Productos que cuidan tu piel todos los días.",
        boton: "Explorar",
        imagen: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=1200&auto=format&fit=crop&q=80",
        orden: 3,
    },
    {
        titulo: "Ofertas Especiales",
        descripcion: "Aprovecha nuestros descuentos por tiempo limitado.",
        boton: "Ver ofertas",
        imagen: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&auto=format&fit=crop&q=80",
        orden: 4,
    },
];

// Seed: categorías, banners y administrador por defecto
const seed = async () => {
    for (const cat of CATEGORIAS_DEFECTO) {
        const existe = await Categoria.findOne({ where: { nombre: cat.nombre } });

        if (!existe) {
            await Categoria.create(cat);
            console.log(`✅ Categoría creada: ${cat.nombre}`);
        }
    }

    for (const banner of BANNERS_DEFECTO) {
        const existe = await Banner.findOne({ where: { titulo: banner.titulo } });

        if (!existe) {
            await Banner.create(banner);
            console.log(`✅ Banner creado: ${banner.titulo}`);
        }
    }

    let admin = await Administrador.findOne({ where: { identidad: "0801-1990-12345" } });

    if (!admin) {
        admin = await Administrador.findOne({ where: { correo: "admin@cosmeticos.com" } });
    }

    if (!admin) {
        const hash = await bcrypt.hash("admin123", 10);

        await Administrador.create({
            nombre: "Administrador",
            identidad: "0801-1990-12345",
            correo: "admin@cosmeticos.com",
            password: hash,
        });

        console.log("✅ Administrador creado: identidad 0801-1990-12345 / admin123");
    } else {
        let cambios = false;

        if (!admin.identidad) {
            admin.identidad = "0801-1990-12345";
            cambios = true;
        }

        if (!admin.password.startsWith("$2")) {
            admin.password = await bcrypt.hash("admin123", 10);
            cambios = true;
        }

        if (cambios) {
            await admin.save();
            console.log("✅ Administrador actualizado: identidad 0801-1990-12345 / admin123");
        }
    }
};

// Sincronizar modelos con la base de datos
sequelize
    .sync({ alter: true })
    .then(() => {
        console.log("✅ Tablas sincronizadas correctamente.");
        return seed();
    })
    .then(() => {
        console.log("✅ Datos iniciales listos.");
    })
    .catch((error) => {
        console.error("❌ Error al sincronizar la base de datos:", error.message);
    });

// Probar conexión a la base de datos
sequelize.authenticate()
    .then(() => {
        console.log("✅ Conexión a MySQL establecida correctamente.");
    })
    .catch((error) => {
        console.error("❌ Error al conectar con MySQL:", error.message);
    });

// Iniciar servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Servidor ejecutándose en http://localhost:${PORT}`);
});
