-- ============================================================
-- PetWell — EHR Service  Migration v7
-- Row Level Security (RLS) — tabla: vaccinations
--
-- Ejecutar en Supabase SQL Editor DESPUÉS de:
--   migration_v3_vaccinations.sql
--   rls_security.sql (ehr_records, ehr_permissions, ehr_audit_logs)
-- ============================================================
--
-- ⚠️  IMPORTANTE — Por qué esto es seguro:
--
--   El EHR microservice usa SUPABASE_SERVICE_ROLE_KEY.
--   El service role bypassa RLS automáticamente en Supabase.
--   → Todos los INSERTs, UPDATEs y lecturas actuales del servicio
--     siguen funcionando sin cambios.
--
-- Esta migración es ADITIVA: no toca las políticas existentes de
-- ehr_records, ehr_permissions ni ehr_audit_logs.
--
-- Claims JWT usados:
--   auth.uid()             → UUID del usuario autenticado (sub)
--   jwt_claim('role')      → DUENO_MASCOTA | CLINIC_ADMIN | VETERINARIO
--   jwt_claim('clinic_id') → UUID de la clínica del usuario
-- ============================================================

-- Asegurar que el helper jwt_claim() existe (idempotente)
CREATE OR REPLACE FUNCTION public.jwt_claim(claim TEXT)
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json ->> claim,
    ''
  );
$$ LANGUAGE sql STABLE;

-- ============================================================
-- TABLA: vaccinations
-- Reglas de acceso:
--   SELECT : CLINIC_ADMIN / VETERINARIO de la clínica que vacunó
--            DUENO_MASCOTA puede leer vacunas de sus mascotas
--            (la validación de propiedad de mascota la hace el service layer)
--   INSERT : CLINIC_ADMIN / VETERINARIO de su clínica
--            (el microservicio usa service_role → bypass RLS automático)
--   UPDATE : CLINIC_ADMIN / VETERINARIO de su clínica
-- ============================================================

ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores (idempotente)
DROP POLICY IF EXISTS "vaccinations_select" ON vaccinations;
DROP POLICY IF EXISTS "vaccinations_insert" ON vaccinations;
DROP POLICY IF EXISTS "vaccinations_update" ON vaccinations;

-- SELECT ─────────────────────────────────────────────────────
CREATE POLICY "vaccinations_select"
ON vaccinations FOR SELECT
USING (
  -- Personal de clínica: solo registros de su propia clínica
  (
    public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
    AND public.jwt_claim('clinic_id')::uuid = clinic_id
  )
  -- Dueño de mascota: acceso de lectura
  -- La validación de que la mascota le pertenece se hace
  -- en el service layer (Pet Service cross-check), igual que ehr_records.
  OR public.jwt_claim('role') = 'DUENO_MASCOTA'
);

-- INSERT ─────────────────────────────────────────────────────
-- Solo personal de clínica puede registrar vacunas.
-- El microservicio lo hace con service_role (bypass automático).
CREATE POLICY "vaccinations_insert"
ON vaccinations FOR INSERT
WITH CHECK (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- UPDATE ─────────────────────────────────────────────────────
CREATE POLICY "vaccinations_update"
ON vaccinations FOR UPDATE
USING (
  public.jwt_claim('role') IN ('CLINIC_ADMIN', 'VETERINARIO')
  AND public.jwt_claim('clinic_id')::uuid = clinic_id
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Ver estado RLS:
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename = 'vaccinations';

-- Ver políticas:
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'vaccinations'
-- ORDER BY cmd;
