-- ============================================================
-- PetWell — EHR Service Database Schema
-- Run this SQL in your Supabase SQL editor
-- ============================================================

-- Enable the UUID extension (may already be enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Main table ────────────────────────────────────────────────────────────────
CREATE TABLE ehr_records (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pet_id          UUID        NOT NULL,
    clinic_id       UUID        NOT NULL,
    veterinarian_id UUID,
    visit_date      DATE        NOT NULL,
    reason          TEXT,
    anamnesis       TEXT,
    diagnosis       TEXT,
    treatment       TEXT,
    prescriptions   TEXT,
    lab_results     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
-- Used by GET /ehr/pet/:petId
CREATE INDEX idx_ehr_pet_id    ON ehr_records(pet_id);
-- Used for clinic-scoped queries
CREATE INDEX idx_ehr_clinic_id ON ehr_records(clinic_id);
-- Combined index for the most common access pattern
CREATE INDEX idx_ehr_pet_clinic ON ehr_records(pet_id, clinic_id);

-- ── Auto-update trigger for updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_ehr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ehr_records_updated_at
    BEFORE UPDATE ON ehr_records
    FOR EACH ROW
    EXECUTE FUNCTION update_ehr_updated_at();

-- ── Comments (documentation) ─────────────────────────────────────────────────
COMMENT ON TABLE  ehr_records              IS 'Electronic health records for pets — managed by EHR Service (port 3004)';
COMMENT ON COLUMN ehr_records.pet_id       IS 'References pets.id in Pet Service (no FK — cross-service)';
COMMENT ON COLUMN ehr_records.clinic_id    IS 'References the clinic that created this record (from JWT)';
COMMENT ON COLUMN ehr_records.veterinarian_id IS 'Optional: user_id of the attending veterinarian';
COMMENT ON COLUMN ehr_records.visit_date   IS 'Date of the veterinary visit';
COMMENT ON COLUMN ehr_records.reason       IS 'Chief complaint / reason for visit';
COMMENT ON COLUMN ehr_records.anamnesis    IS 'Patient clinical history';
COMMENT ON COLUMN ehr_records.diagnosis    IS 'Veterinarian diagnosis';
COMMENT ON COLUMN ehr_records.treatment    IS 'Prescribed treatment';
COMMENT ON COLUMN ehr_records.prescriptions IS 'Medications and dosages';
COMMENT ON COLUMN ehr_records.lab_results  IS 'Laboratory test results';
COMMENT ON COLUMN ehr_records.notes        IS 'Additional observations';
