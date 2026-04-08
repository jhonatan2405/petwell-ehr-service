-- ============================================================
-- PetWell — EHR Service Migration v2
-- Consentimiento entre clínicas + Auditoría de acciones
-- Run this SQL in your Supabase SQL editor AFTER schema.sql
-- ============================================================

-- Ensure UUID extension is enabled (may already be from schema.sql)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Consentimiento entre clínicas ─────────────────────────────────────────────
-- Un OWNER puede autorizar a una clínica a ver el historial de su mascota,
-- incluso si los registros fueron creados por otra clínica.

CREATE TABLE IF NOT EXISTS ehr_permissions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id      UUID        NOT NULL,
    clinic_id   UUID        NOT NULL,
    granted_by  UUID        NOT NULL,        -- user_id del OWNER que otorgó el permiso
    granted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Garantiza que una clínica solo tiene UN permiso por mascota
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_permission
ON ehr_permissions (pet_id, clinic_id);

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_perm_pet_id    ON ehr_permissions (pet_id);
CREATE INDEX IF NOT EXISTS idx_perm_clinic_id ON ehr_permissions (clinic_id);

COMMENT ON TABLE  ehr_permissions             IS 'Permisos explícitos de un OWNER para que una clínica acceda al historial de su mascota';
COMMENT ON COLUMN ehr_permissions.pet_id      IS 'ID de la mascota (cross-service, sin FK)';
COMMENT ON COLUMN ehr_permissions.clinic_id   IS 'ID de la clínica autorizada (cross-service, sin FK)';
COMMENT ON COLUMN ehr_permissions.granted_by  IS 'user_id del OWNER que otorgó el permiso';

-- ── Auditoría de acciones ─────────────────────────────────────────────────────
-- Registro inmutable de cada acción sobre los registros médicos.
-- Se inserta automáticamente desde la capa de servicio en Node.js.

CREATE TABLE IF NOT EXISTS ehr_audit_logs (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    ehr_id       UUID,                       -- NULL si la acción no aplica a un registro específico
    pet_id       UUID,
    action       VARCHAR(20) NOT NULL,        -- CREATE | VIEW | UPDATE | DELETE
    performed_by UUID        NOT NULL,        -- user_id del actor
    role         VARCHAR(50) NOT NULL,        -- OWNER | CLINIC | VETERINARIAN
    clinic_id    UUID,                        -- NULL para OWNER
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para las consultas más frecuentes
CREATE INDEX IF NOT EXISTS idx_audit_pet_id      ON ehr_audit_logs (pet_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON ehr_audit_logs (performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_ehr_id       ON ehr_audit_logs (ehr_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at   ON ehr_audit_logs (created_at DESC);

COMMENT ON TABLE  ehr_audit_logs              IS 'Registro de auditoría de acciones sobre historial médico — EHR Service v2';
COMMENT ON COLUMN ehr_audit_logs.ehr_id       IS 'ID del registro médico afectado (NULL para acciones de lista)';
COMMENT ON COLUMN ehr_audit_logs.action       IS 'Tipo de acción: CREATE, VIEW, UPDATE, DELETE';
COMMENT ON COLUMN ehr_audit_logs.performed_by IS 'user_id del usuario que realizó la acción';
COMMENT ON COLUMN ehr_audit_logs.role         IS 'Rol del actor al momento de la acción';
COMMENT ON COLUMN ehr_audit_logs.clinic_id    IS 'clinic_id del actor (NULL si es OWNER)';
