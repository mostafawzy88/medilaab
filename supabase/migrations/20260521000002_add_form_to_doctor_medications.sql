-- Migration: Add form column to doctor_medications
-- Allows categorizing medications by form: 'pill', 'drinking', 'cream', 'injection', 'drops', 'spray', 'other'

ALTER TABLE IF EXISTS public.doctor_medications 
ADD COLUMN IF NOT EXISTS form text DEFAULT 'pill';
