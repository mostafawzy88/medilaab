'use client'

import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import LogoutButton from './LogoutButton'

export default function Sidebar({ fullName, role }: { fullName: string, role?: string }) {
  const t = useTranslations('Navigation')
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'

  const getNavItems = () => {
    switch (role) {
      case 'admin':
        return [
          { id: 'overview', name: 'Overview', icon: '📊' },
          { id: 'staff', name: 'Staff', icon: '👥' },
          { id: 'patients', name: 'Patients', icon: '🫂' },
          { id: 'stats', name: 'Financials', icon: '💰' },
          { id: 'settings', name: 'Settings', icon: '⚙️' },
        ]
      case 'doctor':
        return [
          { id: 'schedule', name: 'Schedule', icon: '📅' },
          { id: 'queue', name: 'Queue', icon: '📋' },
          { id: 'requests', name: 'Requests', icon: '📥' },
          { id: 'patients', name: 'Patients', icon: '👥' },
          { id: 'stats', name: 'Statistics', icon: '📈' },
          { id: 'meds', name: 'Medications', icon: '💊' },
        ]
      case 'nurse':
        return [
          { id: 'schedule', name: 'Schedule', icon: '📅' },
          { id: 'queue', name: 'Queue', icon: '📋' },
          { id: 'requests', name: 'Requests', icon: '📥' },
          { id: 'patients', name: 'Patients', icon: '👥' },
        ]
      case 'patient':
        return [
          { id: 'overview', name: t('dashboard') || 'Dashboard', icon: '🏠' },
          { id: 'doctors', name: t('my_doctors') || 'My Doctors', icon: '⚕️' },
          { id: 'bookings', name: t('my_bookings') || 'My Bookings', icon: '📅' },
          { id: 'prescriptions', name: 'Prescriptions', icon: '💊' },
        ]
      default:
        return []
    }
  }

  const items = getNavItems()

  return (
    <div className="w-64 bg-[var(--color-ml-navy)] text-white flex flex-col h-screen sticky top-0 border-r border-[var(--color-ml-navy-light)]">
      {/* Brand */}
      <div className="h-20 flex items-center px-6 border-b border-[var(--color-ml-navy-light)]">
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-3 font-black text-2xl tracking-tighter text-white hover:scale-105 transition-all">
          <div className="w-10 h-10 overflow-hidden relative rounded-xl bg-white/10 p-1 flex items-center justify-center">
            <img src="/logo.png" alt="MediLab" className="w-[140%] max-w-none absolute top-[-10%]" />
          </div>
          MediLab
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
        {items.map((item) => {
          const isActive = activeTab === item.id || (activeTab === 'overview' && item.id === 'queue' && role === 'doctor') // fallback
          return (
            <Link
              key={item.id}
              href={`/${locale}/dashboard?tab=${item.id}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                isActive 
                  ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-lg shadow-blue-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-[var(--color-ml-navy-light)]'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Area at bottom of Sidebar */}
      <div className="p-4 border-t border-[var(--color-ml-navy-light)] space-y-4">
         <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-[var(--color-ml-navy-light)]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white flex items-center justify-center text-xs font-black">
              {fullName?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-sm font-bold text-white truncate">{fullName}</p>
               <p className="text-[10px] text-gray-400 uppercase font-black">{role}</p>
            </div>
         </div>
         
         <div className="space-y-2">
            <LogoutButton />
         </div>
      </div>
    </div>
  )
}
