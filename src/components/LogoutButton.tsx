'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from '@/i18n/routing'
import { useTranslations } from 'next-intl'

export default function LogoutButton() {
  const router = useRouter()
  const t = useTranslations('Dashboard')

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
    >
      {t('logout')}
    </button>
  )
}
