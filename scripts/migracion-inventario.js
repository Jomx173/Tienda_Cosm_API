'use strict';

/**
 * Migracion incremental y SEGURA para el subsistema de inventario (MD Beauty).
 *
 * Que hace (solo operaciones ADITIVAS):
 *   1. Crea un volcado de respaldo (esquema + datos) de las tablas afectadas.
 *   2. Anade a `detallepedido` las columnas nuevas (id_variante, tono, codigo),
 *      todas NULL y sin valor por defecto: las filas antiguas quedan intactas.
 *   3. Crea las tablas nuevas del inventario si no existen:
 *      producto_variante, producto_imagen, movimiento_inventario.
 *
 * Que NO hace (nunca):
 *   - No borra, vacia, renombra ni recrea tablas.
 *   - No modifica filas de producto, categoria, pedido ni detallepedido.
 *   - No toca precios, existencias, imagenes ni pedidos.
 *
 * Uso:
 *   node scripts/migracion-inventario.js                        -> simulacion local
 *   node scripts/migracion-inventario.js --aplicar               -> aplica en local
 *   node scripts/migracion-inventario.js --destino=produccion                          -> simulacion en produccion
 *   node scripts/migracion-inventario.js --destino=produccion --aplicar --confirmar-produccion
 *
 * En bases de datos que NO son locales exige --aplicar y --confirmar-produccion.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const RAIZ = path.join(__dirname, '..');

const argumentos = process.argv.slice(2);
const tiene = (nombre) => argumentos.includes(nombre);
const valorDe = (nombre, porDefecto) => {
    const found = argumentos.find((a) => a.startsWith(`--${nombre}=`));
    return found ? found.split('=').slice(1).join('=') : porDefecto;
};

const APLICAR = tiene('--aplicar');
const CONFIRMAR_PRODUCCION = tiene('--confirmar-produccion');

/* --- Seleccion del destino --- *
 * local      -> .env.local tiene prioridad y luego .env (desarrollo).
 * produccion -> SOLO .env (configuracion real del servidor). Nunca .env.local.
 */
const DESTINO = valorDe('destino', 'local');
if (!['local', 'produccion'].includes(DESTINO)) {
    console.error(`ABORT: --destino debe ser "local" o "produccion" (valor recibido: ${DESTINO}).`);
    process.exit(1);
}

if (DESTINO === 'produccion') {
    dotenv.config({ path: path.join(RAIZ, '.env') });
} else {
    dotenv.config({ path: path.join(RAIZ, '.env.local') });
    dotenv.config();
}

const DB_HOST = valorDe('host', process.env.DB_HOST);
const DB_PUERTO = Number(valorDe('port', process.env.DB_PORT || 3306));
const DB_NOMBRE = valorDe('db', process.env.DB_NAME);
const DB_USUARIO = valorDe('user', process.env.DB_USER);
const DB_PASSWORD = valorDe('password', process.env.DB_PASSWORD);

const ES_LOCAL = ['127.0.0.1', 'localhost', '::1'].includes(String(DB_HOST));

const SSL_ARG = valorDe('ssl', process.env.DB_SSL ?? (ES_LOCAL ? '0' : '1'));
const USAR_SSL = ['1', 'true', 'yes'].includes(String(SSL_ARG).toLowerCase());

/* Carpeta donde se guardan las copias de seguridad (por defecto dentro del
   repositorio, ya ignorada por .gitignore). Para produccion conviene pointing
   una ruta FUERA del repositorio con --backups-dir. */
const DIR_COPIAS = valorDe('backups-dir', path.join(RAIZ, 'backups'));

/* --- Sentencias aditivas (idempotentes) --- *
 * Los nombres de tabla base se resuelven en tiempo de ejecucion contra
 * information_schema: en el servidor real las tablas son `Producto`,
 * `Categoria` y `Pedido` (mayusculas) y en MySQL sensible a mayusculas
 *Minusculas no existirian.
 */

