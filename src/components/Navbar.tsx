'use client'

import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

export default function Navbar({ fullName, role }: { fullName: string, role?: string }) {
  const t = useTranslations('Navigation')
  const dt = useTranslations('Dashboard')
  const locale = useLocale()
  const pathname = usePathname()

  const navItems = role === 'admin' 
    ? [{ name: t('dashboard'), href: `/${locale}/dashboard` }]
    : [
        { name: t('dashboard'), href: `/${locale}/dashboard` },
        { name: t('about'), href: `/${locale}/about` },
        { name: t('contact'), href: `/${locale}/contact` },
      ]

  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <div className="flex items-center gap-8">
            <Link href={`/${locale}/dashboard`} className="flex font-black text-2xl tracking-tighter text-blue-600 dark:text-blue-400 hover:scale-105 transition-all">
              Medilab
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    pathname === item.href 
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                      : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Link 
              href={`/${locale}/profile`}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border ${
                pathname === `/${locale}/profile` 
                  ? 'border-blue-200 bg-blue-50 text-blue-600' 
                  : 'border-transparent text-gray-600 hover:bg-gray-50'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black">
                {fullName?.charAt(0)}
              </div>
              <span className="text-sm font-bold hidden sm:inline">{t('profile')}</span>
            </Link>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 hidden sm:block"></div>
            <div className="hidden sm:block">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
