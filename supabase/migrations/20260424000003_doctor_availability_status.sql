-- Migration: Add availability_status column to profiles and update live queue RPC
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS availability_status text DEFAULT 'available';

-- Ensure values are constrained to 'available', 'busy', 'unavailable'
COMMENT ON COLUMN public.profiles.availability_status IS 'Doctor live availability: available, busy, unavailable';

-- Update get_doctor_live_queue RPC to return doctor availability status
CREATE OR REPLACE FUNCTION public.get_doctor_live_queue(p_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_in_progress record;
  v_total_today int;
  v_waiting_count int;
  v_queue jsonb;
  v_status text;
BEGIN
  -- Get doctor availability status from profiles
  SELECT coalesce(availability_status, working_hours->>'current_status', 'available')
  INTO v_status
  FROM profiles
  WHERE id = p_doctor_id;

  IF v_status IS NULL THEN
    v_status := 'available';
  END IF;

  -- Find active consultation
  SELECT queue_position, id
  INTO v_in_progress
  FROM appointments
  WHERE doctor_id = p_doctor_id
    AND scheduled_time::date = v_today
    AND status = 'in_progress'
    AND coalesce(appointment_type, '') != 'home_visit'
  LIMIT 1;

  -- Count total clinic visits today
  SELECT count(*)
  INTO v_total_today
  FROM appointments
  WHERE doctor_id = p_doctor_id
    AND scheduled_time::date = v_today
    AND coalesce(appointment_type, '') != 'home_visit'
    AND status IN ('scheduled', 'in_progress');

  -- Count patients waiting outside
  SELECT count(*)
  INTO v_waiting_count
  FROM appointments
  WHERE doctor_id = p_doctor_id
    AND scheduled_time::date = v_today
    AND coalesce(appointment_type, '') != 'home_visit'
    AND status = 'scheduled';

  -- Build queue array (excludes home visits)
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'queue_position', a.queue_position,
      'status', a.status,
      'scheduled_time', a.scheduled_time,
      'is_arrived', (a.notes IS NOT NULL AND a.notes LIKE '%[ARRIVED:%')
    ) ORDER BY a.queue_position ASC
  ), '[]'::jsonb)
  INTO v_queue
  FROM appointments a
  WHERE a.doctor_id = p_doctor_id
    AND a.scheduled_time::date = v_today
    AND coalesce(a.appointment_type, '') != 'home_visit'
    AND a.status IN ('scheduled', 'in_progress');

  RETURN jsonb_build_object(
    'is_in_consultation', (v_in_progress.id IS NOT NULL OR v_status = 'busy'),
    'current_serving_position', coalesce(v_in_progress.queue_position, 0),
    'total_clinic_today', v_total_today,
    'waiting_outside_count', v_waiting_count,
    'queue', v_queue,
    'doctor_status', v_status,
    'is_unavailable', (v_status = 'unavailable')
  );
END;
$$;
