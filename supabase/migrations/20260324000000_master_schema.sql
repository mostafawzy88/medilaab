-- ==========================================
-- MEDILAB MASTER SCHEMA
-- This single file contains all required configurations.
-- Run this completely in the Supabase SQL Editor.
-- ==========================================

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'nurse', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM ('scheduled', 'waiting', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Profiles Table (Core Users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  role user_role DEFAULT 'patient'::user_role,
  avatar_url text,
  phone_number text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Step 2: Onboarding & Auth Fields
  has_completed_onboarding boolean DEFAULT false,
  is_authorized boolean DEFAULT false,
  assigned_doctor_id uuid REFERENCES public.profiles(id),
  
  -- Step 3: Payment & Location Fields
  instapay_address text,
  clinic_location text,
  
  -- Step 4: SaaS Operations Fields
  working_hours jsonb DEFAULT '{"mon": "09:00-17:00", "tue": "09:00-17:00", "wed": "09:00-17:00", "thu": "09:00-17:00", "fri": "Closed", "sat": "10:00-14:00", "sun": "Closed"}'::jsonb,
  latitude numeric(10,8),
  longitude numeric(11,8),
  supervisor_id uuid REFERENCES public.profiles(id),
  subscription_status text DEFAULT 'active',
  
  -- Step 5: Professional Info
  specialization text,
  bio text
);

-- 3. Create Appointments Table
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id uuid REFERENCES public.profiles(id) NOT NULL,
  doctor_id uuid REFERENCES public.profiles(id) NOT NULL,
  scheduled_time timestamp with time zone NOT NULL,
  status appointment_status DEFAULT 'waiting'::appointment_status,
  notes text,
  queue_position integer,
  fees numeric(10,2) DEFAULT 350.00,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Prescriptions Table
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES public.profiles(id) NOT NULL,
  patient_id uuid REFERENCES public.profiles(id) NOT NULL,
  medications jsonb NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Certifications Table
CREATE TABLE IF NOT EXISTS public.certifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id uuid REFERENCES public.profiles(id) NOT NULL,
  doctor_id uuid REFERENCES public.profiles(id) NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  file_url text,
  issued_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Trigger to create profile after Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'patient');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists to replace it safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Turn on Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

-- 8. Setup RLS Policies (Safely dropping existing ones if needed)
-- (We use DO blocks to avoid errors if policies already exist)

-- Profiles Policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
EXCEPTION WHEN undefined_object THEN null; END $$;

CREATE POLICY "Profiles are viewable by everyone." 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can initialize own profile." 
ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update profiles." 
ON public.profiles FOR UPDATE USING (
  (auth.uid() = id) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
);

-- Appointments Policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Patients view own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Doctors view own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Patients create own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Doctors update own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Nurses can view supervisor's appointments." ON public.appointments;
EXCEPTION WHEN undefined_object THEN null; END $$;

CREATE POLICY "Patients view own appointments." 
ON public.appointments FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Doctors view own appointments." 
ON public.appointments FOR SELECT USING (auth.uid() = doctor_id);

CREATE POLICY "Patients create own appointments." 
ON public.appointments FOR INSERT WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Doctors update own appointments." 
ON public.appointments FOR UPDATE USING (auth.uid() = doctor_id);

CREATE POLICY "Nurses can view supervisor's appointments." 
ON public.appointments FOR SELECT USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE id = auth.uid() AND role = 'nurse' AND supervisor_id = appointments.doctor_id
));

-- Prescriptions Policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Patients view own prescriptions." ON public.prescriptions;
  DROP POLICY IF EXISTS "Doctors create/view prescriptions." ON public.prescriptions;
EXCEPTION WHEN undefined_object THEN null; END $$;

CREATE POLICY "Patients view own prescriptions." 
ON public.prescriptions FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Doctors create/view prescriptions." 
ON public.prescriptions FOR ALL USING (auth.uid() = doctor_id);

-- Certifications Policies
DO $$ BEGIN
  DROP POLICY IF EXISTS "Patients can view own certifications." ON public.certifications;
  DROP POLICY IF EXISTS "Staff can view all certifications." ON public.certifications;
  DROP POLICY IF EXISTS "Medical staff can issue certifications." ON public.certifications;
EXCEPTION WHEN undefined_object THEN null; END $$;

CREATE POLICY "Patients can view own certifications." ON public.certifications FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY "Staff can view all certifications." ON public.certifications FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')));
CREATE POLICY "Medical staff can issue certifications." ON public.certifications FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'admin')));

-- 9. Commenting on objects
COMMENT ON TABLE public.profiles IS 'Core users including patients, doctors, nurses, and admins.';
COMMENT ON TABLE public.certifications IS 'Documents and medical certificates issued by the clinic to patients.';
COMMENT ON COLUMN public.profiles.supervisor_id IS 'Linking a nurse to their supervising clinic or doctor.';
