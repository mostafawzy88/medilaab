'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type Profile = {
  id: string
  full_name: string
  phone_number: string | null
  instapay_address: string | null
  clinic_location: string | null
  role: string
  specialization: string | null
  bio: string | null
  working_hours?: any
  latitude?: number | null
  longitude?: number | null
}

const SPECIALIZATIONS = [
  'General Practice', 'Internal Medicine', 'Cardiology', 'Dermatology',
  'Endocrinology', 'Gastroenterology', 'Neurology', 'Obstetrics & Gynecology',
  'Ophthalmology', 'Orthopedics', 'Otolaryngology (ENT)', 'Pediatrics',
  'Psychiatry', 'Pulmonology', 'Radiology', 'Surgery', 'Urology', 'Other'
]

const DEFAULT_HOURS = { mon: '09:00-17:00', tue: '09:00-17:00', wed: '09:00-17:00', thu: '09:00-17:00', fri: 'Closed', sat: '10:00-14:00', sun: 'Closed' }
const DAYS = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' }, { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' }
]

export default function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const t = useTranslations('Profile')
  const [profile, setProfile] = useState<Profile>(initialProfile)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const getHours = (): Record<string, string> => {
    if (!profile.working_hours) return DEFAULT_HOURS
    if (typeof profile.working_hours === 'string') {
      try { return JSON.parse(profile.working_hours) } catch { return DEFAULT_HOURS }
    }
    return profile.working_hours
  }

  const setDayHours = (day: string, value: string) => {
    const current = getHours()
    setProfile({ ...profile, working_hours: { ...current, [day]: value } })
  }

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
        clinic_location: profile.clinic_location,
        latitude: profile.latitude,
        longitude: profile.longitude,
        working_hours: getHours(),
        specialization: profile.specialization,
        bio: profile.bio,
      })
      .eq('id', profile.id)

    setSaving(false)
    if (!error) {
      setMessage('✓ Profile saved successfully!')
    } else {
      setMessage('Error: ' + error.message)
    }
  }

  const hours = getHours()
  const isStaff = profile.role === 'doctor' || profile.role === 'nurse'

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-teal-500 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur border border-white/30 flex items-center justify-center text-white text-3xl font-black shadow-lg">
            {profile.full_name?.charAt(0) || '?'}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{profile.full_name || 'Your Profile'}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">
                {profile.role}
              </span>
              {profile.specialization && (
                <span className="text-xs font-medium text-blue-100">{profile.specialization}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {message && (
          <div className={`p-4 rounded-2xl text-sm font-bold ${message.includes('Error') ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200' : 'bg-green-50 dark:bg-green-900/20 text-green-600 border border-green-200'}`}>
            {message}
          </div>
        )}

        {/* Basic Info */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Basic Info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('full_name')}</label>
              <input
                type="text"
                value={profile.full_name || ''}
                onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-widest text-gray-500">Phone Number</label>
              <input
                type="tel"
                value={profile.phone_number || ''}
                onChange={e => setProfile({ ...profile, phone_number: e.target.value })}
                className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium"
              />
            </div>
          </div>
        </div>

        {/* Doctor/Nurse Professional Info */}
        {isStaff && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-5">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Professional Info</h2>
              {profile.role === 'doctor' && (
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500">Specialization</label>
                  <select
                    value={profile.specialization || ''}
                    onChange={e => setProfile({ ...profile, specialization: e.target.value })}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium"
                  >
                    <option value="">Select your specialty...</option>
                    {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">Bio / About</label>
                <textarea
                  rows={4}
                  placeholder="Write a short bio for patients to read..."
                  value={profile.bio || ''}
                  onChange={e => setProfile({ ...profile, bio: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-4 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('instapay')}</label>
                <input
                  type="text"
                  placeholder="username@instapay"
                  value={profile.instapay_address || ''}
                  onChange={e => setProfile({ ...profile, instapay_address: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium"
                />
              </div>
            </div>

            {/* Clinic Info */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-5">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Clinic Details</h2>
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('clinic_location')}</label>
                <textarea
                  rows={2}
                  placeholder="Full clinic address..."
                  value={profile.clinic_location || ''}
                  onChange={e => setProfile({ ...profile, clinic_location: e.target.value })}
                  className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-4 outline-none ring-2 ring-transparent focus:ring-blue-500 transition-all font-medium resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500">Latitude</label>
                  <input
                    type="number" step="any"
                    value={profile.latitude || ''}
                    onChange={e => setProfile({ ...profile, latitude: parseFloat(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500">Longitude</label>
                  <input
                    type="number" step="any"
                    value={profile.longitude || ''}
                    onChange={e => setProfile({ ...profile, longitude: parseFloat(e.target.value) })}
                    className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 outline-none ring-2 ring-transparent focus:ring-blue-500 font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Working Hours */}
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400">Working Hours</h2>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {DAYS.map(({ key, label }) => {
                  const val = hours[key] || 'Closed'
                  const isClosed = val === 'Closed'
                  return (
                    <div key={key} className="flex items-center justify-between py-3 gap-4">
                      <div className="w-28">
                        <span className="text-sm font-bold">{label}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-1">
                        <button
                          type="button"
                          onClick={() => setDayHours(key, isClosed ? '09:00-17:00' : 'Closed')}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isClosed ? 'bg-gray-200 dark:bg-gray-700' : 'bg-blue-600'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${isClosed ? 'translate-x-0' : 'translate-x-5'}`} />
                        </button>
                        <span className="text-xs text-gray-500 w-12">{isClosed ? 'Closed' : 'Open'}</span>
                        {!isClosed && (
                          <input
                            type="text"
                            value={val}
                            onChange={e => setDayHours(key, e.target.value)}
                            placeholder="09:00-17:00"
                            className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-1.5 text-sm outline-none ring-2 ring-transparent focus:ring-blue-500 font-mono"
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving...' : t('save')}
        </button>
      </form>
    </div>
  )
}
