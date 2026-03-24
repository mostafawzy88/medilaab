-- 1. Expand profiles for clinic operations
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS working_hours jsonb DEFAULT '{"mon": "09:00-17:00", "tue": "09:00-17:00", "wed": "09:00-17:00", "thu": "09:00-17:00", "fri": "Closed", "sat": "10:00-14:00", "sun": "Closed"}'::jsonb,
ADD COLUMN IF NOT EXISTS latitude numeric(10,8),
ADD COLUMN IF NOT EXISTS longitude numeric(11,8),
ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.profiles(id); -- For nurses to link to a doctor

-- 2. Update appointment statuses
-- We already have 'scheduled', let's treat it as 'confirmed'. 
-- We'll use 'waiting' as the initial state if needed, or add 'pending'.
-- For now, let's just make 'status' default to 'scheduled' and assume it needs staff confirmation.

-- 3. Add subscription status to profiles for Admin tracking
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active'; -- 'active', 'suspended', 'trial'

-- 4. RLS update: Nurses can see patients of their supervisor
CREATE POLICY "Nurses can view supervisor's appointments." 
ON public.appointments FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE id = auth.uid() AND role = 'nurse' AND supervisor_id = appointments.doctor_id
));

-- 5. Add comments
COMMENT ON COLUMN public.profiles.working_hours IS 'Weekly schedule for the doctor/clinic.';
COMMENT ON COLUMN public.profiles.supervisor_id IS 'Linking a nurse to their supervising doctor.';
