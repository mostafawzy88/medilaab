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
  appointment_type?: string
  fees?: number
  payment_status?: string
  patient: { full_name: string }
}

export default function DoctorDashboard({
  doctorId,
  initialQueue,
  initialRequests
}: {
  doctorId: string
  initialQueue: Appointment[]
  initialRequests?: Appointment[]
}) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()
  
  const [activeQueue, setActiveQueue] = useState<Appointment[]>(initialQueue.filter(a => a.status === 'scheduled' || a.status === 'in_progress'))
  const [requests, setRequests] = useState<Appointment[]>(initialRequests || initialQueue.filter(a => a.status === 'waiting'))
  const [activePrescription, setActivePrescription] = useState<Appointment | null>(null)
  const [view, setView] = useState<'queue' | 'requests'>('queue')
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  // Fetch auto-confirm preference
  useEffect(() => {
    const fetchPrefs = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('profiles').select('auto_confirm_appointments').eq('id', doctorId).single()
      if (data) setAutoConfirm(data.auto_confirm_appointments || false)
    }
    fetchPrefs()
  }, [doctorId])

  const toggleAutoConfirm = async () => {
    const newVal = !autoConfirm
    setAutoConfirm(newVal)
    const supabase = createClient()
    await supabase.from('profiles').update({ auto_confirm_appointments: newVal }).eq('id', doctorId)
  }

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
    
    // Today's queue
    const { data: queueData } = await supabase
      .from('appointments')
      .select(`id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, patient:profiles!appointments_patient_id_fkey(full_name)`)
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_time', startOfDay.toISOString())
      .order('queue_position', { ascending: true })
      
    if (queueData) {
      setActiveQueue(queueData)
    }

    // All pending requests
    const { data: requestData } = await supabase
      .from('appointments')
      .select(`id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, patient:profiles!appointments_patient_id_fkey(full_name)`)
      .eq('doctor_id', doctorId)
      .eq('status', 'waiting')
      .order('scheduled_time', { ascending: true })
      
    if (requestData) {
      setRequests(requestData)
    }
  }

  const handleApprove = async (appointmentId: string) => {
    setProcessing(appointmentId)
    const supabase = createClient()
    const { error } = await supabase.from('appointments').update({ 
      status: 'scheduled',
      reviewed_by: doctorId,
      reviewed_at: new Date().toISOString()
    }).eq('id', appointmentId)
    if (error) { alert('Error approving: ' + error.message) }
    await refetchQueue(supabase)
    setProcessing(null)
  }

  const handleReject = async (appointmentId: string) => {
    setProcessing(appointmentId)
    const supabase = createClient()
    const { error } = await supabase.from('appointments').update({ 
      status: 'cancelled',
      reviewed_by: doctorId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason || null
    }).eq('id', appointmentId)
    if (error) { alert('Error rejecting: ' + error.message) }
    setRejectingId(null)
    setRejectionReason('')
    await refetchQueue(supabase)
    setProcessing(null)
  }

  const handleCallNext = async (appointmentId: string, patientName: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointmentId)
    await refetchQueue(supabase)

    // Text-to-speech announcement for clinic speakers
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech first
      window.speechSynthesis.cancel()
      const msgText = locale === 'ar' 
        ? `المريض التالي، ${patientName}، يرجى التوجه إلى غرفة الفحص` 
        : `Next patient, ${patientName}, please proceed to the examination room.`
      const utterance = new SpeechSynthesisUtterance(msgText)
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      utterance.volume = 1
      utterance.rate = 0.9
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleComplete = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
    await refetchQueue(supabase)
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
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all relative ${view === 'requests' ? 'bg-white shadow-sm' : 'text-gray-500'}`}
        >
          {t('appt_requests')} ({requests.length})
          {requests.length > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"></span>}
        </button>
      </div>

      {/* Auto-Confirm Toggle */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
        <div>
          <p className="font-bold text-sm">Auto-Confirm Appointments</p>
          <p className="text-xs text-gray-500">Automatically approve bookings that fall within your working hours</p>
        </div>
        <button 
          onClick={toggleAutoConfirm}
          className={`relative w-12 h-7 rounded-full transition-colors ${autoConfirm ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${autoConfirm ? 'translate-x-5' : ''}`} />
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
              <div className="p-12 text-center">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-gray-500 font-medium">{t('no_requests')}</p>
                <p className="text-sm text-gray-400 mt-1">New appointment requests from patients will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {requests.map((apt) => (
                  <div key={apt.id} className="p-5 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center text-sm font-bold">🕐</span>
                          <h4 className="font-bold">{apt.patient?.full_name}</h4>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 ml-10">
                          <span>📅 {new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                          <span className="capitalize">🏥 {(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                          <span>💰 {apt.fees || 350} EGP</span>
                          <span className={`font-bold ${apt.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                            {apt.payment_status === 'paid' ? '✅ Paid' : '⏳ Unpaid'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleApprove(apt.id)} 
                          disabled={processing === apt.id}
                          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                        >
                          {processing === apt.id ? '...' : '✓ Approve'}
                        </button>
                        <button 
                          onClick={() => setRejectingId(apt.id)} 
                          className="bg-gray-100 dark:bg-gray-800 text-gray-500 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 transition-all"
                        >
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-black mb-2">Reject Appointment</h3>
            <p className="text-sm text-gray-500 mb-4">Provide a reason for rejection (optional). This will be shown to the patient.</p>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g., Fully booked on this date, please try another day..."
              className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-red-500 outline-none text-sm resize-none h-24"
            />
            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => { setRejectingId(null); setRejectionReason('') }} 
                className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-3 rounded-2xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleReject(rejectingId!)}
                disabled={processing !== null}
                className="flex-[2] bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-2xl shadow-lg disabled:opacity-50"
              >
                {processing ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

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