const crearProductoVariante = (tProducto) => `CREATE TABLE IF NOT EXISTS \`producto_variante\` (
  \`id_variante\` int NOT NULL AUTO_INCREMENT,
  \`id_producto\` int NOT NULL,
  \`tono\` varchar(80) NOT NULL,
  \`color\` varchar(20) DEFAULT NULL,
  \`precio\` decimal(10,2) NOT NULL,
  \`precio_anterior\` decimal(10,2) DEFAULT NULL,
  \`stock\` int NOT NULL DEFAULT '0',
  \`codigo\` varchar(80) DEFAULT NULL,
  \`orden\` int NOT NULL DEFAULT '0',
  \`estado\` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (\`id_variante\`),
  KEY \`id_producto\` (\`id_producto\`),
  CONSTRAINT \`producto_variante_ibfk_1\` FOREIGN KEY (\`id_producto\`) REFERENCES \`${tProducto}\` (\`id_producto\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

const crearProductoImagen = (tProducto, tVariante) => `CREATE TABLE IF NOT EXISTS \`producto_imagen\` (
  \`id_imagen\` int NOT NULL AUTO_INCREMENT,
  \`id_producto\` int NOT NULL,
  \`id_variante\` int DEFAULT NULL,
  \`imagen\` varchar(255) NOT NULL,
  \`orden\` int NOT NULL DEFAULT '0',
  PRIMARY KEY (\`id_imagen\`),
  KEY \`id_producto\` (\`id_producto\`),
  KEY \`id_variante\` (\`id_variante\`),
  CONSTRAINT \`producto_imagen_ibfk_1\` FOREIGN KEY (\`id_producto\`) REFERENCES \`${tProducto}\` (\`id_producto\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`producto_imagen_ibfk_2\` FOREIGN KEY (\`id_variante\`) REFERENCES \`${tVariante}\` (\`id_variante\`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

const CREAR_MOVIMIENTO = `CREATE TABLE IF NOT EXISTS \`movimiento_inventario\` (
  \`id_movimiento\` int NOT NULL AUTO_INCREMENT,
  \`tipo\` varchar(20) NOT NULL,
  \`id_producto\` int NOT NULL,
  \`id_variante\` int DEFAULT NULL,
  \`referencia\` varchar(160) DEFAULT NULL,
  \`cantidad\` int NOT NULL DEFAULT '0',
  \`stock_anterior\` int NOT NULL DEFAULT '0',
  \`stock_nuevo\` int NOT NULL DEFAULT '0',
  \`motivo\` varchar(255) DEFAULT NULL,
  \`id_administrador\` int DEFAULT NULL,
  \`created_at\` datetime NOT NULL,
  PRIMARY KEY (\`id_movimiento\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`;

const COLUMNAS_DETALLE = [
    { nombre: 'id_variante', tipo: 'int DEFAULT NULL' },
    { nombre: 'tono', tipo: 'varchar(80) DEFAULT NULL' },
    { nombre: 'codigo', tipo: 'varchar(80) DEFAULT NULL' },
];

const tablasDe = async (cn) => {
    const [filas] = await cn.query(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = \'BASE TABLE\'',
        [DB_NOMBRE]
    );
    return filas.map((f) => f.TABLE_NAME);
};

/** Resuelve el nombre REAL de una tabla sin importar mayusculas/minusculas. */
const resolver = (tablas, nombre) =>
    tablas.find((t) => t.toLowerCase() === nombre.toLowerCase()) || null;

const columnasDe = async (cn, tabla) => {
    const [filas] = await cn.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [DB_NOMBRE, tabla]
    );
    return filas.map((f) => f.COLUMN_NAME);
};

