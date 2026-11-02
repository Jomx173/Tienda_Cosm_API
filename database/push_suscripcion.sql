-- ============================================================================
-- Tabla: push_suscripcion (suscripciones Web Push de administradores)
-- Ejecutar a mano en la BD (local o Aiven).
-- Idempotente: CREATE TABLE IF NOT EXISTS, sin DROP, TRUNCATE ni DELETE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `push_suscripcion` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `id_administrador` INT UNSIGNED NOT NULL,
    `endpoint` TEXT NOT NULL,
    `endpoint_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 del endpoint (índice único sin límite de longitud)',
    `p256dh` TEXT NOT NULL,
    `auth` TEXT NOT NULL,
    `user_agent` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_push_suscripcion_endpoint_hash` (`endpoint_hash`),
    KEY `idx_push_suscripcion_administrador` (`id_administrador`),
    CONSTRAINT `fk_push_suscripcion_administrador`
        FOREIGN KEY (`id_administrador`) REFERENCES `Administrador` (`id_admin`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
