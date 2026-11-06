-- ============================================================================
-- detallepedido: copia del color, el nombre y la imagen al momento de comprar
--
-- Objetivo: que cada línea del pedido conserve cómo se vendió el producto,
-- aunque después cambie el catálogo. Las filas antiguas quedan en NULL.
--
-- NO se ejecuta automáticamente ni desde la aplicación.
-- NO modifica, borra ni rellena datos existentes.
-- Es idempotente: solo agrega la columna si aún no existe.
-- ============================================================================

USE defaultdb;

-- ---------------------------------------------------------------------------
-- color
-- ---------------------------------------------------------------------------
SET @col_color := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'detallepedido'
      AND column_name = 'color'
);

SET @sql_color := IF(@col_color = 0,
    'ALTER TABLE detallepedido ADD COLUMN color VARCHAR(30) NULL DEFAULT NULL AFTER tono',
    'SELECT "La columna color ya existe" AS mensaje'
);

PREPARE stmt_color FROM @sql_color;
EXECUTE stmt_color;
DEALLOCATE PREPARE stmt_color;

-- ---------------------------------------------------------------------------
-- nombre
-- ---------------------------------------------------------------------------
SET @col_nombre := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'detallepedido'
      AND column_name = 'nombre'
);

SET @sql_nombre := IF(@col_nombre = 0,
    'ALTER TABLE detallepedido ADD COLUMN nombre VARCHAR(150) NULL DEFAULT NULL AFTER color',
    'SELECT "La columna nombre ya existe" AS mensaje'
);

PREPARE stmt_nombre FROM @sql_nombre;
EXECUTE stmt_nombre;
DEALLOCATE PREPARE stmt_nombre;

-- ---------------------------------------------------------------------------
-- imagen
-- ---------------------------------------------------------------------------
SET @col_imagen := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'detallepedido'
      AND column_name = 'imagen'
);

SET @sql_imagen := IF(@col_imagen = 0,
    'ALTER TABLE detallepedido ADD COLUMN imagen VARCHAR(255) NULL DEFAULT NULL AFTER nombre',
    'SELECT "La columna imagen ya existe" AS mensaje'
);

PREPARE stmt_imagen FROM @sql_imagen;
EXECUTE stmt_imagen;
DEALLOCATE PREPARE stmt_imagen;

-- ---------------------------------------------------------------------------
-- Verificación final (solo lectura)
-- ---------------------------------------------------------------------------
SHOW COLUMNS FROM detallepedido;
SELECT COUNT(*) AS total_lineas_preservadas FROM detallepedido;
