'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import PrescriptionModal from './PrescriptionModal'

type Appointment = {
  id: string
  patient_id: string
  scheduled_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled'
  queue_position: number
  patient: { full_name: string }
}

export default function DoctorDashboard({
  doctorId,
  initialQueue
}: {
  doctorId: string
  initialQueue: Appointment[]
}) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()
  const [queue, setQueue] = useState<Appointment[]>(initialQueue)
  const [activePrescription, setActivePrescription] = useState<Appointment | null>(null)

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    
    const channel = supabase
      .channel('doctor-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => {
          // On any change, refetch the queue to stay in sync
          refetchQueue(supabase)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [doctorId])

  const refetchQueue = async (supabase: any) => {
    const startOfDay = new Date()
    startOfDay.setHours(0,0,0,0)
    
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'waiting', 'in_progress'])
      .gte('scheduled_time', startOfDay.toISOString())
      .order('queue_position', { ascending: true })
      
    if (data) {
      setQueue(data as any)
    }
  }

  // --- Actions ---

  const handleCallNext = async (appointmentId: string, patientName: string) => {
    const supabase = createClient()
    
    // 1. Update appointment status to 'in_progress'
    await supabase
      .from('appointments')
      .update({ status: 'in_progress' })
      .eq('id', appointmentId)

    // 2. Trigger Browser Text-to-Speech (TTS)
    if ('speechSynthesis' in window) {
      const msgText = t('tts_next', { name: patientName })
      const utterance = new SpeechSynthesisUtterance(msgText)
      
      // Attempt to pick a locale-appropriate voice
      const voices = window.speechSynthesis.getVoices()
      const langPrefix = locale === 'ar' ? 'ar' : 'en'
      const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix))
      if (matchedVoice) utterance.voice = matchedVoice
      
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      utterance.rate = 0.9 // slightly slower for clarity over speakers
      
      window.speechSynthesis.speak(utterance)
    }
    
    // Note: Mocking WhatsApp Webhook trigger here
    console.log(`[Webhook Mock]: WhatsApp notification sent to queue 2-spots-away`)
  }

  const handleComplete = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase
      .from('appointments')
      .update({ status: 'completed' })
      .eq('id', appointmentId)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            {t('todays_queue')}
          </h2>
          <div className="text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
            {queue.length} Patients
          </div>
        </div>

        <div className="overflow-x-auto">
          {queue.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              {t('no_patients')}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm">
                  <th className="p-4 font-semibold">#</th>
                  <th className="p-4 font-semibold">{t('patient_name')}</th>
                  <th className="p-4 font-semibold">{t('status')}</th>
                  <th className="p-4 font-semibold text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {queue.map((apt) => (
                  <tr key={apt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                    <td className="p-4 font-bold text-gray-400">{apt.queue_position}</td>
                    <td className="p-4 font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 text-white flex items-center justify-center text-xs font-bold">
                        {apt.patient?.full_name?.charAt(0) || 'P'}
                      </div>
                      {apt.patient?.full_name || 'Unknown'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${apt.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 
                          apt.status === 'scheduled' || apt.status === 'waiting' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 
                          'bg-gray-100 text-gray-800'}
                      `}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2 space-x-reverse">
                      {apt.status !== 'in_progress' ? (
                        <button 
                          onClick={() => handleCallNext(apt.id, apt.patient?.full_name || 'Patient')}
                          className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 
                          dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                          {t('call_next')}
                        </button>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button 
                            onClick={() => setActivePrescription(apt)}
                            className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-700 
                            dark:bg-purple-900/20 dark:hover:bg-purple-900/40 dark:text-purple-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            {t('write_prescription')}
                          </button>
                          <button 
                            onClick={() => handleComplete(apt.id)}
                            className="inline-flex items-center gap-1.5 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700 
                            dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            {t('mark_completed')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {activePrescription && (
        <PrescriptionModal
          appointmentId={activePrescription.id}
          patientId={activePrescription.patient_id}
          patientName={activePrescription.patient?.full_name || 'Unknown Patient'}
          onClose={() => setActivePrescription(null)}
          onComplete={() => setActivePrescription(null)}
        />
      )}
    </div>
  )
}
