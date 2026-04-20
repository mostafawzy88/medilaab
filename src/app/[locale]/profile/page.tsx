import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/ProfileForm';
import Sidebar from '@/components/Sidebar';
import LogoutButton from '@/components/LogoutButton';
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

  const fullName = profile.full_name || 'User';
  const role = profile.role || 'patient';

  return (
    <div className="min-h-screen flex bg-[var(--color-cp-grey-bg)] dark:bg-[#0A0614] font-[family-name:var(--font-geist-sans)]">
      <div className="hidden lg:block">
        <Sidebar fullName={fullName} role={role} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar fullName={fullName} role={role} />

        <main className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
          {/* Mobile Navigation Header */}
          <div className="lg:hidden w-full p-4 bg-[var(--color-cp-navy)] text-white rounded-[24px] shadow-lg mb-8 flex justify-between items-center">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-[var(--color-cp-purple)] flex items-center justify-center font-black">
                 {fullName?.charAt(0)}
               </div>
               <div>
                 <span className="text-sm font-bold block">{fullName}</span>
                 <span className="text-[10px] uppercase font-black text-gray-400">{role}</span>
               </div>
             </div>
             <LogoutButton />
          </div>

          <div className="mx-auto w-full max-w-4xl">
            <ProfileForm initialProfile={profile} />
          </div>
        </main>
      </div>
    </div>
  );
}
