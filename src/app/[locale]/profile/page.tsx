import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/ProfileForm';

import Navbar from '@/components/Navbar';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, phone_number, instapay_address, clinic_location, role, working_hours, latitude, longitude, specialization, bio, fees_normal, fees_urgent, fees_home_visit, email, subscription_expires_at')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar fullName={profile.full_name} role={profile.role} />
      <main className="flex-1 p-6 md:p-12">
        <ProfileForm initialProfile={profile} />
      </main>
    </div>
  );
}
