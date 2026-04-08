-- ============================================================
-- PetWell — EHR Service Migration v3
-- Fix audit logs column renaming
-- Run this SQL in your Supabase SQL editor
-- ============================================================

ALTER TABLE ehr_audit_logs RENAME COLUMN performed_by TO actor_id;

ALTER INDEX IF EXISTS idx_audit_performed_by RENAME TO idx_audit_actor_id;

COMMENT ON COLUMN ehr_audit_logs.actor_id IS 'user_id del usuario que realizó la acción';

ALTER TABLE ehr_audit_logs ALTER COLUMN created_at SET NOT NULL;
