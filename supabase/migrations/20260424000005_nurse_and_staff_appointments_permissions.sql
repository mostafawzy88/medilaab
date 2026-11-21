-- Migration: 20260424000005_nurse_and_staff_appointments_permissions.sql
-- Description: Allow nurses, doctors, and clinic admins to insert, update, and manage appointments and queue data.

DO $$ 
BEGIN
  -- 1. Insert Policy
  DROP POLICY IF EXISTS "Staff and patients can insert appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Patients can insert their own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Patients create own appointments." ON public.appointments;

  CREATE POLICY "Staff and patients can insert appointments."
  ON public.appointments FOR INSERT
  WITH CHECK (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('doctor', 'nurse', 'admin')
    )
  );

  -- 2. Update Policy
  DROP POLICY IF EXISTS "Staff can update appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Doctors update own appointments." ON public.appointments;
  DROP POLICY IF EXISTS "Admins can update all appointments." ON public.appointments;

  CREATE POLICY "Staff can update appointments."
  ON public.appointments FOR UPDATE
  USING (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('doctor', 'nurse', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('doctor', 'nurse', 'admin')
    )
  );

  -- 3. Delete Policy
  DROP POLICY IF EXISTS "Staff can delete appointments." ON public.appointments;

  CREATE POLICY "Staff can delete appointments."
  ON public.appointments FOR DELETE
  USING (
    auth.uid() = patient_id
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('doctor', 'nurse', 'admin')
    )
  );

END $$;
