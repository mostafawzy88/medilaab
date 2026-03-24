import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import Navbar from '@/components/Navbar';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('About');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  let fullName = '';
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    fullName = profile?.full_name || '';
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar fullName={fullName} />
      <main className="flex-1 p-6 md:p-12 animate-in fade-in duration-1000">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="space-y-4 text-center">
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white mb-6 uppercase tracking-tighter">{t('title')}</h1>
            <p className="text-xl text-gray-500 dark:text-gray-400 leading-relaxed max-w-2xl mx-auto">
              {t('description')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 hover:scale-[1.02] transition-all">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 rounded-2xl mb-6 shadow-sm">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('mission')}</h3>
              <p className="text-gray-500 text-sm leading-relaxed italic">
                Empowering healthcare providers in Egypt with state-of-the-art management tools to deliver world-class patient experiences.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 hover:scale-[1.02] transition-all">
              <div className="w-12 h-12 bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-teal-600 dark:text-teal-400 rounded-2xl mb-6 shadow-sm">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-2xl font-bold mb-4">{t('values')}</h3>
              <p className="text-gray-500 text-sm leading-relaxed italic">
                Transparency, Reliability, and Patient-Centric Innovation are the cornerstones of everything we build at Medilab.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
