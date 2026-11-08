-- ==============================================================================
-- Migration: Live Queue, Patient Arrival, and Home Visit Separation
-- File: supabase/migrations/20260424000002_live_queue_and_arrival.sql
-- ==============================================================================

-- 1. Ensure notes and arrival can be updated by patients on their own appointments
-- Patients can update their own appointment notes (e.g. [ARRIVED: <timestamp>])
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'appointments' AND policyname = 'Patients can update own appointments.'
  ) THEN
    CREATE POLICY "Patients can update own appointments."
    ON public.appointments FOR UPDATE USING (auth.uid() = patient_id);
  END IF;
END $$;

-- 2. Trigger to correctly assign sequential queue numbers for clinic appointments
-- Excludes 'home_visit' so home visits NEVER consume clinic queue slots!
CREATE OR REPLACE FUNCTION public.assign_appointment_queue_position()
RETURNS trigger AS $$
DECLARE
  max_pos integer;
  apt_date date;
BEGIN
  -- Home visits do not occupy a waiting room queue position
  IF NEW.appointment_type = 'home_visit' THEN
    NEW.queue_position := NULL;
    RETURN NEW;
  END IF;

  apt_date := (NEW.scheduled_time AT TIME ZONE 'UTC')::date;

  -- If queue_position is not provided or <= 1, calculate true next position for this doctor on this day
  IF NEW.queue_position IS NULL OR NEW.queue_position <= 1 THEN
    SELECT COALESCE(MAX(queue_position), 0) INTO max_pos
    FROM public.appointments
    WHERE doctor_id = NEW.doctor_id
      AND (appointment_type IS NULL OR appointment_type != 'home_visit')
      AND (scheduled_time AT TIME ZONE 'UTC')::date = apt_date
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    NEW.queue_position := max_pos + 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assign_queue_pos ON public.appointments;
CREATE TRIGGER trg_assign_queue_pos
BEFORE INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.assign_appointment_queue_position();

-- 3. Secure RPC: Get Doctor Live Queue (for Patients to track free status & wait times)
-- Completely anonymizes other patients' names to comply with patient privacy / HIPAA
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(p_doctor_id uuid)
RETURNS json AS $$
DECLARE
  v_in_progress_pos integer := 0;
  v_in_progress_id uuid := NULL;
  v_total_clinic_today integer := 0;
  v_waiting_outside integer := 0;
  v_serving_patient_started_at timestamptz := NULL;
  v_queue_list json := '[]'::json;
BEGIN
  -- 1. Check current consultation in progress
  SELECT id, queue_position, created_at INTO v_in_progress_id, v_in_progress_pos, v_serving_patient_started_at
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status = 'in_progress'
    AND (appointment_type IS NULL OR appointment_type != 'home_visit')
    AND (scheduled_time AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  ORDER BY queue_position ASC
  LIMIT 1;

  -- 2. Count total clinic appointments today
  SELECT COUNT(*) INTO v_total_clinic_today
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND (appointment_type IS NULL OR appointment_type != 'home_visit')
    AND status IN ('scheduled', 'in_progress', 'completed')
    AND (scheduled_time AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;

  -- 3. Count waiting patients (scheduled & not completed)
  SELECT COUNT(*) INTO v_waiting_outside
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND (appointment_type IS NULL OR appointment_type != 'home_visit')
    AND status = 'scheduled'
    AND (scheduled_time AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;

  -- 4. Anonymized Queue list for accurate relative wait calculation
  SELECT COALESCE(json_agg(json_build_object(
    'id', id,
    'queue_position', queue_position,
    'status', status,
    'scheduled_time', scheduled_time,
    'is_arrived', (notes LIKE '%[ARRIVED:%')
  ) ORDER BY queue_position ASC, scheduled_time ASC), '[]'::json) INTO v_queue_list
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND (appointment_type IS NULL OR appointment_type != 'home_visit')
    AND status IN ('scheduled', 'in_progress')
    AND (scheduled_time AT TIME ZONE 'UTC')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;

  RETURN json_build_object(
    'doctor_id', p_doctor_id,
    'is_in_consultation', (v_in_progress_id IS NOT NULL),
    'current_serving_position', COALESCE(v_in_progress_pos, 0),
    'serving_started_at', v_serving_patient_started_at,
    'total_clinic_today', COALESCE(v_total_clinic_today, 0),
    'waiting_outside_count', COALESCE(v_waiting_outside, 0),
    'queue', v_queue_list
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_doctor_live_queue(uuid) TO authenticated;
