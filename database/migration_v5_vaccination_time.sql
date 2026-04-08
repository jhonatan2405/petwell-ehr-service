-- Migration: Add application_time column to vaccinations table
-- Run this in: Supabase SQL Editor → EHR Service project

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'vaccinations' AND column_name = 'application_time'
    ) THEN
        ALTER TABLE vaccinations ADD COLUMN application_time TIME DEFAULT NULL;
    END IF;
END $$;

-- Reload PostgREST schema cache so the new column is recognized
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'vaccinations' AND column_name = 'application_time';
