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

  return (
    <div className="bg-white/90 backdrop-blur-md border-b border-gray-100 dark:bg-[var(--color-ml-navy)] dark:border-[var(--color-ml-navy-light)] sticky top-0 z-40 h-20 flex items-center px-8">
      <div className="flex justify-between items-center w-full">
        {/* Left side empty for now (could be breadcrumbs or page title) */}
        <div></div>

        <div className="flex items-center gap-6">
          <Link 
            href={`/${locale}/profile`}
            className="flex items-center gap-3 px-4 py-2 rounded-full transition-all border border-gray-100 dark:border-[var(--color-ml-navy-light)] hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white flex items-center justify-center text-xs font-black shadow-sm">
              {fullName?.charAt(0)}
            </div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 hidden sm:inline">{fullName}</span>
          </Link>
          <div className="h-6 w-px bg-gray-200 dark:bg-[var(--color-ml-navy-light)] hidden sm:block"></div>
          <div className="hidden sm:block">
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}

