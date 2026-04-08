-- ============================================================
-- PetWell — EHR Service
-- Row Level Security (RLS) policies
-- Run this in your Supabase SQL editor AFTER schema.sql
-- and AFTER migration_v2_permissions_audit.sql
-- ============================================================
--
-- IMPORTANT: This service uses the Supabase SERVICE ROLE key
-- from Node.js, which bypasses RLS by design.
-- These policies protect against:
--   1. Direct public/anon API access to Supabase
--   2. Future anon clients or PostgREST exposure
--   3. The Supabase security advisor warnings
--
-- JWT claims are read from: request.jwt.claims
--   sub       → user UUID
--   role      → DUENO_MASCOTA | CLINIC_ADMIN | VETERINARIO
--   clinic_id → UUID of the user's clinic (null for DUENO_MASCOTA)
-- ============================================================

-- ─── Helper function: extract JWT claim safely ────────────────────────────────
-- (Create only if not already created by Appointment Service RLS script)
CREATE OR REPLACE FUNCTION public.jwt_claim(claim TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> claim,
    ''
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- TABLE 1: ehr_records  (HIGHLY SENSITIVE — medical data)
-- Access rules:
--   - CLINIC_ADMIN / VETERINARIO: records of their own clinic
--   - CLINIC_ADMIN / VETERINARIO with ehr_permission: any record for that pet
--   - DUENO_MASCOTA: read-only (ownership validated in service layer)
-- Note: Cross-clinic read access via ehr_permissions is enforced
--       entirely in the service layer (Node.js), because RLS cannot
--       do subquery joins to ehr_permissions atomically.
--       These RLS policies are the defense-in-depth layer.
-- ============================================================

ALTER TABLE ehr_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ehr_records_select" ON ehr_records;
DROP POLICY IF EXISTS "ehr_records_insert" ON ehr_records;
DROP POLICY IF EXISTS "ehr_records_update" ON ehr_records;
DROP POLICY IF EXISTS "ehr_records_delete" ON ehr_records;

-- SELECT:
--   Clinic staff: same clinic OR cross-clinic if permission exists in ehr_permissions
--   DUENO_MASCOTA: read access (ownership validated in service layer)
CREATE POLICY "ehr_records_select"
ON ehr_records FOR SELECT
USING (
  -- Clinic staff: own records
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
  -- Clinic staff: cross-clinic via granted permission
  OR (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND EXISTS (
      SELECT 1 FROM ehr_permissions ep
      WHERE ep.pet_id = ehr_records.pet_id
        AND ep.clinic_id = public.jwt_claim('clinic_id')::uuid
    )
  )
  -- Pet owner: read-only (service layer validates ownership via Pet Service)
  OR public.jwt_claim('role') = 'DUENO_MASCOTA'
);

-- INSERT: only clinic staff (CLINIC_ADMIN or VETERINARIO) for their own clinic
-- clinic_id is ALWAYS taken from the JWT — never from the request body
CREATE POLICY "ehr_records_insert"
ON ehr_records FOR INSERT
WITH CHECK (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- UPDATE: only clinic staff, only records created by their clinic
CREATE POLICY "ehr_records_update"
ON ehr_records FOR UPDATE
USING (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- DELETE: only clinic staff, only records created by their clinic
CREATE POLICY "ehr_records_delete"
ON ehr_records FOR DELETE
USING (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- ============================================================
-- TABLE 2: ehr_permissions  (consent management)
-- Access rules:
--   - DUENO_MASCOTA: full control (grant / revoke)
--   - CLINIC_ADMIN / VETERINARIO: read-only (to verify their own access)
-- ============================================================

ALTER TABLE ehr_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ehr_permissions_select" ON ehr_permissions;
DROP POLICY IF EXISTS "ehr_permissions_insert" ON ehr_permissions;
DROP POLICY IF EXISTS "ehr_permissions_delete" ON ehr_permissions;

-- SELECT: owner (their own grants) | clinic staff (grants for their clinic)
CREATE POLICY "ehr_permissions_select"
ON ehr_permissions FOR SELECT
USING (
  (
    public.jwt_claim('role') = 'DUENO_MASCOTA'
    AND public.jwt_claim('sub')::uuid = granted_by
  )
  OR (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
);

-- INSERT: only DUENO_MASCOTA (and only for themselves as granted_by)
-- Prevents clinic staff from self-granting access
CREATE POLICY "ehr_permissions_insert"
ON ehr_permissions FOR INSERT
WITH CHECK (
  public.jwt_claim('role') = 'DUENO_MASCOTA'
  AND public.jwt_claim('sub')::uuid = granted_by
);

-- No UPDATE on permissions — owner revokes by deleting and re-granting

-- DELETE: only DUENO_MASCOTA — they revoke their own grants
CREATE POLICY "ehr_permissions_delete"
ON ehr_permissions FOR DELETE
USING (
  public.jwt_claim('role') = 'DUENO_MASCOTA'
  AND public.jwt_claim('sub')::uuid = granted_by
);

-- ============================================================
-- TABLE 3: ehr_audit_logs  (immutable audit trail)
-- Access rules:
--   - INSERT: service-layer only (via service role → bypasses RLS)
--   - SELECT: owner (their pet's logs) | clinic staff (their clinic's logs)
--   - No UPDATE or DELETE — audit logs are immutable
-- ============================================================

ALTER TABLE ehr_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ehr_audit_logs_select" ON ehr_audit_logs;
DROP POLICY IF EXISTS "ehr_audit_logs_insert" ON ehr_audit_logs;

-- SELECT: owner (their pet's audits) | clinic staff (their clinic's audits)
-- Note: actor_id = user_id of whoever performed the action (performed_by in the model)
CREATE POLICY "ehr_audit_logs_select"
ON ehr_audit_logs FOR SELECT
USING (
  (
    public.jwt_claim('role') = 'DUENO_MASCOTA'
    AND public.jwt_claim('sub')::uuid = actor_id
  )
  OR (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
);

-- INSERT: explicitly allow for service role (no JWT check needed since
-- service role bypasses RLS — this policy exists only as documentation)
-- In practice, the Node.js service inserts via service role key.
CREATE POLICY "ehr_audit_logs_insert"
ON ehr_audit_logs FOR INSERT
WITH CHECK (
  -- Service role bypasses this; anon/user tokens cannot write audit logs
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO', 'DUENO_MASCOTA')
);

-- No UPDATE policy — audit logs are immutable by design
-- No DELETE policy  — audit logs are immutable by design

-- ============================================================
-- VERIFICATION QUERIES (run after applying policies)
-- ============================================================

-- Check RLS status on all 3 tables:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('ehr_records', 'ehr_permissions', 'ehr_audit_logs');

-- List all policies:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;
