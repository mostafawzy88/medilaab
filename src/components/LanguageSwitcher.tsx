'use client'

import { useLocale } from 'next-intl'
import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export default function LanguageSwitcher() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const currentLocale = useLocale()

  const toggleLanguage = () => {
    const nextLocale = currentLocale === 'en' ? 'ar' : 'en'
    const newPath = pathname.replace(`/${currentLocale}`, `/${nextLocale}`)
    
    startTransition(() => {
      router.replace(newPath)
    })
  }

  return (
    <button
      onClick={toggleLanguage}
      disabled={isPending}
      className="fixed bottom-6 right-6 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200 dark:border-gray-800 shadow-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-bold text-sm tracking-wide cursor-pointer flex items-center gap-2"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.065M15 20.25a8.232 8.232 0 01-1.844.324c-1.5.099-2.716-.1-3.665-.512a3.375 3.375 0 01-1.415-1.204 3.375 3.375 0 01-.351-1.846V15a2 2 0 01.586-1.414l.01-.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {currentLocale === 'en' ? 'العربية' : 'English'}
    </button>
  )
}
