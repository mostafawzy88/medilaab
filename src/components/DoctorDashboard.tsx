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
  
  // Confirmed queue (scheduled or in_progress)
  const [activeQueue, setActiveQueue] = useState<Appointment[]>(initialQueue.filter(a => a.status === 'scheduled' || a.status === 'in_progress'))
  // Pending requests (waiting)
  const [requests, setRequests] = useState<Appointment[]>(initialQueue.filter(a => a.status === 'waiting'))
  const [activePrescription, setActivePrescription] = useState<Appointment | null>(null)
  const [view, setView] = useState<'queue' | 'requests'>('queue')

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('doctor-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, 
        () => refetchQueue(supabase)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [doctorId])

  const refetchQueue = async (supabase: any) => {
    const startOfDay = new Date()
    startOfDay.setHours(0,0,0,0)
    
    const { data } = await supabase
      .from('appointments')
      .select(`id, patient_id, scheduled_time, status, queue_position, patient:profiles!appointments_patient_id_fkey(full_name)`)
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'waiting', 'in_progress'])
      .gte('scheduled_time', startOfDay.toISOString())
      .order('queue_position', { ascending: true })
      
    if (data) {
      setActiveQueue(data.filter((a: any) => a.status === 'scheduled' || a.status === 'in_progress'))
      setRequests(data.filter((a: any) => a.status === 'waiting'))
    }
  }

  const handleApprove = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'scheduled' }).eq('id', appointmentId)
  }

  const handleReject = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId)
  }

  const handleCallNext = async (appointmentId: string, patientName: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointmentId)

    if ('speechSynthesis' in window) {
      const msgText = t('tts_next', { name: patientName })
      const utterance = new SpeechSynthesisUtterance(msgText)
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleComplete = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
  }

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        <button 
          onClick={() => setView('queue')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${view === 'queue' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
        >
          {t('todays_queue')} ({activeQueue.length})
        </button>
        <button 
          onClick={() => setView('requests')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${view === 'requests' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
        >
          {t('appt_requests')} 
          {requests.length > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"></span>}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="overflow-x-auto">
          {view === 'queue' ? (
            activeQueue.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{t('no_patients')}</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 text-gray-500 text-xs font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">#</th>
                    <th className="p-4">{t('patient_name')}</th>
                    <th className="p-4">{t('status')}</th>
                    <th className="p-4 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {activeQueue.map((apt) => (
                    <tr key={apt.id} className="hover:bg-gray-50/50">
                      <td className="p-4 font-black text-gray-400">Q{apt.queue_position}</td>
                      <td className="p-4 font-bold">{apt.patient?.full_name}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold leading-none ${apt.status === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-green-100 text-green-700'}`}>
                          {apt.status}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {apt.status === 'scheduled' ? (
                          <button onClick={() => handleCallNext(apt.id, apt.patient.full_name)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold">{t('call_next')}</button>
                        ) : (
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setActivePrescription(apt)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold">{t('write_prescription')}</button>
                            <button onClick={() => handleComplete(apt.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold">{t('mark_completed')}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            requests.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{t('no_requests')}</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-amber-50 text-amber-600 text-xs font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-4">{t('patient_name')}</th>
                    <th className="p-4">Request Time</th>
                    <th className="p-4 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {requests.map((apt) => (
                    <tr key={apt.id}>
                      <td className="p-4 font-bold">{apt.patient?.full_name}</td>
                      <td className="p-4 text-sm text-gray-500">{new Date(apt.scheduled_time).toLocaleTimeString()}</td>
                      <td className="p-4 text-right flex gap-2 justify-end">
                        <button onClick={() => handleApprove(apt.id)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95">{t('approve')}</button>
                        <button onClick={() => handleReject(apt.id)} className="bg-gray-100 text-gray-500 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all">{t('reject')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>

      {activePrescription && (
        <PrescriptionModal
          appointmentId={activePrescription.id}
          patientId={activePrescription.patient_id}
          patientName={activePrescription.patient?.full_name}
          onClose={() => setActivePrescription(null)}
          onComplete={() => setActivePrescription(null)}
        />
      )}
    </div>
  )
}
