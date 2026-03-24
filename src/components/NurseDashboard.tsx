'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import PrescriptionViewerModal from './PrescriptionViewerModal'

type Appointment = {
  id: string
  patient_id: string
  doctor_id: string
  scheduled_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled'
  queue_position: number
  patient: { full_name: string }
  prescriptionData?: any // Attached dynamically
}

export default function NurseDashboard({
  clinicAppointments
}: {
  clinicAppointments: Appointment[]
}) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()
  const [queue, setQueue] = useState<Appointment[]>(clinicAppointments)
  const [viewingPrescription, setViewingPrescription] = useState<any | null>(null)
  const [activePatientName, setActivePatientName] = useState('')

  // Realtime subscription for the whole clinic
  useEffect(() => {
    const supabase = createClient()
    
    // Listen to all appointments (Nurses see everything today!)
    const channel = supabase
      .channel('nurse-queue')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => { refetchQueue(supabase) }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'prescriptions' },
        () => { refetchQueue(supabase) }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const refetchQueue = async (supabase: any) => {
    const startOfDay = new Date()
    startOfDay.setHours(0,0,0,0)
    
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, doctor_id, scheduled_time, status, queue_position,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .gte('scheduled_time', startOfDay.toISOString())
      .order('queue_position', { ascending: true })
      
    if (data) {
      setQueue(data as any)
    }
  }

  // --- Nurse Actions ---

  const handleCallNext = async (appointmentId: string, patientName: string) => {
    const supabase = createClient()
    
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointmentId)

    if ('speechSynthesis' in window) {
      const msgText = t('tts_next', { name: patientName })
      const utterance = new SpeechSynthesisUtterance(msgText)
      
      const voices = window.speechSynthesis.getVoices()
      const langPrefix = locale === 'ar' ? 'ar' : 'en'
      const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix))
      if (matchedVoice) utterance.voice = matchedVoice
      
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      utterance.rate = 0.9 
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleViewPrescription = async (appointmentId: string, patientName: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('appointment_id', appointmentId)
      .single()
      
    if (data) {
      setActivePatientName(patientName)
      setViewingPrescription(data)
    } else {
      alert("Doctor has not written a prescription yet.")
    }
  }

  const handleApproveReschedule = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'scheduled' }).eq('id', appointmentId)
  }

  const handleReject = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      
      {/* Top Banner indicating Nurse Role */}
      <div className="bg-gradient-to-r from-teal-500 to-emerald-400 rounded-2xl p-6 text-white shadow-lg flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Nursing Operations Center</h2>
          <p className="text-teal-100 opacity-90 mt-1">Manage global clinic queue and assist patients.</p>
        </div>
        <div className="hidden sm:block">
           <svg className="w-16 h-16 opacity-30" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            Global Clinic Queue
          </h2>
          <div className="text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
            {queue.length} Active Today
          </div>
        </div>

        <div className="overflow-x-auto">
          {queue.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              No patients present in the clinic today.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-sm">
                  <th className="p-4 font-semibold">Q#</th>
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
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-green-400 text-white flex items-center justify-center text-xs font-bold">
                        {apt.patient?.full_name?.charAt(0) || 'P'}
                      </div>
                      {apt.patient?.full_name || 'Unknown Patient'}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${apt.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                          apt.status === 'completed' ? 'bg-green-100 text-green-800' :
                          apt.status === 'scheduled' || apt.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'}
                      `}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2 space-x-reverse">
                      {apt.status === 'completed' ? (
                        <button 
                          onClick={() => handleViewPrescription(apt.id, apt.patient?.full_name)}
                          className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          {t('view_prescription')}
                        </button>
                      ) : apt.status === 'waiting' ? (
                        <div className="flex gap-2 justify-end">
                          <button 
                            onClick={() => handleApproveReschedule(apt.id)}
                            className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => handleReject(apt.id)}
                            className="bg-gray-100 text-gray-500 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-50 hover:text-red-600 transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      ) : apt.status !== 'in_progress' ? (
                        <>
                          <button 
                            onClick={() => handleCallNext(apt.id, apt.patient?.full_name || 'Patient')}
                            className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-600 hover:bg-teal-100 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                            {t('call_next')}
                          </button>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-gray-400 pr-2">With Doctor</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {viewingPrescription && (
        <PrescriptionViewerModal
          prescription={viewingPrescription}
          patientName={activePatientName}
          onClose={() => setViewingPrescription(null)}
        />
      )}
    </div>
  )
}
