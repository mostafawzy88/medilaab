import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import Navbar from '@/components/Navbar';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('Contact');
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
      <main className="flex-1 p-6 md:p-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <h1 className="text-5xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">{t('title')}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed">{t('subtitle')}</p>
            
            <div className="space-y-6 pt-12">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <span className="font-bold text-sm tracking-tight">{t('address')}</span>
               </div>
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center text-teal-600">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </div>
                  <span className="font-bold text-sm tracking-tight">{t('phone')}</span>
               </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl p-8 shadow-2xl">
            <form className="space-y-6">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">{t('form_name')}</label>
                <input type="text" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">{t('form_email')}</label>
                <input type="email" className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-500 mb-2">{t('form_msg')}</label>
                <textarea rows={4} className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl px-4 py-4 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium text-sm" />
              </div>
              <button className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all text-sm tracking-tight">
                {t('send')}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
