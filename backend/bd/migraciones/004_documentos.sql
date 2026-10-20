-- Historial de la aplicación: no se infieren revisiones de registros anteriores.
CREATE TABLE IF NOT EXISTS revisiones_tramites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tipo_tramite ENUM('pase','permiso') NOT NULL,
    tramite_id INT NOT NULL,
    propietario_id INT NOT NULL,
    accion VARCHAR(32) NOT NULL,
    estado_anterior VARCHAR(20) NULL,
    estado_nuevo VARCHAR(20) NOT NULL,
    actor_id VARCHAR(64) NOT NULL,
    actor_nombre VARCHAR(250) NOT NULL,
    actor_rol VARCHAR(32) NOT NULL,
    fecha DATETIME(3) NOT NULL,
    origen ENUM('aplicacion','sysadmin') NOT NULL,
    snapshot LONGTEXT NOT NULL CHECK (JSON_VALID(snapshot)),
    INDEX idx_revision_tramite (tipo_tramite,tramite_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
