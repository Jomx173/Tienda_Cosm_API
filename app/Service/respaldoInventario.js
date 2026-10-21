'use strict';

/**
 * Servicio de copias de seguridad del inventario de MD Beauty.
 *
 * - Solo toca el ambito de inventario: Categoria, Producto, ProductoVariante
 *   y ProductoImagen. Nunca pedidos, administradores ni credenciales.
 * - Genera un JSON con metadatos de formato y version para poder validarlo
 *   antes de restaurarlo.
 * - Valida el archivo (tamano, version, tipos, referencias de imagen) y
 *   calcula un plan de restauracion (crear / actualizar / eliminar) antes de
 *   tocar la base de datos.
 */

const fs = require('fs');
const path = require('path');

const FORMATO = 'md-beauty-inventario';
const VERSION_FORMATO = 1;

/** Tamano maximo aceptado al restaurar (bytes). */
const TAMANO_MAXIMO_ARCHIVO = 40 * 1024 * 1024;

/** Tamano maximo de imagenes embebidas en el respaldo (bytes en crudo). */
const TAMANO_MAXIMO_IMAGENES = 25 * 1024 * 1024;

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/* =======================
   UTILIDADES
======================= */

/** Normaliza texto para comparar: minusculas, sin acentos, sin espacios extra. */
const normalizar = (valor) =>
    String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

const esNumero = (valor) =>
    typeof valor === 'number' && Number.isFinite(valor);

const aEntero = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) ? n : null;
};

