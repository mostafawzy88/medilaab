-- RPC function to compute public doctor stats, busy times, and returning patient metrics
-- Runs as SECURITY DEFINER so patients can view aggregated statistics without exposing private patient data

CREATE OR REPLACE FUNCTION public.get_doctor_public_stats(p_doctor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visits_last_week integer := 0;
  v_total_visits integer := 0;
  v_unique_patients integer := 0;
  v_returning_patients integer := 0;
  v_retention_rate integer := 0;
  v_busiest_day text := 'Monday';
  v_busiest_shift text := 'Evening Rush (4:00 PM - 8:00 PM)';
  v_quiet_hours text := 'Morning (9:00 AM - 12:00 PM)';
  v_doctor record;
  v_day_record record;
  v_hour_record record;
  v_result jsonb;
BEGIN
  -- 1. Fetch doctor profile data
  SELECT full_name, specialization, bio, clinic_location, working_hours, phone_number,
         fees_normal, fees_urgent, fees_home_visit, created_at
  INTO v_doctor
  FROM public.profiles
  WHERE id = p_doctor_id;

  -- 2. Visits in the last 7 days
  SELECT COUNT(*)
  INTO v_visits_last_week
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status != 'cancelled'
    AND scheduled_time >= (now() - interval '7 days');

  -- 3. Total non-cancelled visits
  SELECT COUNT(*)
  INTO v_total_visits
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status != 'cancelled';

  -- 4. Unique vs Returning patients count & retention
  WITH patient_counts AS (
    SELECT COALESCE(patient_id::text, manual_patient_id::text) AS pid, COUNT(*) AS cnt
    FROM public.appointments
    WHERE doctor_id = p_doctor_id
      AND status != 'cancelled'
      AND (patient_id IS NOT NULL OR manual_patient_id IS NOT NULL)
    GROUP BY COALESCE(patient_id::text, manual_patient_id::text)
  )
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE cnt > 1)
  INTO v_unique_patients, v_returning_patients
  FROM patient_counts;

  IF v_unique_patients > 0 THEN
    v_retention_rate := ROUND((v_returning_patients::numeric / v_unique_patients::numeric) * 100);
  ELSE
    v_retention_rate := 85; -- Default clinic satisfaction estimate if new
  END IF;

  -- 5. Busiest Day of week
  SELECT 
    to_char(scheduled_time, 'FMDay') AS day_name,
    COUNT(*) AS cnt
  INTO v_day_record
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status != 'cancelled'
  GROUP BY to_char(scheduled_time, 'FMDay')
  ORDER BY cnt DESC
  LIMIT 1;

  IF v_day_record.day_name IS NOT NULL THEN
    v_busiest_day := TRIM(v_day_record.day_name);
  END IF;

  -- 6. Busiest Hour
  SELECT 
    EXTRACT(HOUR FROM scheduled_time)::integer AS hr,
    COUNT(*) AS cnt
  INTO v_hour_record
  FROM public.appointments
  WHERE doctor_id = p_doctor_id
    AND status != 'cancelled'
  GROUP BY EXTRACT(HOUR FROM scheduled_time)::integer
  ORDER BY cnt DESC
  LIMIT 1;

  IF v_hour_record.hr IS NOT NULL THEN
    IF v_hour_record.hr >= 8 AND v_hour_record.hr < 12 THEN
      v_busiest_shift := 'Morning (8:00 AM - 12:00 PM)';
      v_quiet_hours := 'Afternoon (1:00 PM - 4:00 PM)';
    ELSIF v_hour_record.hr >= 12 AND v_hour_record.hr < 16 THEN
      v_busiest_shift := 'Afternoon (12:00 PM - 4:00 PM)';
      v_quiet_hours := 'Morning (9:00 AM - 12:00 PM)';
    ELSIF v_hour_record.hr >= 16 AND v_hour_record.hr < 20 THEN
      v_busiest_shift := 'Evening Rush (4:00 PM - 8:00 PM)';
      v_quiet_hours := 'Morning (10:00 AM - 1:00 PM)';
    ELSE
      v_busiest_shift := 'Night (8:00 PM - 11:00 PM)';
      v_quiet_hours := 'Early Afternoon (12:00 PM - 3:00 PM)';
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'doctor_id', p_doctor_id,
    'full_name', v_doctor.full_name,
    'specialization', COALESCE(v_doctor.specialization, 'General Practitioner'),
    'bio', v_doctor.bio,
    'clinic_location', v_doctor.clinic_location,
    'phone_number', v_doctor.phone_number,
    'working_hours', v_doctor.working_hours,
    'fees_normal', COALESCE(v_doctor.fees_normal, 350.00),
    'fees_urgent', COALESCE(v_doctor.fees_urgent, 500.00),
    'fees_home_visit', COALESCE(v_doctor.fees_home_visit, 1000.00),
    'visits_last_week', v_visits_last_week,
    'total_visits', v_total_visits,
    'unique_patients', v_unique_patients,
    'returning_patients', v_returning_patients,
    'retention_rate', v_retention_rate,
    'busiest_day', v_busiest_day,
    'busiest_shift', v_busiest_shift,
    'quiet_hours', v_quiet_hours
  );

  RETURN v_result;
END;
$$;
