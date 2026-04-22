-- 1. Add plan_id to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS plan_id text DEFAULT 'basic';

-- 2. Create subscription_payments table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  plan_id text NOT NULL,
  duration_months integer NOT NULL,
  amount numeric(10,2) NOT NULL,
  receipt_url text NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  admin_notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS for subscription_payments
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view their own payments." 
ON public.subscription_payments FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can submit payments." 
ON public.subscription_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all payments." 
ON public.subscription_payments FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can update payments." 
ON public.subscription_payments FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 5. Storage Buckets (Manual setup usually required but SQL can help)
-- Insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
-- Insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) ON CONFLICT DO NOTHING;
