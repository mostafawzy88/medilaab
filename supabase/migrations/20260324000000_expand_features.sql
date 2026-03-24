-- 1. Add clinic_location to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS clinic_location text;

-- 2. Create certifications table for clinic-issued documents
CREATE TABLE IF NOT EXISTS public.certifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id uuid REFERENCES public.profiles(id) NOT NULL,
  doctor_id uuid REFERENCES public.profiles(id) NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  file_url text, -- If we upload a PDF/Image
  issued_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. RLS for Certifications
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view own certifications." 
ON public.certifications FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Staff can view and issue certifications." 
ON public.certifications FOR ALL USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')
));

-- 4. Add comments
COMMENT ON COLUMN public.profiles.clinic_location IS 'Physical address of the clinic for doctors/nurses.';
COMMENT ON TABLE public.certifications IS 'Documents and medical certificates issued by the clinic to patients.';
