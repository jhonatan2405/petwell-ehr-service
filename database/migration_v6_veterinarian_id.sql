-- Migration: Add veterinarian_id column to ehr_records
-- Run this in: Supabase SQL Editor → EHR Service project

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ehr_records' AND column_name = 'veterinarian_id'
    ) THEN
        ALTER TABLE ehr_records ADD COLUMN veterinarian_id UUID DEFAULT NULL;
    END IF;
END $$;

-- Reload PostgREST schema cache so the backend API recognizes the new column
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ehr_records' AND column_name = 'veterinarian_id';
