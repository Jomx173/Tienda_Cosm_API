-- ============================================================================
-- Migracion: tabla push_suscripcion (base de datos defaultdb, Aiven / MySQL 8)
-- Objetivo: añadir índices faltantes y corregir el valor predeterminado de
--           created_at en la tabla existente.
-- NO modifica ni elimina registros existentes.
-- El Paso 2 muestra los duplicados de endpoint_hash como consulta de solo
-- lectura. Antes de ejecutar la migración, compruebe por separado que dicha
-- consulta devuelve cero filas. Si devuelve duplicados, NO ejecute la
-- migración: resuelva los duplicados manualmente y vuelva a ejecutar.
-- Ejecutar a mano contra Aiven tras revisar el contenido.
-- ============================================================================

USE defaultdb;

-- ---------------------------------------------------------------------------
-- Paso 1: Verificar que la tabla push_suscripcion exista
-- ---------------------------------------------------------------------------
SELECT COUNT(*) AS tabla_existe
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name = 'push_suscripcion';

-- ---------------------------------------------------------------------------
-- Paso 2: Comprobar que NO existan hashes duplicados de endpoint_hash
-- Si esta consulta devuelve filas, DETÉNGASE. No cree ningún índice.
-- Resuelva los duplicados manualmente y vuelva a ejecutar la migración.
-- ---------------------------------------------------------------------------
SELECT endpoint_hash, COUNT(*) AS cantidad_duplicados
FROM push_suscripcion
GROUP BY endpoint_hash
HAVING COUNT(*) > 1;

-- ---------------------------------------------------------------------------
-- Paso 3: Crear índice único uq_push_suscripcion_endpoint_hash solo si no existe
-- Justificación del índice global (no compuesto con id_administrador):
--   La API deduplica a nivel de aplicación por (endpoint_hash, id_administrador),
--   pero en el estado actual de producción existe un único administrador
--   (id_administrador = 1) y no hay endpoints duplicados. Un endpoint de Push
--   API debería suscribirse una sola vez en el sistema, independientemente del
--   administrador que lo registre. Por tanto, un índice único global sobre
--   endpoint_hash es coherente con el uso actual y con la definición original
--   de la tabla en database/push_suscripcion.sql.
-- ---------------------------------------------------------------------------
SET @idx_unique_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'push_suscripcion'
      AND index_name = 'uq_push_suscripcion_endpoint_hash'
);

SET @sql_unique := IF(@idx_unique_exists = 0,
    'CREATE UNIQUE INDEX uq_push_suscripcion_endpoint_hash ON push_suscripcion (endpoint_hash)',
    'SELECT "Índice único uq_push_suscripcion_endpoint_hash ya existe" AS mensaje'
);

PREPARE stmt_unique FROM @sql_unique;
EXECUTE stmt_unique;
DEALLOCATE PREPARE stmt_unique;

-- ---------------------------------------------------------------------------
-- Paso 4: Crear índice idx_push_suscripcion_administrador solo si no existe
-- ---------------------------------------------------------------------------
SET @idx_admin_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'push_suscripcion'
      AND index_name = 'idx_push_suscripcion_administrador'
);

SET @sql_admin := IF(@idx_admin_exists = 0,
    'CREATE INDEX idx_push_suscripcion_administrador ON push_suscripcion (id_administrador)',
    'SELECT "Índice idx_push_suscripcion_administrador ya existe" AS mensaje'
);

PREPARE stmt_admin FROM @sql_admin;
EXECUTE stmt_admin;
DEALLOCATE PREPARE stmt_admin;

-- ---------------------------------------------------------------------------
-- Paso 5: Establecer created_at como DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
-- solo si todavía no tiene esa configuración.
-- Compatibilidad MySQL 8: DATETIME admite DEFAULT CURRENT_TIMESTAMP desde
-- MySQL 5.6. Esta sentencia no toca los valores existentes de las filas;
-- solo establece el valor predeterminado para futuras inserciones que no
-- proporcionen created_at.
-- ---------------------------------------------------------------------------
SET @col_default_exists := (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'push_suscripcion'
      AND column_name = 'created_at'
      AND data_type = 'datetime'
      AND is_nullable = 'NO'
      AND column_default = 'CURRENT_TIMESTAMP'
);

SET @sql_default := IF(@col_default_exists = 0,
    'ALTER TABLE push_suscripcion MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'SELECT "created_at ya tiene DEFAULT CURRENT_TIMESTAMP" AS mensaje'
);

PREPARE stmt_default FROM @sql_default;
EXECUTE stmt_default;
DEALLOCATE PREPARE stmt_default;

-- ---------------------------------------------------------------------------
-- Paso 6: Verificación final de estructura, índices y cantidad de registros
-- ---------------------------------------------------------------------------
SHOW INDEX FROM push_suscripcion;
DESCRIBE push_suscripcion;
SELECT COUNT(*) AS total_registros_preservados FROM push_suscripcion;
