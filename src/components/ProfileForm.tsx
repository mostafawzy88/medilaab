'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type Profile = {
  id: string
  email: string
  full_name: string
  phone_number: string | null
  instapay_address: string | null
  clinic_location: string | null
  role: string
}

export default function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const t = useTranslations('Profile')
  const [profile, setProfile] = useState(initialProfile)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        instapay_address: profile.instapay_address,
        clinic_location: profile.clinic_location
      })
      .eq('id', profile.id)

    if (!error) {
      setMessage(t('success_save'))
    } else {
      setMessage('Error: ' + error.message)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="p-8 sm:p-12 space-y-8">
           <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-blue-500/20">
                {profile.full_name?.charAt(0)}
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight">{t('title')}</h1>
                <p className="text-gray-500 uppercase text-xs font-black tracking-widest">{profile.role}</p>
              </div>
           </div>

           <form onSubmit={handleSave} className="space-y-6">
              {message && (
                <div className={`p-4 rounded-xl text-sm font-bold ${message.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                  {message}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('full_name')}</label>
                  <input 
                    type="text" 
                    value={profile.full_name || ''} 
                    onChange={e => setProfile({...profile, full_name: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('phone')}</label>
                  <input 
                    type="text" 
                    value={profile.phone_number || ''} 
                    onChange={e => setProfile({...profile, phone_number: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('email')}</label>
                <input 
                  type="email" 
                  disabled 
                  value={profile.email} 
                  className="w-full bg-gray-100 dark:bg-gray-800/50 text-gray-400 rounded-xl px-4 py-3 outline-none cursor-not-allowed font-medium"
                />
              </div>

              {(profile.role === 'doctor' || profile.role === 'admin') && (
                <div className="space-y-6 pt-4 border-t border-gray-50 dark:border-gray-800">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('instapay')}</label>
                    <input 
                      type="text" 
                      placeholder="username@instapay"
                      value={profile.instapay_address || ''} 
                      onChange={e => setProfile({...profile, instapay_address: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('clinic_location')}</label>
                    <textarea 
                      rows={2}
                      value={profile.clinic_location || ''} 
                      onChange={e => setProfile({...profile, clinic_location: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-4 outline-none ring-2 ring-transparent focus:ring-blue-600 transition-all font-medium"
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 mt-4"
              >
                {saving ? '...' : t('save')}
              </button>
           </form>
        </div>
      </div>
    </div>
  )
}
