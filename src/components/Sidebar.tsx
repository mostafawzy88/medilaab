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
          { id: 'requests', name: 'Requests', icon: 'Inbox' }, // Replaced with emoji later
          { id: 'stats', name: 'Statistics', icon: '📈' },
          { id: 'meds', name: 'Medications', icon: '💊' },
        ]
      case 'nurse':
        return [
          { id: 'schedule', name: 'Schedule', icon: '📅' },
          { id: 'queue', name: 'Queue', icon: '📋' },
          { id: 'requests', name: 'Requests', icon: 'Inbox' },
        ]
      case 'patient':
        return [
          { id: 'overview', name: 'Dashboard', icon: '🏠' },
          { id: 'doctors', name: 'My Doctors', icon: '⚕️' },
          { id: 'bookings', name: 'My Bookings', icon: '📅' },
        ]
      default:
        return []
    }
  }

  const items = getNavItems()

  // Replace 'Inbox' placeholder with emoji based on rendering limitations
  items.forEach(item => {
      if(item.icon === 'Inbox') item.icon = '📥'
  })

  return (
    <div className="w-64 bg-[var(--color-cp-navy)] text-white flex flex-col h-screen sticky top-0 border-r border-[#2A214D]">
      {/* Brand */}
      <div className="h-20 flex items-center px-6 border-b border-[#2A214D]">
        <Link href={`/${locale}/dashboard`} className="flex font-black text-2xl tracking-tighter text-white hover:scale-105 transition-all">
          Medilab
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
                  ? 'bg-[var(--color-cp-purple)] text-white shadow-lg shadow-purple-500/20' 
                  : 'text-gray-400 hover:text-white hover:bg-[#2A214D]'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Area at bottom of Sidebar */}
      <div className="p-4 border-t border-[#2A214D]">
         <div className="flex items-center gap-3 px-4 py-3 bg-[#1D1438] rounded-xl mb-3 border border-[#2A214D]">
            <div className="w-8 h-8 rounded-full bg-[var(--color-cp-purple)] text-white flex items-center justify-center text-xs font-black">
              {fullName?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
               <p className="text-sm font-bold text-white truncate">{fullName}</p>
               <p className="text-[10px] text-gray-400 uppercase font-black">{role}</p>
            </div>
         </div>
      </div>
    </div>
  )
}
