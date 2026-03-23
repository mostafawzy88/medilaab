-- Add onboarding and authorization fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_authorized boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_doctor_id uuid REFERENCES public.profiles(id);

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.has_completed_onboarding IS 'True if the user has selected their role and (if patient) assigned doctor.';
COMMENT ON COLUMN public.profiles.is_authorized IS 'Used for doctors and nurses to restrict access until admin approval.';
COMMENT ON COLUMN public.profiles.assigned_doctor_id IS 'For patients, stores their selected primary doctor.';
