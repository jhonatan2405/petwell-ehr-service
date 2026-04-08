-- ============================================================
-- PetWell — EHR Service Migration v3
-- Vaccinations table
-- Run this in your Supabase SQL editor AFTER migration_v2_permissions_audit.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS vaccinations (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id           UUID        NOT NULL,
    clinic_id        UUID        NOT NULL,
    vaccine_name     VARCHAR(200) NOT NULL,
    application_date DATE        NOT NULL,
    next_due_date    DATE,
    batch_number     VARCHAR(100),
    veterinarian_id  UUID,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vacc_pet_id     ON vaccinations(pet_id);
CREATE INDEX IF NOT EXISTS idx_vacc_next_due   ON vaccinations(next_due_date);
CREATE INDEX IF NOT EXISTS idx_vacc_pet_clinic ON vaccinations(pet_id, clinic_id);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_vaccinations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vaccinations_updated_at ON vaccinations;

CREATE TRIGGER trg_vaccinations_updated_at
    BEFORE UPDATE ON vaccinations
    FOR EACH ROW
    EXECUTE FUNCTION update_vaccinations_updated_at();

-- Comments
COMMENT ON TABLE vaccinations IS 'Vaccination records for pets — managed by EHR Service (port 3004)';
COMMENT ON COLUMN vaccinations.pet_id           IS 'References pets.id in Pet Service (no FK — cross-service)';
COMMENT ON COLUMN vaccinations.clinic_id        IS 'Clinic that administered the vaccine (from JWT)';
COMMENT ON COLUMN vaccinations.vaccine_name     IS 'Name of the administered vaccine';
COMMENT ON COLUMN vaccinations.application_date IS 'Date the vaccine was administered';
COMMENT ON COLUMN vaccinations.next_due_date    IS 'Date of next required dose (optional)';
COMMENT ON COLUMN vaccinations.batch_number     IS 'Vaccine batch/lot number for traceability';
COMMENT ON COLUMN vaccinations.veterinarian_id  IS 'Veterinarian who administered the vaccine';
