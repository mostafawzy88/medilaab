-- ==============================================================================
-- Migration: Family Members, Doctor Reviews, and Payment Verification Flow
-- File: supabase/migrations/20260424000004_family_members_and_reviews.sql
-- ==============================================================================

-- 1. Create Patient Family Members Table
CREATE TABLE IF NOT EXISTS public.patient_family_members (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  patient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  full_name text NOT NULL,
  relationship text NOT NULL, -- 'Son', 'Daughter', 'Spouse', 'Father', 'Mother', 'Brother', 'Sister', 'Other'
  gender text, -- 'male', 'female'
  birth_date date,
  age integer,
  medical_history text,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for patient_family_members
ALTER TABLE public.patient_family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients manage their own family members." ON public.patient_family_members;
CREATE POLICY "Patients manage their own family members."
ON public.patient_family_members FOR ALL
USING (auth.uid() = patient_id)
WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Staff can view family members." ON public.patient_family_members;
CREATE POLICY "Staff can view family members."
ON public.patient_family_members FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')));


-- 2. Create Doctor Reviews & Ratings Table (Social Media / Medical Experts style)
CREATE TABLE IF NOT EXISTS public.doctor_reviews (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  doctor_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  patient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  review_text text,
  tags text[] DEFAULT '{}'::text[],
  likes_count integer DEFAULT 0,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for doctor_reviews
ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view doctor reviews." ON public.doctor_reviews;
CREATE POLICY "Anyone can view doctor reviews."
ON public.doctor_reviews FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Patients create reviews." ON public.doctor_reviews;
CREATE POLICY "Patients create reviews."
ON public.doctor_reviews FOR INSERT
WITH CHECK (auth.uid() = patient_id);

DROP POLICY IF EXISTS "Patients update own reviews." ON public.doctor_reviews;
CREATE POLICY "Patients update own reviews."
ON public.doctor_reviews FOR UPDATE
USING (auth.uid() = patient_id);


-- 3. Expand appointments table for family members and payment confirmation tracking
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES public.patient_family_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS family_member_name text,
ADD COLUMN IF NOT EXISTS payment_reference text,
ADD COLUMN IF NOT EXISTS payment_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz;


-- 4. RPC to like a doctor review (social interaction)
CREATE OR REPLACE FUNCTION public.like_doctor_review(p_review_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_new_likes integer;
BEGIN
  UPDATE public.doctor_reviews
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = p_review_id
  RETURNING likes_count INTO v_new_likes;

  RETURN COALESCE(v_new_likes, 0);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.like_doctor_review(uuid) TO authenticated, anon;
