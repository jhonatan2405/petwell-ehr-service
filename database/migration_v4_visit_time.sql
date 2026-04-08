-- Migration: Add visit_time column to ehr_records
-- Run this in: Supabase SQL Editor → EHR Service project

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ehr_records' AND column_name = 'visit_time'
    ) THEN
        ALTER TABLE ehr_records ADD COLUMN visit_time TIME DEFAULT NULL;
    END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'ehr_records' AND column_name = 'visit_time';
