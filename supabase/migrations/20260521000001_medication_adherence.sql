-- Medication adherence log table
CREATE TABLE IF NOT EXISTS public.medication_adherence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  slot TEXT NOT NULL, -- morning, midday, evening, night, bedtime
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  confirmed_by TEXT DEFAULT 'patient',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.medication_adherence_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can insert own logs" ON medication_adherence_logs
  FOR INSERT WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients can read own logs" ON medication_adherence_logs
  FOR SELECT USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can read patient logs" ON medication_adherence_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')
    )
  );
