import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import OnboardingWizard from '@/components/OnboardingWizard';
import LogoutButton from '@/components/LogoutButton';

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Check if already completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('has_completed_onboarding')
    .eq('id', user.id)
    .single();

  if (profile?.has_completed_onboarding) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <OnboardingWizard locale={locale} />
        
        <div className="mt-8 text-center flex flex-col items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-1000 delay-500">
          <p className="text-gray-400 text-sm">Not you? Or having trouble?</p>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
