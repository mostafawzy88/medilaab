-- Medilab Initial Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE & TYPES
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('admin', 'doctor', 'nurse', 'patient');
    ELSE
        -- Ensure 'nurse' value exists if the type was created previously without it
        BEGIN
            ALTER TYPE user_role ADD VALUE 'nurse';
        EXCEPTION
            WHEN duplicate_object THEN null;
        END;
    END IF;
END $$;

create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text not null,
  role user_role default 'patient'::user_role,
  phone_number text,
  instapay_address text, -- used for doctors
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Profiles
alter table public.profiles enable row level security;
drop policy if exists "Public profiles are viewable by everyone." on profiles;
drop policy if exists "Users can insert their own profile." on profiles;
drop policy if exists "Users can update own profile." on profiles;

create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- APPOINTMENTS TABLE & TYPES
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
        CREATE TYPE appointment_status AS ENUM ('scheduled', 'waiting', 'in_progress', 'completed', 'cancelled');
    END IF;
END $$;

create table if not exists public.appointments (
  id uuid default uuid_generate_v4() primary key,
  patient_id uuid references public.profiles(id) not null,
  doctor_id uuid references public.profiles(id) not null,
  scheduled_time timestamp with time zone not null,
  status appointment_status default 'scheduled'::appointment_status,
  queue_position integer, -- used for current day's queue
  fees numeric(10,2) default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Appointments
alter table public.appointments enable row level security;
drop policy if exists "Patients can view own appointments." on appointments;
drop policy if exists "Staff can view all appointments." on appointments;
drop policy if exists "Patients can insert their own appointments." on appointments;
drop policy if exists "Staff can update appointments." on appointments;

create policy "Patients can view own appointments." on appointments for select using (auth.uid() = patient_id);
create policy "Staff can view all appointments." on appointments for select using (exists (select 1 from profiles where id = auth.uid() and role in ('doctor', 'nurse', 'admin')));
create policy "Patients can insert their own appointments." on appointments for insert with check (auth.uid() = patient_id);
create policy "Staff can update appointments." on appointments for update using (exists (select 1 from profiles where id = auth.uid() and role in ('doctor', 'nurse', 'admin')));

-- PRESCRIPTIONS TABLE
create table if not exists public.prescriptions (
  id uuid default uuid_generate_v4() primary key,
  appointment_id uuid references public.appointments(id) on delete cascade,
  patient_id uuid references public.profiles(id) not null,
  doctor_id uuid references public.profiles(id) not null,
  medications jsonb not null default '[]'::jsonb, -- Array of objects: { name, dosage, instructions }
  diagnosis text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for Prescriptions
alter table public.prescriptions enable row level security;
drop policy if exists "Patients can view own prescriptions." on prescriptions;
drop policy if exists "Staff can view all prescriptions." on prescriptions;
drop policy if exists "Doctors can insert prescriptions." on prescriptions;
drop policy if exists "Doctors can update prescriptions." on prescriptions;

create policy "Patients can view own prescriptions." on prescriptions for select using (auth.uid() = patient_id);
create policy "Staff can view all prescriptions." on prescriptions for select using (exists (select 1 from profiles where id = auth.uid() and role in ('doctor', 'nurse', 'admin')));
create policy "Doctors can insert prescriptions." on prescriptions for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'doctor'));
create policy "Doctors can update prescriptions." on prescriptions for update using (exists (select 1 from profiles where id = auth.uid() and role = 'doctor')) with check (exists (select 1 from profiles where id = auth.uid() and role = 'doctor'));

-- SET UP TRIGGER FOR NEW USERS
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'patient')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
