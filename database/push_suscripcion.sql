-- ============================================================================
-- Tabla: push_suscripcion (suscripciones Web Push de administradores)
-- Ejecutar a mano en la BD (local o Aiven).
-- Idempotente: CREATE TABLE IF NOT EXISTS, sin DROP, TRUNCATE ni DELETE.
-- Sin llave foranea a propósito: no depende del nombre ni del tipo de la tabla
-- de administradores. Las suscripciones vencidas las limpia la API (404/410).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `push_suscripcion` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `id_administrador` INT NOT NULL,
    `endpoint` TEXT NOT NULL,
    `endpoint_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 del endpoint (indice unico sin limite de longitud)',
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `user_agent` VARCHAR(255) DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_push_suscripcion_endpoint_hash` (`endpoint_hash`),
    KEY `idx_push_suscripcion_administrador` (`id_administrador`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