/** Volcado simple (esquema + datos) de las tablas que se van a tocar. */
const volcar = async (cn, tablas) => {
    const partes = [
        `-- Copia de seguridad previa a la migracion de inventario (${new Date().toISOString()})`,
        '',
    ];

    for (const tabla of tablas) {
        const [crea] = await cn.query(`SHOW CREATE TABLE \`${tabla}\``);
        const [filas] = await cn.query(`SELECT * FROM \`${tabla}\``);

        partes.push(`-- ${tabla}`, crea[0]['Create Table'], '');

        if (filas.length > 0) {
            partes.push(`INSERT INTO \`${tabla}\` VALUES`);

            const valores = filas.map((fila) => {
                const celdas = Object.values(fila).map((v) =>
                    v === null
                        ? 'NULL'
                        : typeof v === 'number'
                          ? String(v)
                          : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`
                );
                return `(${celdas.join(',')})`;
            });

            partes.push(valores.join(',\n') + ';', '');
        }
    }

    return partes.join('\n');
};

/** Huella de los datos que no se deben tocar. */
const huellaDatos = async (cn, T) => {
    const [productos] = await cn.query(
        `SELECT id_producto, nombre, precio, stock, imagen, estado, id_categoria, precio_anterior, destacado, codigo, subcategoria FROM \`${T.producto}\` ORDER BY id_producto`
    );
    const [categorias] = await cn.query(
        `SELECT id_categoria, nombre, estado FROM \`${T.categoria}\` ORDER BY id_categoria`
    );
    const [pedidos] = await cn.query(
        `SELECT id_pedido, nombre_cliente, fecha, total, estado, telefono_cliente, productos, direccion FROM \`${T.pedido}\` ORDER BY id_pedido`
    );
    const [detalles] = await cn.query(
        `SELECT id_detalle, id_pedido, id_producto, cantidad, precio, subtotal FROM \`${T.detallepedido}\` ORDER BY id_detalle`
    );
    const [administradores] = await cn.query(
        `SELECT id_admin, nombre, correo, estado, identidad FROM \`${T.administrador}\` ORDER BY id_admin`
    );

    return JSON.stringify({ productos, categorias, pedidos, detalles, administradores });
};

(async () => {
    if (!DB_HOST || !DB_NOMBRE) {
        console.error('Faltan datos de conexion (DB_HOST / DB_NAME). Revisa el archivo .env.local o .env.');
        process.exit(1);
    }

    // La simulacion es de SOLO LECTURA y se permite en cualquier destino.
    // Aplicar en una base remota exige AMBAS banderas explicitas.
    if (APLICAR && !ES_LOCAL && !CONFIRMAR_PRODUCCION) {
        console.error(`\nABORT: la base de datos objetivo (${DB_HOST}/${DB_NOMBRE}) no es local.`);
        console.error('Para aplicarla alli hacen falta las dos banderas:');
        console.error(
            '   node scripts/migracion-inventario.js --destino=produccion --aplicar --confirmar-produccion\n'
        );
        process.exit(1);
    }

    const cn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PUERTO,
        user: DB_USUARIO,
        password: DB_PASSWORD,
        database: DB_NOMBRE,
        ssl: USAR_SSL ? { require: true, rejectUnauthorized: false } : undefined,
    });

    const [version] = await cn.query('SELECT VERSION() AS v, DATABASE() AS db');

    console.log(`\n=== Migracion de inventario (MD Beauty) ===`);
    console.log(`  Destino declarado: ${DESTINO}`);
    console.log(`  Objetivo: ${DB_HOST}:${DB_PUERTO}/${DB_NOMBRE} (${ES_LOCAL ? 'local' : 'REMOTO'})`);
    console.log(`  Motor: MySQL ${version[0].v} | SSL: ${USAR_SSL ? 'si' : 'no'}`);
    console.log(`  Modo: ${APLICAR ? 'APLICAR' : 'SIMULACION (no cambia nada)'}`);

    const tablas = await tablasDe(cn);
    const T = {
        producto: resolver(tablas, 'producto'),
        categoria: resolver(tablas, 'categoria'),
        pedido: resolver(tablas, 'pedido'),
        detallepedido: resolver(tablas, 'detallepedido'),
        administrador: resolver(tablas, 'administrador'),
    };

    const faltan = Object.entries(T)
        .filter(([, v]) => !v)
        .map(([k]) => k);

    if (faltan.length > 0) {
        console.error(`\nABORT: faltan tablas base en la base de datos: ${faltan.join(', ')}.`);
        console.error(`Tablas existentes: ${tablas.join(', ')}`);
        await cn.end();
        process.exit(1);
    }

    console.log(`  Tablas base detectadas: ${JSON.stringify(T)}`);

    const antes = await huellaDatos(cn, T);
    const pasos = [];

    /* --- 1. columnas nuevas en detallepedido --- */
    const columnasDetalle = await columnasDe(cn, T.detallepedido);

    for (const col of COLUMNAS_DETALLE) {
        if (columnasDetalle.includes(col.nombre)) {
            pasos.push(`${T.detallepedido}.${col.nombre}: ya existe (no se toca)`);
        } else {
            pasos.push(
                `${T.detallepedido}.${col.nombre}: se anade (${col.tipo}, NULL, sin valor por defecto)`
            );
        }
    }

    /* --- 2. tablas nuevas --- */
    for (const tabla of ['producto_variante', 'producto_imagen', 'movimiento_inventario']) {
        pasos.push(
            resolver(tablas, tabla)
                ? `${tabla}: ya existe (no se toca)`
                : `${tabla}: se crea si no existe`
        );
    }

    console.log('\n  Pasos previstos:');
    pasos.forEach((p) => console.log(`   - ${p}`));

    if (!APLICAR) {
        console.log('\n  SIMULACION: no se aplico nada. Usa --aplicar para ejecutarla.\n');
        await cn.end();
        return;
    }

    /* --- 3. copia de seguridad antes de tocar nada --- */
    if (!fs.existsSync(DIR_COPIAS)) fs.mkdirSync(DIR_COPIAS, { recursive: true });

    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const rutaCopia = path.join(DIR_COPIAS, `migracion-inventario-${sello}.sql`);
    const copia = await volcar(cn, [T.detallepedido, T.producto, T.categoria, T.pedido]);
    fs.writeFileSync(rutaCopia, copia, 'utf8');
    console.log(`\n  Copia de seguridad creada: ${rutaCopia} (${fs.statSync(rutaCopia).size} bytes)`);

    /* --- 4. aplicar --- */
    for (const col of COLUMNAS_DETALLE) {
        if (columnasDetalle.includes(col.nombre)) continue;
        await cn.query(
            `ALTER TABLE \`${T.detallepedido}\` ADD COLUMN \`${col.nombre}\` ${col.tipo}`
        );
        console.log(`   + ${T.detallepedido}.${col.nombre}`);
    }

    if (!resolver(tablas, 'producto_variante')) {
        await cn.query(crearProductoVariante(T.producto));
        console.log('   + tabla producto_variante');
    }
    if (!resolver(tablas, 'producto_imagen')) {
        await cn.query(crearProductoImagen(T.producto, 'producto_variante'));
        console.log('   + tabla producto_imagen');
    }
    if (!resolver(tablas, 'movimiento_inventario')) {
        await cn.query(CREAR_MOVIMIENTO);
        console.log('   + tabla movimiento_inventario');
    }

    /* --- 5. verificar que nada cambio --- */
    const despues = await huellaDatos(cn, T);
    console.log(
        `\n  Datos de producto/categoria/pedido/detallepedido sin cambios: ${
            antes === despues ? 'SI' : 'NO'
        }`
    );

    const [conteos] = await cn.query(`SELECT
        (SELECT COUNT(*) FROM \`${T.producto}\`) productos,
        (SELECT COUNT(*) FROM \`${T.categoria}\`) categorias,
        (SELECT COUNT(*) FROM \`${T.pedido}\`) pedidos,
        (SELECT COUNT(*) FROM \`${T.detallepedido}\`) detalles,
        (SELECT COUNT(*) FROM \`producto_variante\`) variantes,
        (SELECT COUNT(*) FROM \`producto_imagen\`) imagenes,
        (SELECT COUNT(*) FROM \`movimiento_inventario\`) movimientos`);

    console.log(`  Conteos: ${JSON.stringify(conteos[0])}`);

    if (antes !== despues) {
        console.error('\n  AVISO: los datos cambiaron. Revisa la copia de seguridad.');
    }

    console.log('\n  Migracion finalizada.\n');
    await cn.end();
})().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
});