const aDecimal = (valor) => {
    const n = Number(valor);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

const aBooleano = (valor, porDefecto = false) => {
    if (valor === true || valor === 1 || valor === '1' || valor === 'true') return true;
    if (valor === false || valor === 0 || valor === '0' || valor === 'false') return false;
    return porDefecto;
};

/**
 * Valida una referencia de imagen.
 * Solo se aceptan rutas relativas /uploads/<archivo> o URLs http(s).
 * Se rechazan rutas absolutas, traversals y esquemas peligrosos.
 */
const referenciaImagenSegura = (valor) => {
    const ref = String(valor ?? '').trim();

    if (!ref) return { ok: false, razon: 'referencia vacia' };

    if (/^https?:\/\//i.test(ref)) {
        return { ok: true, tipo: 'url', valor: ref };
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
        return { ok: false, razon: 'esquema no permitido' };
    }

    if (ref.includes('..') || ref.includes('\\') || /^[a-z]:/i.test(ref)) {
        return { ok: false, razon: 'ruta de archivo no permitida' };
    }

    const m = ref.match(/^\/uploads\/([A-Za-z0-9._-]+)$/);

    if (!m) return { ok: false, razon: 'ruta no permitida' };

    return { ok: true, tipo: 'local', valor: ref, archivo: m[1] };
};

/** Indica si el proyecto esta usando almacenamiento local de imagenes. */
const usaAlmacenamientoLocal = () =>
    String(process.env.UPLOAD_STORAGE || '').toLowerCase() === 'local' ||
    !process.env.CLOUDINARY_CLOUD_NAME;

/* =======================
   GENERACION DEL RESPALDO
======================= */

/**
 * Construye el objeto de respaldo a partir de las filas ya consultadas.
 * Solo se incluyen tablas de inventario: nunca pedidos ni administradores.
 */
const construirRespaldo = ({ categorias, productos, variantes, imagenes, incluirImagenes = true }) => {
    const local = usaAlmacenamientoLocal();

    // Mapa de referencias de imagen -> archivo local
    const archivosLocales = new Map();

    if (local && incluirImagenes) {
        for (const img of imagenes) {
            const ref = String(img.imagen || '');

            if (!ref.startsWith('/uploads/')) continue;

            const nombre = ref.slice('/uploads/'.length);

            if (!/^[A-Za-z0-9._-]+$/.test(nombre)) continue;

            const ruta = path.join(UPLOADS_DIR, nombre);

            // Se usa path.basename para impedir cualquier salida del directorio
            if (path.basename(ruta) !== nombre) continue;

            if (!archivosLocales.has(nombre)) {
                try {
                    const stat = fs.statSync(ruta);
                    if (stat.isFile()) archivosLocales.set(nombre, stat.size);
                } catch {
                    /* el archivo no existe en este entorno */
                }
            }
        }
    }

    const totalBytes = Array.from(archivosLocales.values()).reduce((a, b) => a + b, 0);

    const incluirArchivos = local && incluirImagenes && totalBytes <= TAMANO_MAXIMO_IMAGENES;

    const imagenesRespaldo = imagenes.map((img) => {
        const ref = String(img.imagen || '');
        const archivo = ref.startsWith('/uploads/') ? ref.slice('/uploads/'.length) : null;

        let contenido = null;

        if (incluirArchivos && archivo && archivosLocales.has(archivo)) {
            try {
                const ruta = path.join(UPLOADS_DIR, path.basename(archivo));
                contenido = fs.readFileSync(ruta).toString('base64');
            } catch {
                contenido = null;
            }
        }

        return {
            id_imagen: img.id_imagen,
            id_producto: img.id_producto,
            id_variante: img.id_variante === undefined ? null : img.id_variante,
            imagen: ref,
            orden: Number(img.orden || 0),
            archivo: contenido
                ? { nombre: archivo, base64: contenido }
                : null,
        };
    });

    return {
        meta: {
            formato: FORMATO,
            version: VERSION_FORMATO,
            generado_en: new Date().toISOString(),
            aplicacion: 'MD Beauty',
            alcance: ['categoria', 'producto', 'producto_variante', 'producto_imagen'],
            almacenamiento_imagenes: local ? 'local' : 'externo',
            imagenes_incluidas: incluirArchivos,
            imagenes_pendientes: local
                ? imagenesRespaldo.filter((i) => i.archivo === null && i.imagen.startsWith('/uploads/')).length
                : imagenesRespaldo.length,
            nota_imagenes: local
                ? incluirArchivos
                    ? 'Las imagenes locales van embebidas en base64 dentro de este mismo archivo.'
                    : 'El peso de las imagenes supera el limite permitido: se guardan solo sus referencias. Usa el paquete de imagenes para recuperarlas.'
                : 'Las imagenes estan en almacenamiento externo (Cloudinary): se guardan sus URLs.',
        },
        conteos: {
            categorias: categorias.length,
            productos: productos.length,
            variantes: variantes.length,
            imagenes: imagenes.length,
        },
        categorias: categorias.map((c) => ({
            id_categoria: c.id_categoria,
            nombre: c.nombre,
            descripcion: c.descripcion === undefined ? null : c.descripcion,
            estado: aBooleano(c.estado, true),
        })),
        productos: productos.map((p) => ({
            id_producto: p.id_producto,
            nombre: p.nombre,
            descripcion: p.descripcion === undefined ? null : p.descripcion,
            precio: aDecimal(p.precio),
            precio_anterior: p.precio_anterior === null || p.precio_anterior === undefined
                ? null
                : aDecimal(p.precio_anterior),
            stock: aEntero(p.stock) === null ? 0 : aEntero(p.stock),
            codigo: p.codigo || '',
            subcategoria: p.subcategoria || '',
            destacado: aBooleano(p.destacado, false),
            imagen: p.imagen || null,
            estado: aBooleano(p.estado, true),
            id_categoria: p.id_categoria,
        })),
        variantes: variantes.map((v) => ({
            id_variante: v.id_variante,
            id_producto: v.id_producto,
            tono: v.tono,
            color: v.color || null,
            precio: aDecimal(v.precio),
            precio_anterior: v.precio_anterior === null || v.precio_anterior === undefined
                ? null
                : aDecimal(v.precio_anterior),
            stock: aEntero(v.stock) === null ? 0 : aEntero(v.stock),
            codigo: v.codigo || '',
            orden: aEntero(v.orden) === null ? 0 : aEntero(v.orden),
            estado: aBooleano(v.estado, true),
        })),
        imagenes: imagenesRespaldo,
    };
};

/* =======================
   VALIDACION
======================= */

/**
 * Valida el contenido de un respaldo ya parseado.
 * Devuelve { valido, errores[], advertencias[], datos }.
 */
const validarRespaldo = (contenido) => {
    const errores = [];
    const advertencias = [];

    if (!contenido || typeof contenido !== 'object' || Array.isArray(contenido)) {
        return { valido: false, errores: ['El archivo no contiene un objeto JSON valido.'], advertencias, datos: null };
    }

    const meta = contenido.meta;

    if (!meta || typeof meta !== 'object') {
        errores.push('Falta el bloque "meta" con el formato y la version del respaldo.');
    } else {
        if (meta.formato !== FORMATO) {
            errores.push(`El formato "${meta.formato || 'desconocido'}" no es "${FORMATO}".`);
        }

        const version = Number(meta.version);

        if (!Number.isInteger(version) || version < 1) {
            errores.push('La version del respaldo no es valida.');
        } else if (version > VERSION_FORMATO) {
            errores.push(
                `El respaldo usa la version ${version} y esta instalacion admite hasta la ${VERSION_FORMATO}.`
            );
        }
    }

    for (const clave of ['categorias', 'productos', 'variantes']) {
        if (!Array.isArray(contenido[clave])) {
            errores.push(`La coleccion "${clave}" falta o no es una lista.`);
        }
    }

    if (contenido.imagenes !== undefined && !Array.isArray(contenido.imagenes)) {
        errores.push('La coleccion "imagenes" no es una lista.');
    }

    if (errores.length > 0) {
        return { valido: false, errores, advertencias, datos: null };
    }

    const categorias = contenido.categorias;
    const productos = contenido.productos;
    const variantes = contenido.variantes;
    const imagenes = Array.isArray(contenido.imagenes) ? contenido.imagenes : [];

    // --- categorias ---
    categorias.forEach((c, i) => {
        if (!c || typeof c !== 'object') {
            errores.push(`Categoria #${i + 1}: no es un objeto valido.`);
            return;
        }
        if (!c.nombre || typeof c.nombre !== 'string' || !c.nombre.trim()) {
            errores.push(`Categoria #${i + 1}: falta el nombre.`);
        }
        if (c.id_categoria !== undefined && c.id_categoria !== null && aEntero(c.id_categoria) === null) {
            errores.push(`Categoria #${i + 1}: id_categoria no es un entero valido.`);
        }
    });

    // --- productos ---
    const idsCategoriaRespaldo = new Set(
        categorias.map((c) => aEntero(c.id_categoria)).filter((n) => n !== null)
    );

    productos.forEach((p, i) => {
        if (!p || typeof p !== 'object') {
            errores.push(`Producto #${i + 1}: no es un objeto valido.`);
            return;
        }
        if (!p.nombre || typeof p.nombre !== 'string' || !p.nombre.trim()) {
            errores.push(`Producto #${i + 1}: falta el nombre.`);
        }
        if (!esNumero(Number(p.precio)) && typeof p.precio !== 'string') {
            errores.push(`Producto "${p.nombre || i + 1}": el precio no es valido.`);
        }
        if (p.precio !== null && p.precio !== undefined && aDecimal(p.precio) === null) {
            errores.push(`Producto "${p.nombre || i + 1}": el precio no es un numero valido.`);
        }
        if (p.stock !== null && p.stock !== undefined && aEntero(p.stock) === null) {
            errores.push(`Producto "${p.nombre || i + 1}": el stock no es un entero valido.`);
        }
        if (p.stock !== null && p.stock !== undefined && aEntero(p.stock) < 0) {
            errores.push(`Producto "${p.nombre || i + 1}": el stock no puede ser negativo.`);
        }
        if (p.id_categoria === null || p.id_categoria === undefined) {
            errores.push(`Producto "${p.nombre || i + 1}": falta la categoria.`);
        } else if (idsCategoriaRespaldo.size > 0 && !idsCategoriaRespaldo.has(aEntero(p.id_categoria))) {
            advertencias.push(
                `Producto "${p.nombre}": su categoria (id ${p.id_categoria}) no esta en el respaldo; se usara la primera categoria disponible.`
            );
        }
        if (p.imagen) {
            const ref = referenciaImagenSegura(p.imagen);
            if (!ref.ok) {
                errores.push(`Producto "${p.nombre}": referencia de imagen no permitida (${ref.razon}).`);
            }
        }
    });

    // --- variantes ---
    const idsProductoRespaldo = new Set(
        productos.map((p) => aEntero(p.id_producto)).filter((n) => n !== null)
    );

    variantes.forEach((v, i) => {
        if (!v || typeof v !== 'object') {
            errores.push(`Variante #${i + 1}: no es un objeto valido.`);
            return;
        }
        if (!v.tono || typeof v.tono !== 'string' || !v.tono.trim()) {
            errores.push(`Variante #${i + 1}: falta el tono.`);
        }
        if (v.precio !== null && v.precio !== undefined && aDecimal(v.precio) === null) {
            errores.push(`Variante "${v.tono || i + 1}": el precio no es un numero valido.`);
        }
        if (v.stock !== null && v.stock !== undefined && aEntero(v.stock) === null) {
            errores.push(`Variante "${v.tono || i + 1}": el stock no es un entero valido.`);
        }
        if (v.stock !== null && v.stock !== undefined && aEntero(v.stock) < 0) {
            errores.push(`Variante "${v.tono || i + 1}": el stock no puede ser negativo.`);
        }
        const idProducto = aEntero(v.id_producto);
        if (idProducto === null) {
            errores.push(`Variante "${v.tono || i + 1}": falta el producto al que pertenece.`);
        } else if (idsProductoRespaldo.size > 0 && !idsProductoRespaldo.has(idProducto)) {
            errores.push(`Variante "${v.tono}": apunta a un producto (id ${idProducto}) que no esta en el respaldo.`);
        }
    });

    // --- imagenes ---
    imagenes.forEach((img, i) => {
        if (!img || typeof img !== 'object') {
            errores.push(`Imagen #${i + 1}: no es un objeto valido.`);
            return;
        }
        const ref = referenciaImagenSegura(img.imagen);
        if (!ref.ok) {
            errores.push(`Imagen #${i + 1}: referencia no permitida (${ref.razon}).`);
        }
        if (img.archivo) {
            if (typeof img.archivo.base64 !== 'string') {
                errores.push(`Imagen #${i + 1}: el contenido base64 no es valido.`);
            } else if (!/^[A-Za-z0-9+/=\s]+$/.test(img.archivo.base64)) {
                errores.push(`Imagen #${i + 1}: el contenido base64 esta corrupto.`);
            }
        }
    });

    return {
        valido: errores.length === 0,
        errores,
        advertencias,
        datos: { meta: contenido.meta, categorias, productos, variantes, imagenes },
    };
};

/* =======================
   PLAN DE RESTAURACION
======================= */

/** Clave de emparejamiento de un producto: nombre normalizado + categoria. */
const claveProducto = (nombre, idCategoria) => `${normalizar(nombre)}::${idCategoria}`;

/**
 * Empareja los productos del respaldo con los de la base de datos.
 *
 * Reglas (pensadas para no perder datos):
 *  - primero se busca por codigo (SKU);
 *  - si no hay codigo, por nombre normalizado + categoria;
 *  - un producto de la base de datos NUNCA se empareja dos veces, asi que
 *    ningun producto del respaldo puede sobrescribir los datos de otro;
 *  - se detectan las claves ambiguas (varios productos con el mismo nombre y
 *    categoria) para poder conservarlos en vez de borrarlos por error.
 */
const emparejarProductos = ({
    productosRespaldo = [],
    productosActuales = [],
    mapaCategoria = new Map(),
}) => {
    const porCodigo = new Map();
    const porNombre = new Map();

    for (const p of productosActuales) {
        const codigo = p.codigo ? normalizar(p.codigo) : '';

        if (codigo) {
            if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
            porCodigo.get(codigo).push(p);
        }

        const clave = claveProducto(p.nombre, p.id_categoria);

        if (!porNombre.has(clave)) porNombre.set(clave, []);
        porNombre.get(clave).push(p);
    }

    const usados = new Set();
    const mapaProducto = new Map();
    const clavesAmbiguas = new Set();

    // Varios productos en la base de datos comparten nombre y categoria.
    for (const [clave, lista] of porNombre) {
        if (lista.length > 1) clavesAmbiguas.add(clave);
    }

    for (const p of productosRespaldo) {
        const idRespaldo = aEntero(p.id_producto);
        const idCategoria = mapaCategoria.has(aEntero(p.id_categoria))
            ? mapaCategoria.get(aEntero(p.id_categoria))
            : aEntero(p.id_categoria);

        const clave = claveProducto(p.nombre, idCategoria);
        const candidatosNombre = (porNombre.get(clave) || []).filter(
            (x) => !usados.has(x.id_producto)
        );

        if (candidatosNombre.length > 1) clavesAmbiguas.add(clave);

        let actual = null;

        const codigo = p.codigo ? normalizar(p.codigo) : '';

        if (codigo) {
            const candidatos = (porCodigo.get(codigo) || []).filter(
                (x) => !usados.has(x.id_producto)
            );
            if (candidatos.length > 0) actual = candidatos[0];
        }

        // Cada producto de la base de datos se empareja una sola vez: si ya se
        // emparejo con otra entrada del respaldo, esta crea uno nuevo en vez
        // de sobrescribir los datos del anterior.
        if (!actual && candidatosNombre.length > 0) actual = candidatosNombre[0];

        if (actual) {
            usados.add(actual.id_producto);
            mapaProducto.set(idRespaldo, actual.id_producto);
        }
    }

    return { mapaProducto, usados, clavesAmbiguas };
};

/**
 * Calcula el plan (crear / actualizar / eliminar) comparando el respaldo con
 * el estado actual de la base de datos. No modifica nada.
 */
const calcularPlan = ({ respaldo, categoriasActuales, productosActuales, variantesActuales, imagenesActuales, productosProtegidos = new Set(), variantesProtegidas = new Set(), modo = 'combinar' }) => {
    const { categorias, productos, variantes, imagenes } = respaldo;

    const plan = {
        modo,
        categorias: { crear: 0, actualizar: 0, sinCambios: 0, eliminar: 0 },
        productos: { crear: 0, actualizar: 0, sinCambios: 0, eliminar: 0, protegidos: 0, ambiguos: 0 },
        variantes: { crear: 0, actualizar: 0, sinCambios: 0, eliminar: 0, protegidas: 0 },
        imagenes: { crear: 0, actualizar: 0, omitidas: 0 },
        advertencias: [],
        detalle: { productosCrear: [], productosActualizar: [], productosEliminar: [], variantesCrear: [], variantesEliminar: [] },
    };

    /* --- categorias: se emparejan por nombre normalizado --- */
    const categoriasPorNombre = new Map();
    for (const c of categoriasActuales) {
        categoriasPorNombre.set(normalizar(c.nombre), c);
    }

    const categoriasRespaldoVistas = new Set();
    const mapaCategoria = new Map(); // id del respaldo -> id actual

    for (const c of categorias) {
        const clave = normalizar(c.nombre);
        const actual = categoriasPorNombre.get(clave);

        if (actual) {
            categoriasRespaldoVistas.add(actual.id_categoria);
            mapaCategoria.set(aEntero(c.id_categoria), actual.id_categoria);

            const cambia =
                actual.nombre !== c.nombre ||
                (actual.descripcion || '') !== (c.descripcion || '') ||
                aBooleano(actual.estado, true) !== aBooleano(c.estado, true);

            if (cambia) plan.categorias.actualizar += 1;
            else plan.categorias.sinCambios += 1;
        } else {
            plan.categorias.crear += 1;
        }
    }

    if (modo === 'reemplazar') {
        for (const c of categoriasActuales) {
            if (!categoriasRespaldoVistas.has(c.id_categoria)) {
                plan.categorias.eliminar += 1;
            }
        }
    }

    /* --- productos: codigo > (nombre normalizado + categoria) --- */
    const productosRespaldoVistos = new Set();

    const variantesPorProductoActual = new Map();

    const { mapaProducto, clavesAmbiguas } = emparejarProductos({
        productosRespaldo: productos,
        productosActuales,
        mapaCategoria,
    });

    for (const id of mapaProducto.values()) productosRespaldoVistos.add(id);

    for (const v of variantesActuales) {
        if (!variantesPorProductoActual.has(v.id_producto)) {
            variantesPorProductoActual.set(v.id_producto, []);
        }
        variantesPorProductoActual.get(v.id_producto).push(v);
    }

    const variantesRespaldoPorProducto = new Map();

    for (const v of variantes) {
        const idP = aEntero(v.id_producto);
        if (!variantesRespaldoPorProducto.has(idP)) variantesRespaldoPorProducto.set(idP, []);
        variantesRespaldoPorProducto.get(idP).push(v);
    }

    for (const p of productos) {
        const idRespaldo = aEntero(p.id_producto);
        const actual = mapaProducto.has(idRespaldo)
            ? productosActuales.find((x) => x.id_producto === mapaProducto.get(idRespaldo))
            : null;

        if (actual) {
            const idCategoria = mapaCategoria.has(aEntero(p.id_categoria))
                ? mapaCategoria.get(aEntero(p.id_categoria))
                : aEntero(p.id_categoria);

            const cambia =
                actual.nombre !== p.nombre ||
                Number(actual.precio) !== Number(aDecimal(p.precio)) ||
                Number(actual.stock) !== Number(aEntero(p.stock)) ||
                (actual.id_categoria || null) !== (idCategoria || null) ||
                (actual.codigo || '') !== (p.codigo || '') ||
                (actual.subcategoria || '') !== (p.subcategoria || '') ||
                (actual.imagen || null) !== (p.imagen || null) ||
                aBooleano(actual.estado, true) !== aBooleano(p.estado, true) ||
                aBooleano(actual.destacado, false) !== aBooleano(p.destacado, false);

            if (cambia) {
                plan.productos.actualizar += 1;
                plan.detalle.productosActualizar.push(p.nombre);
            } else {
                plan.productos.sinCambios += 1;
            }
        } else {
            plan.productos.crear += 1;
            plan.detalle.productosCrear.push(p.nombre);
        }
    }

    /* --- variantes: dentro de su producto, codigo > tono normalizado --- */
    const variantesRespaldoVistas = new Set();
    const mapaVariante = new Map(); // id del respaldo -> id actual

    for (const v of variantes) {
        const idProductoRespaldo = aEntero(v.id_producto);
        const idProductoActual = mapaProducto.get(idProductoRespaldo);

        if (!idProductoActual) {
            // El producto se creara en esta restauracion: la variante se creara con el.
            plan.variantes.crear += 1;
            plan.detalle.variantesCrear.push(`${v.tono} (${idProductoRespaldo})`);
            continue;
        }

        const actuales = variantesPorProductoActual.get(idProductoActual) || [];

        let actual = null;

        if (v.codigo && String(v.codigo).trim()) {
            actual = actuales.find((x) => x.codigo && normalizar(x.codigo) === normalizar(v.codigo)) || null;
        }

        if (!actual) {
            actual = actuales.find((x) => normalizar(x.tono) === normalizar(v.tono)) || null;
        }

        if (actual) {
            variantesRespaldoVistas.add(actual.id_variante);
            mapaVariante.set(aEntero(v.id_variante), actual.id_variante);

            const cambia =
                actual.tono !== v.tono ||
                Number(actual.precio) !== Number(aDecimal(v.precio)) ||
                Number(actual.stock) !== Number(aEntero(v.stock)) ||
                (actual.color || null) !== (v.color || null) ||
                (actual.codigo || '') !== (v.codigo || '') ||
                aBooleano(actual.estado, true) !== aBooleano(v.estado, true);

            if (cambia) plan.variantes.actualizar += 1;
            else plan.variantes.sinCambios += 1;
        } else {
            plan.variantes.crear += 1;
            plan.detalle.variantesCrear.push(`${v.tono} (producto ${idProductoActual})`);
        }
    }

    /* --- imagenes: por producto + variante + nombre de archivo --- */
    const imagenesActualesPorClave = new Map();

    for (const img of imagenesActuales) {
        const clave = `${img.id_producto}::${img.id_variante ?? 0}::${normalizar(img.imagen)}`;
        imagenesActualesPorClave.set(clave, img);
    }

    for (const img of imagenes) {
        const idProductoActual = mapaProducto.get(aEntero(img.id_producto));
        const idVarianteActual =
            img.id_variante === null || img.id_variante === undefined
                ? null
                : mapaVariante.get(aEntero(img.id_variante)) ?? null;

        if (!idProductoActual) {
            plan.imagenes.omitidas += 1;
            continue;
        }

        const clave = `${idProductoActual}::${idVarianteActual ?? 0}::${normalizar(img.imagen)}`;

        if (imagenesActualesPorClave.has(clave)) {
            plan.imagenes.actualizar += 1;
        } else {
            plan.imagenes.crear += 1;
        }
    }

    /* --- eliminaciones (solo modo reemplazar) --- */
    if (modo === 'reemplazar') {
        for (const p of productosActuales) {
            if (productosRespaldoVistos.has(p.id_producto)) continue;

            if (productosProtegidos.has(p.id_producto)) {
                plan.productos.protegidos += 1;
                plan.advertencias.push(
                    `El producto "${p.nombre}" tiene pedidos asociados: se conserva y no se elimina.`
                );
                continue;
            }

            // Products that share a name and category cannot be told apart:
            // they are kept instead of being deleted by mistake.
            if (clavesAmbiguas.has(claveProducto(p.nombre, p.id_categoria))) {
                plan.productos.ambiguos = (plan.productos.ambiguos || 0) + 1;
                plan.advertencias.push(
                    `El producto "${p.nombre}" comparte nombre y categoría con otro producto: se conserva para no borrar nada por error.`
                );
                continue;
            }

            plan.productos.eliminar += 1;
            plan.detalle.productosEliminar.push(p.nombre);
        }

        for (const v of variantesActuales) {
            if (variantesRespaldoVistas.has(v.id_variante)) continue;

            if (variantesProtegidas.has(v.id_variante)) {
                plan.variantes.protegidas += 1;
                plan.advertencias.push(
                    `El tono "${v.tono}" tiene pedidos asociados: se conserva y no se elimina.`
                );
                continue;
            }

            plan.variantes.eliminar += 1;
            plan.detalle.variantesEliminar.push(v.tono);
        }
    }

    if (clavesAmbiguas.size > 0) {
        plan.advertencias.push(
            `Hay ${clavesAmbiguas.size} grupo(s) de productos que comparten nombre y categoría: para distinguirlos sin riesgo, asigna un código (SKU) único a cada producto.`
        );
    }

    if (modo === 'combinar') {
        plan.advertencias.push(
            'Modo combinar: no se elimina ningun registro que no aparezca en el archivo.'
        );
    } else {
        plan.advertencias.push(
            'Modo reemplazar: los productos y tonos que no esten en el archivo se eliminan, salvo los que esten asociados a pedidos.'
        );
    }

    return { plan, mapaCategoria, mapaProducto, mapaVariante };
};

module.exports = {
    FORMATO,
    VERSION_FORMATO,
    TAMANO_MAXIMO_ARCHIVO,
    TAMANO_MAXIMO_IMAGENES,
    normalizar,
    referenciaImagenSegura,
    usaAlmacenamientoLocal,
    construirRespaldo,
    validarRespaldo,
    calcularPlan,
    emparejarProductos,
    claveProducto,
    aEntero,
    aDecimal,
    aBooleano,
    UPLOADS_DIR,
};
