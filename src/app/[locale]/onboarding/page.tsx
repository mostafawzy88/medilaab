import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import OnboardingWizard from '@/components/OnboardingWizard';

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
      <OnboardingWizard locale={locale} />
    </div>
  );
}
