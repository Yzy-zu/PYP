-- Fase 3: cuotas sobre fecha de uso y estados activos. Solo BD de trabajo.
-- La aplicación serializa por usuario; estos triggers añaden defensa para SQL directo.
ALTER TABLE pases_salida ADD INDEX IF NOT EXISTS idx_pases_usuario_fecha (usuario_id,fecha_uso);
ALTER TABLE permisos_goce ADD INDEX IF NOT EXISTS idx_permisos_usuario_fecha (usuario_id,fecha_inicio);
DROP TRIGGER IF EXISTS trg_limite_pases_mensuales_ins;
DROP TRIGGER IF EXISTS trg_limite_pases_mensuales_upd;
DROP TRIGGER IF EXISTS check_limite_cuatrimestral_permisos;
DROP TRIGGER IF EXISTS trg_reglas_pase_ins;
DROP TRIGGER IF EXISTS trg_reglas_pase_upd;
DROP TRIGGER IF EXISTS trg_reglas_permiso_ins;
DROP TRIGGER IF EXISTS trg_reglas_permiso_upd;
DELIMITER $$
CREATE TRIGGER trg_reglas_pase_ins BEFORE INSERT ON pases_salida FOR EACH ROW
BEGIN
    DECLARE total_activos INT DEFAULT 0;
    DECLARE nacimiento DATE;
    DECLARE cuenta_activa TINYINT;
    SELECT fecha_nacimiento,activo INTO nacimiento,cuenta_activa FROM usuarios WHERE id=NEW.usuario_id FOR UPDATE;
    IF NEW.estado IN ('Pendiente','Vo.Bo.','Aprobado') THEN
        IF cuenta_activa IS NULL OR cuenta_activa<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El solicitante no está activo.'; END IF;
        IF NEW.fecha_uso IS NULL OR DAYOFWEEK(NEW.fecha_uso) IN (1,7) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha debe ser un día laborable.'; END IF;
        IF EXISTS(SELECT id FROM dias_festivos WHERE fecha=NEW.fecha_uso) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha es festiva.'; END IF;
        IF NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo))=0 OR CHAR_LENGTH(NEW.motivo)>2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Motivo inválido: usa entre 1 y 2000 caracteres.'; END IF;
        IF NEW.hora_inicio IS NULL OR NEW.hora_fin IS NULL OR NEW.hora_inicio<'07:00:00' OR NEW.hora_fin>'20:00:00' OR NEW.hora_fin<=NEW.hora_inicio OR TIME_TO_SEC(NEW.hora_fin)-TIME_TO_SEC(NEW.hora_inicio)>10800 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Horario inválido: entre 07:00 y 20:00, fin posterior y máximo 3 horas.';
        END IF;
        SELECT COUNT(*) INTO total_activos FROM pases_salida WHERE usuario_id=NEW.usuario_id
            AND YEAR(fecha_uso)=YEAR(NEW.fecha_uso) AND MONTH(fecha_uso)=MONTH(NEW.fecha_uso)
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0;
        IF total_activos>=3 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Límite de 3 pases activos por mes.'; END IF;
        IF EXISTS(SELECT id FROM pases_salida WHERE usuario_id=NEW.usuario_id AND fecha_uso=NEW.fecha_uso
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0)
            OR EXISTS(SELECT id FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND fecha_inicio<=NEW.fecha_uso AND fecha_fin>=NEW.fecha_uso
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un trámite activo para esta fecha.';
        END IF;
    END IF;
END$$
CREATE TRIGGER trg_reglas_pase_upd BEFORE UPDATE ON pases_salida FOR EACH ROW
BEGIN
    DECLARE total_activos INT DEFAULT 0;
    DECLARE nacimiento DATE;
    DECLARE cuenta_activa TINYINT;
    SELECT fecha_nacimiento,activo INTO nacimiento,cuenta_activa FROM usuarios WHERE id=NEW.usuario_id FOR UPDATE;
    IF NEW.usuario_id<>OLD.usuario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No se puede cambiar el propietario del trámite.'; END IF;
    IF NEW.estado IN ('Pendiente','Vo.Bo.','Aprobado') THEN
        IF cuenta_activa IS NULL OR cuenta_activa<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El solicitante no está activo.'; END IF;
        IF NEW.fecha_uso IS NULL OR DAYOFWEEK(NEW.fecha_uso) IN (1,7) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha debe ser un día laborable.'; END IF;
        IF EXISTS(SELECT id FROM dias_festivos WHERE fecha=NEW.fecha_uso) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha es festiva.'; END IF;
        IF NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo))=0 OR CHAR_LENGTH(NEW.motivo)>2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Motivo inválido: usa entre 1 y 2000 caracteres.'; END IF;
        IF NEW.hora_inicio IS NULL OR NEW.hora_fin IS NULL OR NEW.hora_inicio<'07:00:00' OR NEW.hora_fin>'20:00:00' OR NEW.hora_fin<=NEW.hora_inicio OR TIME_TO_SEC(NEW.hora_fin)-TIME_TO_SEC(NEW.hora_inicio)>10800 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Horario inválido: entre 07:00 y 20:00, fin posterior y máximo 3 horas.';
        END IF;
        SELECT COUNT(*) INTO total_activos FROM pases_salida WHERE usuario_id=NEW.usuario_id
            AND YEAR(fecha_uso)=YEAR(NEW.fecha_uso) AND MONTH(fecha_uso)=MONTH(NEW.fecha_uso)
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>OLD.id;
        IF total_activos>=3 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Límite de 3 pases activos por mes.'; END IF;
        IF EXISTS(SELECT id FROM pases_salida WHERE usuario_id=NEW.usuario_id AND fecha_uso=NEW.fecha_uso
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>OLD.id)
            OR EXISTS(SELECT id FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND fecha_inicio<=NEW.fecha_uso AND fecha_fin>=NEW.fecha_uso
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un trámite activo para esta fecha.';
        END IF;
    END IF;
END$$
CREATE TRIGGER trg_reglas_permiso_ins BEFORE INSERT ON permisos_goce FOR EACH ROW
BEGIN
    DECLARE total_activos INT DEFAULT 0;
    DECLARE nacimiento DATE;
    DECLARE cuenta_activa TINYINT;
    SELECT fecha_nacimiento,activo INTO nacimiento,cuenta_activa FROM usuarios WHERE id=NEW.usuario_id FOR UPDATE;
    IF NEW.estado IN ('Pendiente','Vo.Bo.','Aprobado') THEN
        IF cuenta_activa IS NULL OR cuenta_activa<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El solicitante no está activo.'; END IF;
        IF NEW.fecha_inicio IS NULL OR DAYOFWEEK(NEW.fecha_inicio) IN (1,7) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha debe ser un día laborable.'; END IF;
        IF EXISTS(SELECT id FROM dias_festivos WHERE fecha=NEW.fecha_inicio) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha es festiva.'; END IF;
        IF NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo))=0 OR CHAR_LENGTH(NEW.motivo)>2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Motivo inválido: usa entre 1 y 2000 caracteres.'; END IF;
        IF NEW.fecha_fin IS NULL OR NEW.fecha_inicio<>NEW.fecha_fin OR NEW.cantidad_dias IS NULL OR NEW.cantidad_dias<>1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cada permiso debe corresponder a un solo día.';
        END IF;
        IF NEW.tipo_permiso='Cumpleaños' THEN
            IF nacimiento IS NULL OR MONTH(nacimiento)<>MONTH(NEW.fecha_inicio) OR DAY(nacimiento)<>DAY(NEW.fecha_inicio) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cumpleaños requiere la fecha exacta de nacimiento.';
            END IF;
            SELECT COUNT(*) INTO total_activos FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND tipo_permiso='Cumpleaños'
                AND YEAR(fecha_inicio)=YEAR(NEW.fecha_inicio) AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0;
            IF total_activos>=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un cumpleaños activo en ese año.'; END IF;
        ELSE
            SELECT COUNT(*) INTO total_activos FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND tipo_permiso<>'Cumpleaños'
                AND YEAR(fecha_inicio)=YEAR(NEW.fecha_inicio) AND FLOOR((MONTH(fecha_inicio)-1)/4)=FLOOR((MONTH(NEW.fecha_inicio)-1)/4)
                AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0;
            IF total_activos>=3 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Límite de 3 permisos ordinarios activos por cuatrimestre.'; END IF;
        END IF;
        IF EXISTS(SELECT id FROM pases_salida WHERE usuario_id=NEW.usuario_id AND fecha_uso=NEW.fecha_inicio
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0)
            OR EXISTS(SELECT id FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND fecha_inicio<=NEW.fecha_inicio AND fecha_fin>=NEW.fecha_inicio
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un trámite activo para esta fecha.';
        END IF;
    END IF;
END$$
CREATE TRIGGER trg_reglas_permiso_upd BEFORE UPDATE ON permisos_goce FOR EACH ROW
BEGIN
    DECLARE total_activos INT DEFAULT 0;
    DECLARE nacimiento DATE;
    DECLARE cuenta_activa TINYINT;
    SELECT fecha_nacimiento,activo INTO nacimiento,cuenta_activa FROM usuarios WHERE id=NEW.usuario_id FOR UPDATE;
    IF NEW.usuario_id<>OLD.usuario_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='No se puede cambiar el propietario del trámite.'; END IF;
    IF NEW.estado IN ('Pendiente','Vo.Bo.','Aprobado') THEN
        IF cuenta_activa IS NULL OR cuenta_activa<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='El solicitante no está activo.'; END IF;
        IF NEW.fecha_inicio IS NULL OR DAYOFWEEK(NEW.fecha_inicio) IN (1,7) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha debe ser un día laborable.'; END IF;
        IF EXISTS(SELECT id FROM dias_festivos WHERE fecha=NEW.fecha_inicio) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='La fecha es festiva.'; END IF;
        IF NEW.motivo IS NULL OR CHAR_LENGTH(TRIM(NEW.motivo))=0 OR CHAR_LENGTH(NEW.motivo)>2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Motivo inválido: usa entre 1 y 2000 caracteres.'; END IF;
        IF NEW.fecha_fin IS NULL OR NEW.fecha_inicio<>NEW.fecha_fin OR NEW.cantidad_dias IS NULL OR NEW.cantidad_dias<>1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cada permiso debe corresponder a un solo día.';
        END IF;
        IF NEW.tipo_permiso='Cumpleaños' THEN
            IF nacimiento IS NULL OR MONTH(nacimiento)<>MONTH(NEW.fecha_inicio) OR DAY(nacimiento)<>DAY(NEW.fecha_inicio) THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cumpleaños requiere la fecha exacta de nacimiento.';
            END IF;
            SELECT COUNT(*) INTO total_activos FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND tipo_permiso='Cumpleaños'
                AND YEAR(fecha_inicio)=YEAR(NEW.fecha_inicio) AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>OLD.id;
            IF total_activos>=1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un cumpleaños activo en ese año.'; END IF;
        ELSE
            SELECT COUNT(*) INTO total_activos FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND tipo_permiso<>'Cumpleaños'
                AND YEAR(fecha_inicio)=YEAR(NEW.fecha_inicio) AND FLOOR((MONTH(fecha_inicio)-1)/4)=FLOOR((MONTH(NEW.fecha_inicio)-1)/4)
                AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>OLD.id;
            IF total_activos>=3 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Límite de 3 permisos ordinarios activos por cuatrimestre.'; END IF;
        END IF;
        IF EXISTS(SELECT id FROM pases_salida WHERE usuario_id=NEW.usuario_id AND fecha_uso=NEW.fecha_inicio
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>0)
            OR EXISTS(SELECT id FROM permisos_goce WHERE usuario_id=NEW.usuario_id AND fecha_inicio<=NEW.fecha_inicio AND fecha_fin>=NEW.fecha_inicio
            AND estado IN ('Pendiente','Vo.Bo.','Aprobado') AND id<>OLD.id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Ya existe un trámite activo para esta fecha.';
        END IF;
    END IF;
END$$
DELIMITER ;
