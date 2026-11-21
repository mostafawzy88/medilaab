'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import PrescriptionViewerModal from './PrescriptionViewerModal'
import ClinicSchedule from './ClinicSchedule'
import BookingModal from './BookingModal'
import PatientsTab from './PatientsTab'
import QueueRemovalModal from './QueueRemovalModal'
import MedicationManagerModal from './MedicationManagerModal'

  type Appointment = {
  id: string
  patient_id: string | null
  manual_patient_id?: string | null
  doctor_id: string
  scheduled_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'proposed'
  queue_position: number
  appointment_type?: string
  fees?: number
  notes?: string | null
  patient: { full_name: string } | null
  manual_patient?: { full_name: string } | null
  prescriptionData?: any // Attached dynamically
}

export default function NurseDashboard({
  clinicAppointments,
  supervisorId,
  supervisorDoctor
}: {
  clinicAppointments: Appointment[],
  supervisorId?: string,
  supervisorDoctor?: {
    id: string
    full_name: string
    specialization?: string | null
    clinic_location?: string | null
    avatar_url?: string | null
  } | null
}) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()
  
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'queue'

  const [queue, setQueue] = useState<Appointment[]>(clinicAppointments)
  const [viewingPrescription, setViewingPrescription] = useState<any | null>(null)
  const [activePatientName, setActivePatientName] = useState('')
  const [showBooking, setShowBooking] = useState(false)
  const [editingApt, setEditingApt] = useState<Appointment | null>(null)
  const [removingApt, setRemovingApt] = useState<Appointment | null>(null)
  const [medsPatient, setMedsPatient] = useState<{
    patientId: string | null
    manualPatientId?: string | null
    patientName: string
    appointmentId?: string
  } | null>(null)

  const handleMarkArrived = async (appointmentId: string, currentNotes?: string | null) => {
    const supabase = createClient()
    const arrivalTag = `[ARRIVED: ${new Date().toISOString()}]`
    const updatedNotes = currentNotes ? `${currentNotes} ${arrivalTag}` : arrivalTag
    await supabase.from('appointments').update({ notes: updatedNotes }).eq('id', appointmentId)
    refetchQueue(supabase)
  }

  // Realtime subscription strictly for the supervisor's appointments
  useEffect(() => {
    const supabase = createClient()
    
    const filterOpts = supervisorId
      ? { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${supervisorId}` }
      : { event: '*', schema: 'public', table: 'appointments' }

    const channel = supabase
      .channel(`nurse-queue-${supervisorId || 'clinic'}`)
      .on('postgres_changes', filterOpts as any, () => { refetchQueue(supabase) })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supervisorId])

  const refetchQueue = async (supabase: any) => {
    const startOfDay = new Date()
    startOfDay.setHours(0,0,0,0)
    
    let query = supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, doctor_id, scheduled_time, status, queue_position, appointment_type, notes,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .neq('appointment_type', 'home_visit')
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .gte('scheduled_time', startOfDay.toISOString())

    if (supervisorId) {
      query = query.eq('doctor_id', supervisorId)
    }

    const { data } = await query.order('queue_position', { ascending: true })
      
    if (data) {
      setQueue(data as any)
    }
  }

  // --- Nurse Actions ---

  const handleCallNext = async (appointmentId: string, patientName: string, ticketNum?: number | string) => {
    const supabase = createClient()
    
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointmentId)

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const ticketStr = ticketNum ? (locale === 'ar' ? `، تذكرة رقم ${ticketNum}` : `, ticket number ${ticketNum}`) : ''
      const msgText = locale === 'ar'
        ? `المريض التالي، ${patientName}${ticketStr}، يرجى التوجه إلى غرفة الكشف.`
        : `Next patient, ${patientName}${ticketStr}, please proceed to the examination room.`
      const utterance = new SpeechSynthesisUtterance(msgText)
      
      const voices = window.speechSynthesis.getVoices()
      const langPrefix = locale === 'ar' ? 'ar' : 'en'
      const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix))
      if (matchedVoice) utterance.voice = matchedVoice
      
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      utterance.volume = 1
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
      
      {/* Top Banner indicating Nurse Role & Assigned Doctor */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-600 rounded-3xl p-6 text-white shadow-xl flex justify-between items-center">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/15 border border-white/20 uppercase tracking-widest mb-2">
            <span>✓</span>
            <span>{locale === 'ar' ? 'طاقم تمريض معتمد' : 'Authorized Clinic Staff'}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">
            {supervisorDoctor?.full_name 
              ? (locale === 'ar' ? `عيادة د. ${supervisorDoctor.full_name}` : `Dr. ${supervisorDoctor.full_name}'s Clinic Operations`) 
              : 'Nursing Operations Center'}
          </h2>
          <p className="text-teal-100 opacity-90 text-sm mt-1">
            {supervisorDoctor?.specialization ? `${supervisorDoctor.specialization} • ` : ''}
            {locale === 'ar' 
              ? 'إدارة طابور الانتظار واستدعاء المرضى والتنسيق مع الطبيب المشرف' 
              : 'Managing waiting room queue, calling patients, and assisting your supervising doctor.'}
          </p>
        </div>
        <div className="hidden sm:block">
           <svg className="w-16 h-16 opacity-30" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            {supervisorDoctor?.full_name 
              ? (locale === 'ar' ? `طابور انتظار د. ${supervisorDoctor.full_name}` : `Dr. ${supervisorDoctor.full_name}'s Queue`) 
              : 'Clinic Queue'}
          </h2>
          <div className="text-sm font-medium text-gray-500 bg-white dark:bg-gray-800 px-4 py-1.5 rounded-full border border-gray-200 dark:border-gray-700">
            {queue.length} Active Today
          </div>
        </div>

        {activeTab === 'schedule' ? (
          <ClinicSchedule doctorId={supervisorId || ''} appointments={queue} />
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'requests' ? (
              <div className="p-12 text-center text-gray-500">
                Requests are managed directly from the Queue view.
              </div>
            ) : activeTab === 'patients' ? (
              <div className="p-8">
                <PatientsTab doctorId={supervisorId || ''} />
              </div>
            ) : queue.length === 0 ? (
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
                      <td className="p-4 font-semibold text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-500 to-green-400 text-white flex items-center justify-center text-xs font-bold">
                            {apt.patient?.full_name?.charAt(0) || 'P'}
                          </div>
                          <div>
                            <div>{apt.patient?.full_name || apt.manual_patient?.full_name || 'Unknown Patient'}</div>
                            {apt.notes?.includes('[ARRIVED:') && (
                              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                In Waiting Room
                              </span>
                            )}
                            {(() => {
                              const m = apt.notes?.match(/\[REMOVED_FROM_QUEUE:\s*([^\]]+)\]/);
                              if (!m) return null;
                              return (
                                <div className="mt-1 p-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                  🏃 {m[1]}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize
                            ${apt.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                              apt.status === 'completed' ? 'bg-green-100 text-green-800' :
                              apt.status === 'scheduled' || apt.status === 'waiting' ? 'bg-yellow-100 text-yellow-800' : 
                              'bg-gray-100 text-gray-800'}
                          `}>
                            {apt.status.replace('_', ' ')}
                          </span>

                          {(apt.notes?.includes('[FOLLOW_UP]') || Number(apt.fees) === 0) ? (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                              🔄 {locale === 'ar' ? 'استشارة مجانية' : 'Free Follow-up'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              🏷️ {locale === 'ar' ? 'كشف مدفوع' : 'Paid Visit'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right space-x-1.5 space-x-reverse">
                        {/* Manage Medications button */}
                        <button
                          onClick={() => setMedsPatient({
                            patientId: apt.patient_id,
                            manualPatientId: apt.manual_patient_id,
                            patientName: apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient',
                            appointmentId: apt.id
                          })}
                          className="inline-flex items-center gap-1 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                          title="Manage Patient Medications"
                        >
                          <span>💊</span>
                          <span>{locale === 'ar' ? 'الأدوية' : 'Meds'}</span>
                        </button>

                        {/* Remove from queue button if patient left or cancelled */}
                        {apt.status !== 'completed' && apt.status !== 'cancelled' && (
                          <button
                            onClick={() => setRemovingApt(apt)}
                            className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
                            title="Patient left in a hurry or needs removal with note"
                          >
                            <span>🏃</span>
                            <span>{locale === 'ar' ? 'غادر' : 'Left Queue'}</span>
                          </button>
                        )}

                        {apt.status === 'completed' ? (
                          <button 
                            onClick={() => handleViewPrescription(apt.id, apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient')}
                            className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {t('view_prescription')}
                          </button>
                        ) : (apt.status === 'waiting' || apt.status === 'scheduled') ? (
                          <div className="inline-flex gap-1.5 justify-end">
                            {/* Mark Arrived in waiting room */}
                            {!apt.notes?.includes('[ARRIVED:') && apt.status === 'scheduled' && (
                              <button
                                onClick={() => handleMarkArrived(apt.id, apt.notes)}
                                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all"
                                title="Mark as arrived in waiting room"
                              >
                                ✓ {locale === 'ar' ? 'حضر' : 'Arrived'}
                              </button>
                            )}
                            {apt.status === 'waiting' && (
                              <button 
                                onClick={() => handleApproveReschedule(apt.id)}
                                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95"
                              >
                                Approve
                              </button>
                            )}
                            <button 
                              onClick={() => { setEditingApt(apt); setShowBooking(true); }}
                              className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition-all"
                            >
                              Reschedule
                            </button>
                            <button 
                              onClick={() => handleReject(apt.id)}
                              className="bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all"
                            >
                              Reject
                            </button>
                          </div>
                        ) : apt.status !== 'in_progress' ? (
                          <>
                            <button 
                              onClick={() => handleCallNext(apt.id, apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient', apt.queue_position)}
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
      )}
      </div>

      {viewingPrescription && (
        <PrescriptionViewerModal
          prescription={viewingPrescription}
          patientName={activePatientName}
          onClose={() => setViewingPrescription(null)}
        />
      )}

      {showBooking && editingApt && (
        <BookingModal
          onClose={() => { setShowBooking(false); setEditingApt(null) }}
          onSuccess={async () => {
            setShowBooking(false)
            setEditingApt(null)
            const supabase = createClient()
            await refetchQueue(supabase)
          }}
          initialDoctor={{ id: editingApt.doctor_id } as any}
          editAppointmentId={editingApt.id}
          isStaff={true}
        />
      )}

      {/* Modal: Patient Leaving Queue with Note */}
      {removingApt && (
        <QueueRemovalModal
          appointmentId={removingApt.id}
          patientName={removingApt.patient?.full_name || removingApt.manual_patient?.full_name || 'Patient'}
          ticketNum={removingApt.queue_position}
          currentNotes={removingApt.notes}
          onClose={() => setRemovingApt(null)}
          onSuccess={async () => {
            setRemovingApt(null)
            const supabase = createClient()
            await refetchQueue(supabase)
          }}
        />
      )}

      {/* Modal: Add or Cancel/Modify Medications */}
      {medsPatient && (
        <MedicationManagerModal
          patientId={medsPatient.patientId}
          manualPatientId={medsPatient.manualPatientId}
          patientName={medsPatient.patientName}
          doctorId={supervisorId || ''}
          appointmentId={medsPatient.appointmentId}
          onClose={() => setMedsPatient(null)}
          onUpdated={async () => {
            setMedsPatient(null)
            const supabase = createClient()
            await refetchQueue(supabase)
          }}
        />
      )}
    </div>
  )
}
