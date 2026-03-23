import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function IndexPage() {
  const t = await getTranslations('Index');
  
  // Check auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-[family-name:var(--font-geist-sans)] selection:bg-blue-300 selection:text-blue-900">
      <main className="flex flex-col items-center justify-center pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
          Next-Generation Clinic OS
        </div>
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 max-w-4xl text-balance animate-in zoom-in-95 duration-700">
          Transform your clinic with <span className="bg-gradient-to-r from-blue-600 to-teal-400 bg-clip-text text-transparent">Medilab</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 mb-12 max-w-2xl text-balance animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
          {t('title')}. Streamline appointments, reduce wait times, and accept InstaPay seamlessly. Built perfectly for the Egyptian healthcare ecosystem.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <Link
            href="/login"
            className="group relative inline-flex justify-center items-center gap-2 overflow-hidden rounded-full bg-blue-600 px-8 py-4 font-semibold text-white transition-all hover:bg-blue-700 hover:scale-105 shadow-xl shadow-blue-500/20"
          >
            Get Started
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
          <a
            href="#features"
            className="inline-flex justify-center items-center gap-2 rounded-full bg-white dark:bg-slate-900 px-8 py-4 font-semibold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-105 shadow-md"
          >
            Explore Features
          </a>
        </div>
      </main>

      {/* Aesthetic decorative elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none" />
    </div>
  );
}
