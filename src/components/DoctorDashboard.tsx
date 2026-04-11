'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import PrescriptionModal from './PrescriptionModal'
import BookingModal from './BookingModal'
import ClinicSchedule from './ClinicSchedule'

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
  const [processing, setProcessing] = useState<string | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const [editingApt, setEditingApt] = useState<any>(null)
  
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'queue'

  const [stats, setStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

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
    // Show everything from 12 hours ago up to end of today to avoid midnight UTC issues
    const startOfWindow = new Date()
    startOfWindow.setHours(startOfWindow.getHours() - 12)
    
    // Today's queue (scheduled/in_progress)
    const { data: queueData } = await supabase
      .from('appointments')
      .select(`id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, patient:profiles!appointments_patient_id_fkey(full_name)`)
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_time', startOfWindow.toISOString())
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

  const fetchStats = async () => {
    setLoadingStats(true)
    const supabase = createClient()
    const { data: appts } = await supabase
      .from('appointments')
      .select('fees, status, appointment_type, scheduled_time')
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
    
    if (appts) {
      const totalRevenue = appts.reduce((sum: number, a: any) => sum + (Number(a.fees) || 0), 0)
      const patientCount = appts.length
      const byType = {
        clinic_normal: appts.filter((a: any) => a.appointment_type === 'clinic_normal').length,
        clinic_urgent: appts.filter((a: any) => a.appointment_type === 'clinic_urgent').length,
        home_visit: appts.filter((a: any) => a.appointment_type === 'home_visit').length,
      }
      setStats({ totalRevenue, patientCount, byType })
    }
    setLoadingStats(false)
  }

  const [meds, setMeds] = useState<any[]>([])
  const [loadingMeds, setLoadingMeds] = useState(false)
  const [newMed, setNewMed] = useState({ name: '', dosage: '', symptoms: '' })
  const [patientHistory, setPatientHistory] = useState<any[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchMeds = async () => {
    setLoadingMeds(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('doctor_medications').select('*').eq('doctor_id', user.id).order('name')
      setMeds(data || [])
    }
    setLoadingMeds(false)
  }

  const handleAddMedToFavs = async () => {
    if (!newMed.name) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('doctor_medications').insert({
      doctor_id: user.id,
      name: newMed.name,
      default_dosage: newMed.dosage,
      common_symptoms: newMed.symptoms
    })
    setNewMed({ name: '', dosage: '', symptoms: '' })
    fetchMeds()
  }

  const handleDeleteMed = async (id: string) => {
    const supabase = createClient()
    await supabase.from('doctor_medications').delete().eq('id', id)
    fetchMeds()
  }

  const fetchPatientHistory = async (patientId: string) => {
    setLoadingHistory(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('prescriptions')
      .select('*, doctor:profiles!prescriptions_doctor_id_fkey(full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
    setPatientHistory(data || [])
    setLoadingHistory(false)
  }

  useEffect(() => {
    if (activeTab === 'stats') fetchStats()
    if (activeTab === 'meds') fetchMeds()
  }, [activeTab])

  return (
    <div className="space-y-6">
      {/* Auto-Confirm Toggle */}
      <div className="flex items-center justify-between bg-white dark:bg-[#150F2A] rounded-2xl p-4 border border-gray-100 dark:border-[#2A214D] shadow-sm">
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

      {activeTab === 'schedule' ? (
        <ClinicSchedule doctorId={doctorId} appointments={[...activeQueue, ...requests]} />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800">
          <div className="overflow-x-auto">
            {activeTab === 'queue' ? (
            activeQueue.length === 0 ? (
              <div className="p-12 text-center text-gray-500">{t('no_patients')}</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-xs font-black uppercase tracking-widest">
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
                          {apt.status === 'in_progress' ? 'In Progress' : 'Scheduled'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end">
                          {apt.status === 'scheduled' ? (
                            <>
                              <button onClick={() => fetchPatientHistory(apt.patient_id)} className="text-blue-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">History</button>
                              <button onClick={() => { setEditingApt(apt); setShowBooking(true); }} className="bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-200 transition-colors">Reschedule</button>
                              <button onClick={() => handleCallNext(apt.id, apt.patient.full_name)} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20">{t('call_next')}</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => fetchPatientHistory(apt.patient_id)} className="text-blue-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">History</button>
                              <button onClick={() => { setEditingApt(apt); setShowBooking(true); }} className="bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-200 transition-colors">Reschedule</button>
                              <button onClick={() => handleCallNext(apt.id, apt.patient.full_name)} className="bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-600 transition-colors">Recall</button>
                              <button onClick={() => setActivePrescription(apt)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20">{t('write_prescription')}</button>
                              <button onClick={() => handleComplete(apt.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20">{t('mark_completed')}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : activeTab === 'requests' ? (
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
          ) : activeTab === 'stats' ? (
            <div className="p-8">
              {loadingStats ? (
                <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
              ) : stats ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-3xl border border-blue-100 dark:border-blue-800">
                      <p className="text-blue-600 text-xs font-black uppercase tracking-widest mb-1">Total Revenue</p>
                      <p className="text-3xl font-black text-blue-900 dark:text-blue-100">{stats.totalRevenue} <span className="text-sm">EGP</span></p>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-3xl border border-purple-100 dark:border-purple-800">
                      <p className="text-purple-600 text-xs font-black uppercase tracking-widest mb-1">Patients Seen</p>
                      <p className="text-3xl font-black text-purple-900 dark:text-purple-100">{stats.patientCount}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800">
                      <p className="text-emerald-600 text-xs font-black uppercase tracking-widest mb-1">Active Queue</p>
                      <p className="text-3xl font-black text-emerald-900 dark:text-emerald-100">{activeQueue.length}</p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-3xl">
                    <h4 className="font-bold mb-4">Patient Distribution by Type</h4>
                    <div className="space-y-4">
                      {Object.entries(stats.byType).map(([type, count]: [string, any]) => (
                        <div key={type} className="flex items-center gap-4">
                          <div className="w-32 text-xs font-bold uppercase text-gray-500 truncate">{type.replace('_', ' ')}</div>
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 h-3 rounded-full overflow-hidden">
                            <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${(count / (stats.patientCount || 1)) * 100}%` }}></div>
                          </div>
                          <div className="w-8 text-right font-black text-sm">{count}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : activeTab === 'meds' ? (
            <div className="p-8">
              <div className="max-w-2xl mx-auto space-y-8">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-3xl border border-blue-100 dark:border-blue-800">
                  <h4 className="font-bold mb-4">Add Favorite Medication</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input 
                      placeholder="Medication Name" 
                      value={newMed.name}
                      onChange={e => setNewMed({...newMed, name: e.target.value})}
                      className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input 
                      placeholder="Default Dosage (e.g. 500mg)" 
                      value={newMed.dosage}
                      onChange={e => setNewMed({...newMed, dosage: e.target.value})}
                      className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input 
                      placeholder="Common Symptoms (e.g. Fever, Cough)" 
                      value={newMed.symptoms}
                      onChange={e => setNewMed({...newMed, symptoms: e.target.value})}
                      className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2"
                    />
                    <button onClick={handleAddMedToFavs} className="bg-blue-600 text-white font-bold py-2 rounded-xl shadow-lg shadow-blue-500/30 sm:col-span-2">Add to Favorites</button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold px-2">Your Favorites</h4>
                  {loadingMeds ? (
                    <div className="flex justify-center p-8 text-blue-600 animate-spin italic">Loading...</div>
                  ) : meds.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">No favorite medications added yet.</div>
                  ) : (
                    meds.map((m) => (
                      <div key={m.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-sm">
                        <div>
                          <p className="font-bold">{m.name}</p>
                          <p className="text-xs text-gray-500">{m.default_dosage} • {m.common_symptoms}</p>
                        </div>
                        <button onClick={() => handleDeleteMed(m.id)} className="p-2 text-gray-400 hover:text-red-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400">Settings & Other features coming soon...</div>
          )}
        </div>
      </div>
      )}

      {showBooking && (
        <BookingModal
          onClose={() => { setShowBooking(false); setEditingApt(null) }}
          onSuccess={async () => {
            setShowBooking(false)
            setEditingApt(null)
            const supabase = createClient()
            await refetchQueue(supabase)
          }}
          initialDoctor={{ id: doctorId } as any}
          editAppointmentId={editingApt?.id}
        />
      )}

      {/* Patient History Modal */}
      {patientHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">Medical History</h3>
              <button onClick={() => setPatientHistory(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">✕</button>
            </div>
            
            {loadingHistory ? (
              <div className="flex justify-center p-12 text-blue-600 animate-spin italic">Loading History...</div>
            ) : patientHistory.length === 0 ? (
              <p className="p-8 text-center text-gray-400">No previous medical records found for this patient.</p>
            ) : (
              <div className="space-y-6">
                {patientHistory.map((h: any) => (
                  <div key={h.id} className="p-5 border border-gray-100 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-800/30">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-xs font-black text-blue-600 uppercase tracking-widest">{new Date(h.created_at).toLocaleDateString()}</p>
                        <h4 className="font-bold text-lg">{h.diagnosis || 'General Checkup'}</h4>
                      </div>
                      <p className="text-xs text-gray-500 italic">By Dr. {h.doctor?.full_name}</p>
                    </div>
                    <div className="space-y-4">
                      {h.symptoms && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Symptoms</p>
                          <p className="text-sm">{h.symptoms}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Medications</p>
                        <div className="mt-1 space-y-1">
                          {Array.isArray(h.medications) ? h.medications.map((m: any, i: number) => (
                            <div key={i} className="text-sm bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                              <strong>{m.name}</strong> - {m.dosage} ({m.instructions})
                            </div>
                          )) : <p className="text-sm italic">No medications recorded</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
