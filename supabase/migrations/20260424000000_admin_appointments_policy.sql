-- Allow admins to read all appointments for financials and reporting
DO $$ BEGIN
  CREATE POLICY "Admins can view all appointments." 
  ON public.appointments FOR SELECT 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Allow admins to update appointments if needed
DO $$ BEGIN
  CREATE POLICY "Admins can update all appointments." 
  ON public.appointments FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Ensure manual_patients has RLS policies for staff
DO $$ BEGIN
  ALTER TABLE public.manual_patients ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can view manual patients."
  ON public.manual_patients FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')));
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE POLICY "Staff can manage manual patients."
  ON public.manual_patients FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('doctor', 'nurse', 'admin')));
EXCEPTION WHEN duplicate_object THEN null; END $$;
