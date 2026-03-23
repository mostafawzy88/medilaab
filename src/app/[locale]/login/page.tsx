import { getTranslations } from 'next-intl/server';
import { login, signup, signInWithGoogle } from '@/app/auth/actions';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ message: string }>
}) {
  const { locale } = await params;
  const { message } = await searchParams;
  const t = await getTranslations('Auth');

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2 mt-20 mx-auto">
      <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl p-8 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-blue-600 to-teal-400 bg-clip-text text-transparent">
          Welcome to Medilab
        </h2>

        <form className="animate-in flex-1 flex flex-col w-full justify-center gap-4 text-foreground">
          <label className="text-md font-medium" htmlFor="email">
            {t('email')}
          </label>
          <input
            className="rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
            focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
            name="email"
            placeholder="you@example.com"
            required
          />
          
          <label className="text-md font-medium mt-2" htmlFor="password">
            {t('password')}
          </label>
          <input
            className="rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
            focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
            type="password"
            name="password"
            placeholder="••••••••"
            required
          />

          <div className="flex gap-4 mt-6">
            <button
              formAction={login.bind(null, locale)}
              className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 
              text-white px-4 py-3 rounded-xl shadow-lg shadow-blue-500/30 transition-all font-semibold hover:-translate-y-0.5"
            >
              {t('login')}
            </button>
            <button
              formAction={signup.bind(null, locale)}
              className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 
              dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 px-4 py-3 rounded-xl transition-all font-semibold"
            >
              Sign Up
            </button>
          </div>

          <div className="mt-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
            <span className="text-sm text-gray-500">OR</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800"></div>
          </div>

          <button
            formAction={signInWithGoogle.bind(null, locale)}
            className="mt-4 flex items-center justify-center gap-3 w-full bg-white dark:bg-gray-800 text-gray-900 
            dark:text-white border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 
            px-4 py-3 rounded-xl transition-all font-semibold shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('google')}
          </button>

          {message && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-center text-sm font-medium border border-red-100 dark:border-red-900/50">
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
