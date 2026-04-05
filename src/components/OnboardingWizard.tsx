'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Doctor = {
  id: string
  full_name: string
}

export default function OnboardingWizard({ locale }: { locale: string }) {
  const t = useTranslations('Onboarding')
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [role, setRole] = useState<'doctor' | 'nurse' | 'patient' | null>(null)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctors, setSelectedDoctors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingDoctors, setFetchingDoctors] = useState(false)

  useEffect(() => {
    if (step === 2 && (role === 'patient' || role === 'nurse')) {
      fetchDoctors()
    }
  }, [step, role])

  const fetchDoctors = async () => {
    setFetchingDoctors(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'doctor')
      .eq('is_authorized', true)
    
    if (data) setDoctors(data)
    setFetchingDoctors(false)
  }

  const handleComplete = async () => {
    if (!role) return
    if (role === 'patient' && selectedDoctors.length === 0) return

    setLoading(true)
    console.log('[Onboarding] Handling complete for role:', role)
    
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[Onboarding] Auth error:', authError)
      alert('Please sign in again.')
      setLoading(false)
      return
    }

    console.log('[Onboarding] Updating profile for user:', user.id)
    
    // We use upsert to ensure a profile exists before setting onboarding to true
    // This fixes cases where the handle_new_user trigger might have been slow or absent
    const updateData: any = {
      id: user.id,
      role: role,
      has_completed_onboarding: true,
      is_authorized: role === 'patient' ? true : false
    }

    // If nurse, set supervisor_id
    if (role === 'nurse' && selectedDoctors.length > 0) {
      updateData.supervisor_id = selectedDoctors[0]
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(updateData, { onConflict: 'id' })

    if (error) {
      console.error('[Onboarding] Profile error:', error)
      alert(`Onboarding Error: ${error.message}`)
      setLoading(false)
      return
    }

    // If patient, insert doctor relationships
    if (role === 'patient' && selectedDoctors.length > 0) {
      const doctorRels = selectedDoctors.map(docId => ({
        patient_id: user.id,
        doctor_id: docId
      }))
      const { error: relError } = await supabase
        .from('patient_doctors')
        .insert(doctorRels)
      
      if (relError) {
        console.error('[Onboarding] Relationship error:', relError)
      }
    }

    console.log('[Onboarding] Profile updated successfully. Redirecting...')
    
    // Give the database a moment to reflect changes in the server session
    await router.refresh()
    
    // Force a hard redirect to ensure the middle-ware and server components see the fresh DB state
    window.location.href = `/${locale}/dashboard`
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
        {/* Progress Bar */}
        <div className="h-2 w-full bg-gray-100 dark:bg-gray-800">
          <div 
            className="h-full bg-blue-600 transition-all duration-500" 
            style={{ width: `${(step / (role === 'patient' || role === 'nurse' ? 2 : 1)) * 100}%` }}
          ></div>
        </div>

        <div className="p-8 sm:p-12">
          {step === 1 && (
            <div className="space-y-8">
              <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">{t('title')}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {[
                  { id: 'patient', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                  { id: 'doctor', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
                  { id: 'nurse', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setRole(item.id as any)}
                    className={`flex items-center gap-4 p-6 rounded-2xl border-2 text-left transition-all ${
                      role === item.id 
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-4 ring-blue-500/10' 
                        : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-200 dark:hover:border-gray-700'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      role === item.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                    }`}>
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{t(item.id)}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t(`${item.id}_description`)}</p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                disabled={!role || loading}
                onClick={() => {
                  if (role === 'patient' || role === 'nurse') {
                    setStep(2)
                  } else {
                    handleComplete()
                  }
                }}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 h-16"
              >
                {loading ? t('completing') : (role === 'patient' || role === 'nurse' ? 'Next' : t('finish'))}
              </button>
            </div>
          )}

          {step === 2 && role === 'patient' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">{t('select_doctor')}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t('select_doctor_description')}</p>
              </div>

              {fetchingDoctors ? (
                <div className="py-20 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-gray-400">Finding doctors...</p>
                </div>
              ) : doctors.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="text-4xl">👨‍⚕️</div>
                  <p className="text-gray-500">No authorized doctors found in this clinic yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {doctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => {
                        if (selectedDoctors.includes(doc.id)) {
                          setSelectedDoctors(prev => prev.filter(id => id !== doc.id))
                        } else {
                          setSelectedDoctors(prev => [...prev, doc.id])
                        }
                      }}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        selectedDoctors.includes(doc.id) 
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' 
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg">Dr. {doc.full_name}</span>
                        {selectedDoctors.includes(doc.id) && (
                          <div className="bg-blue-600 text-white rounded-full p-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold py-4 rounded-2xl transition-all"
                >
                  Back
                </button>
                 <button
                  disabled={selectedDoctors.length === 0 || loading}
                  onClick={handleComplete}
                  className="flex-[2] bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
                >
                  {loading ? t('completing') : t('finish')}
                </button>
              </div>
            </div>
          )}

          {step === 2 && role === 'nurse' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center">
                <h1 className="text-3xl font-bold mb-2">Select Supervising Doctor</h1>
                <p className="text-gray-500 dark:text-gray-400">Choose the doctor you will be assisting. They will need to approve your access.</p>
              </div>

              {fetchingDoctors ? (
                <div className="py-20 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-gray-400">Finding doctors...</p>
                </div>
              ) : doctors.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="text-4xl">👨‍⚕️</div>
                  <p className="text-gray-500">No authorized doctors found yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {doctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoctors([doc.id])}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        selectedDoctors.includes(doc.id) 
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20' 
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg">Dr. {doc.full_name}</span>
                        {selectedDoctors.includes(doc.id) && (
                          <div className="bg-teal-600 text-white rounded-full p-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold py-4 rounded-2xl transition-all">Back</button>
                <button
                  disabled={selectedDoctors.length === 0 || loading}
                  onClick={handleComplete}
                  className="flex-[2] bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50"
                >
                  {loading ? t('completing') : t('finish')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
