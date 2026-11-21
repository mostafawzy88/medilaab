'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import DoctorOverview from './DoctorOverview'
import PrescriptionModal, { getFormIcon, inferFormFromName, parseMedicationFormAndDosage } from './PrescriptionModal'
import BookingModal from './BookingModal'
import ClinicSchedule from './ClinicSchedule'
import PatientsTab from './PatientsTab'
import DoctorAnalytics from './DoctorAnalytics'
import DoctorHistoryTab from './DoctorHistoryTab'
import DoctorStaffTab from './DoctorStaffTab'
import QueueRemovalModal from './QueueRemovalModal'
import MedicationManagerModal from './MedicationManagerModal'
import FollowUpModal from './FollowUpModal'
import MedicationAdherenceReport from './MedicationAdherenceReport'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'

type Appointment = {
  id: string
  patient_id: string | null
  manual_patient_id?: string | null
  family_member_name?: string | null
  scheduled_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'proposed'
  queue_position: number
  appointment_type?: string
  fees?: number
  payment_status?: string
  payment_reference?: string | null
  notes?: string | null
  patient: {
    full_name: string
    phone_number?: string | null
    clinic_location?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  manual_patient?: { full_name: string; phone_number?: string | null } | null
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
  
  const router = useRouter()
  // Active queue ONLY includes clinic appointments (excludes home visits from waiting room)
  const [activeQueue, setActiveQueue] = useState<Appointment[]>(
    initialQueue.filter(a => (a.status === 'scheduled' || a.status === 'in_progress') && a.appointment_type !== 'home_visit')
  )
  const [homeVisits, setHomeVisits] = useState<Appointment[]>(
    initialQueue.filter(a => a.appointment_type === 'home_visit')
  )
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [doctorName, setDoctorName] = useState<string>('')
  const [requests, setRequests] = useState<Appointment[]>(initialRequests || initialQueue.filter(a => a.status === 'waiting'))
  const [activePrescription, setActivePrescription] = useState<Appointment | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const [editingApt, setEditingApt] = useState<any>(null)
  const [removingApt, setRemovingApt] = useState<Appointment | null>(null)
  const [medsPatient, setMedsPatient] = useState<{
    patientId: string | null
    manualPatientId?: string | null
    patientName: string
    appointmentId?: string
  } | null>(null)
  
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'

  const [stats, setStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [doctorStatus, setDoctorStatus] = useState<'available' | 'busy' | 'unavailable'>('available')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [followUpApt, setFollowUpApt] = useState<Appointment | null>(null)
  const [adherencePatient, setAdherencePatient] = useState<{ id: string; name: string } | null>(null)

  // Live ticking clock for doctor
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch auto-confirm preference and live availability status
  useEffect(() => {
    const fetchPrefs = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('auto_confirm_appointments, full_name, availability_status, working_hours')
        .eq('id', doctorId)
        .single()
      if (data) {
        setAutoConfirm(data.auto_confirm_appointments || false)
        if (data.full_name) setDoctorName(data.full_name)
        const st = data.availability_status || (data.working_hours as any)?.current_status || 'available'
        setDoctorStatus(st)
      }
    }
    fetchPrefs()
  }, [doctorId])

  const toggleAutoConfirm = async () => {
    const newVal = !autoConfirm
    setAutoConfirm(newVal)
    const supabase = createClient()
    await supabase.from('profiles').update({ auto_confirm_appointments: newVal }).eq('id', doctorId)
  }

  const handleUpdateDoctorStatus = async (newStatus: 'available' | 'busy' | 'unavailable') => {
    setDoctorStatus(newStatus)
    const supabase = createClient()
    
    // Read current working_hours first
    const { data: prof } = await supabase.from('profiles').select('working_hours').eq('id', doctorId).single()
    let wh = prof?.working_hours || {}
    if (typeof wh === 'string') {
      try { wh = JSON.parse(wh) } catch { wh = {} }
    }
    const updatedWh = { ...wh, current_status: newStatus }

    const updatePayload: any = {
      working_hours: updatedWh,
      availability_status: newStatus
    }

    let { error } = await supabase.from('profiles').update(updatePayload).eq('id', doctorId)
    if (error && error.message?.includes('availability_status')) {
      delete updatePayload.availability_status
      await supabase.from('profiles').update(updatePayload).eq('id', doctorId)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('doctor-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` }, 
        () => refetchQueue(supabase)
      )
      .subscribe()

    refetchQueue(supabase) // initial fetch on mount

    return () => { supabase.removeChannel(channel) }
  }, [doctorId])

  const refetchQueue = async (supabase: any) => {
    const startOfWindow = new Date()
    startOfWindow.setDate(startOfWindow.getDate() - 30) // 30 days back
    const endOfWindow = new Date()
    endOfWindow.setDate(endOfWindow.getDate() + 30) // 30 days forward
    
    // All scheduled/in_progress/proposed/waiting for this period
    const { data: queueData } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, payment_reference, notes, family_member_name,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number, clinic_location, latitude, longitude),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
      .gte('scheduled_time', startOfWindow.toISOString())
      .lte('scheduled_time', endOfWindow.toISOString())
      .order('scheduled_time', { ascending: true })
      
    if (queueData) {
      const isSameLocalDate = (d1?: string | null) => {
        if (!d1) return false
        const date1 = new Date(d1)
        const now = new Date()
        return date1.getFullYear() === now.getFullYear() &&
               date1.getMonth() === now.getMonth() &&
               date1.getDate() === now.getDate()
      }
      // 1. Clinic waiting room queue ONLY (excludes home visits!)
      setActiveQueue(queueData.filter((a: any) => 
        (a.status === 'scheduled' || a.status === 'in_progress') && a.appointment_type !== 'home_visit'
      ))
      // 2. Dedicated home visits list
      setHomeVisits(queueData.filter((a: any) => a.appointment_type === 'home_visit'))
      // 3. Today's appointments for overview
      setTodayAppointments(queueData.filter((a: any) => isSameLocalDate(a.scheduled_time)))
    }

    // All pending requests
    const { data: requestData } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, payment_reference, notes, family_member_name,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number, clinic_location, latitude, longitude),
        manual_patient:manual_patients(full_name, phone_number)
      `)
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

  const handleCallNext = async (appointmentId: string, patientName: string, ticketNum?: number | string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', appointmentId)
    await refetchQueue(supabase)

    // Text-to-speech announcement for clinic speakers
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech first
      window.speechSynthesis.cancel()
      const ticketStr = ticketNum ? (locale === 'ar' ? `، تذكرة رقم ${ticketNum}` : `, ticket number ${ticketNum}`) : ''
      const msgText = locale === 'ar' 
        ? `المريض التالي، ${patientName}${ticketStr}، يرجى التوجه إلى غرفة الكشف` 
        : `Next patient, ${patientName}${ticketStr}, please proceed to the examination room.`
      const utterance = new SpeechSynthesisUtterance(msgText)
      utterance.lang = locale === 'ar' ? 'ar-EG' : 'en-US'
      utterance.volume = 1
      utterance.rate = 0.9

      try {
        const voices = window.speechSynthesis.getVoices()
        const langPrefix = locale === 'ar' ? 'ar' : 'en'
        const matchedVoice = voices.find(v => v.lang.startsWith(langPrefix))
        if (matchedVoice) utterance.voice = matchedVoice
      } catch (e) {
        // Fallback
      }

      window.speechSynthesis.speak(utterance)
    }
  }

  const handleComplete = async (appointmentId: string) => {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
    await refetchQueue(supabase)
  }

  const handleConfirmPayment = async (appointmentId: string) => {
    const supabase = createClient()
    const now = new Date().toISOString()
    const { error } = await supabase.from('appointments').update({
      payment_status: 'paid',
      payment_verified_by: doctorId,
      payment_verified_at: now
    }).eq('id', appointmentId)
    if (error) alert("Error confirming payment: " + error.message)
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
      const free_follow_ups = appts.filter((a: any) => (a.notes || '').includes('[FREE_FOLLOW_UP]')).length
      setStats({ totalRevenue, patientCount, byType, free_follow_ups })
    }
    setLoadingStats(false)
  }

  const [meds, setMeds] = useState<any[]>([])
  const [loadingMeds, setLoadingMeds] = useState(false)
  const [newMed, setNewMed] = useState({ name: '', dosage: '', symptoms: '', form: 'pill' })
  const [editingMedId, setEditingMedId] = useState<string | null>(null)
  const [patientHistory, setPatientHistory] = useState<any[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const fetchMeds = async () => {
    setLoadingMeds(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('doctor_medications').select('*').eq('doctor_id', user.id).order('name')
      const parsed = (data || []).map(m => {
        const { cleanDosage, form } = parseMedicationFormAndDosage(m.default_dosage, m.name, m.form)
        return {
          ...m,
          default_dosage: cleanDosage,
          form
        }
      })
      setMeds(parsed)
    }
    setLoadingMeds(false)
  }

  const handleAddMedToFavs = async () => {
    if (!newMed.name) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const cleanDosage = (newMed.dosage || '')
      .replace(/\[FORM:[a-zA-Z_]+\]/gi, '')
      .replace(/\[(pill|drinking|cream|injection|drops|spray|other)\]/gi, '')
      .trim()
    const chosenForm = newMed.form || 'pill'
    const encodedDosage = cleanDosage ? `${cleanDosage} [FORM:${chosenForm}]` : `[FORM:${chosenForm}]`

    if (editingMedId) {
      const updatePayload: any = {
        name: newMed.name.trim(),
        default_dosage: encodedDosage,
        common_symptoms: newMed.symptoms,
      }
      try {
        const { error: upErr } = await supabase.from('doctor_medications')
          .update({ ...updatePayload, form: chosenForm })
          .eq('id', editingMedId)
        if (upErr) {
          await supabase.from('doctor_medications').update(updatePayload).eq('id', editingMedId)
        }
      } catch {
        await supabase.from('doctor_medications').update(updatePayload).eq('id', editingMedId)
      }
      setEditingMedId(null)
    } else {
      const insertPayload: any = {
        doctor_id: user.id,
        name: newMed.name.trim(),
        default_dosage: encodedDosage,
        common_symptoms: newMed.symptoms,
      }
      try {
        const { error: inErr } = await supabase.from('doctor_medications').insert({
          ...insertPayload,
          form: chosenForm
        })
        if (inErr) {
          await supabase.from('doctor_medications').insert(insertPayload)
        }
      } catch {
        await supabase.from('doctor_medications').insert(insertPayload)
      }
    }
    
    setNewMed({ name: '', dosage: '', symptoms: '', form: 'pill' })
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

  const parseArrivalTime = (notes?: string | null) => {
    if (!notes) return null
    const match = notes.match(/\[ARRIVED:\s*([^\]]+)\]/)
    if (match && match[1]) {
      try {
        return new Date(match[1]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      } catch {
        return null
      }
    }
    return null
  }

  const activeConsultation = activeQueue.find(a => a.status === 'in_progress')
  const effectiveStatus: 'available' | 'busy' | 'unavailable' = 
    doctorStatus === 'unavailable' 
      ? 'unavailable' 
      : (activeConsultation || doctorStatus === 'busy')
        ? 'busy'
        : 'available'

  const statusConfig = {
    available: {
      label: locale === 'ar' ? 'متاح / جاهز' : 'Free / Available',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      glow: 'bg-emerald-400',
    },
    busy: {
      label: locale === 'ar' ? 'مع مريض حالياً' : 'With a Patient',
      badge: 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      dot: 'bg-amber-500',
      glow: 'bg-amber-400',
    },
    unavailable: {
      label: locale === 'ar' ? 'غير متاح / استراحة' : 'Unavailable (On Break)',
      badge: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
      dot: 'bg-rose-500',
      glow: 'bg-rose-400',
    }
  }

  const currentStatusStyle = statusConfig[effectiveStatus]
  const currentTimeFormatted = currentTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const currentDateFormatted = currentTime.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="space-y-6">
      {/* Live Date, Time & Doctor Status Bar for all non-overview tabs */}
      {activeTab !== 'overview' && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm animate-in fade-in">
          {/* Live Date, Time & Colored Doctor Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`px-4 py-2 rounded-2xl text-xs font-bold border flex items-center gap-2.5 shadow-sm transition-all ${currentStatusStyle.badge}`}>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatusStyle.glow}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${currentStatusStyle.dot}`} />
              </span>
              <span className="font-black uppercase tracking-wider">{currentStatusStyle.label}</span>
              <span className="opacity-40">|</span>
              <span className="font-mono font-bold tracking-tight">
                📅 {currentDateFormatted} • 🕒 {currentTimeFormatted}
              </span>
            </div>
          </div>

          {/* Quick Doctor Status Control & Persistent Auto-Confirm Toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/80 p-1 rounded-2xl border border-gray-200/50 dark:border-gray-700/50">
              <button
                type="button"
                onClick={() => handleUpdateDoctorStatus('available')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  doctorStatus === 'available'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Mark Free / Available"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{locale === 'ar' ? 'متاح' : 'Free'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateDoctorStatus('busy')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  doctorStatus === 'busy'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Mark With Patient"
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>{locale === 'ar' ? 'مع مريض' : 'With Patient'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateDoctorStatus('unavailable')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  doctorStatus === 'unavailable'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
                title="Mark Unavailable / On Break"
              >
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>{locale === 'ar' ? 'استراحة' : 'On Break'}</span>
              </button>
            </div>

            {/* Quick Auto-Confirm Toggle */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200/50 dark:border-gray-700/50">
              <div className="text-right sm:text-left">
                <p className="text-[11px] font-black text-gray-700 dark:text-gray-300 flex items-center gap-1">
                  <span className="text-amber-500">⚡</span>
                  <span>{locale === 'ar' ? 'الموافقة التلقائية' : 'Auto-Confirm'}</span>
                </p>
                <p className="text-[9px] font-medium text-gray-400">
                  {autoConfirm 
                    ? (locale === 'ar' ? 'تأكيد الحجز فوراً' : 'Instant Booking') 
                    : (locale === 'ar' ? 'مراجعة بالطلبات' : 'Manual Approval')}
                </p>
              </div>
              <button 
                type="button"
                onClick={toggleAutoConfirm}
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${autoConfirm ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                title={autoConfirm ? 'Auto-Confirm is ON. Click to require manual approval.' : 'Auto-Confirm is OFF. Click to auto-confirm new appointments.'}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${autoConfirm ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'overview' ? (
        <DoctorOverview
          doctorId={doctorId}
          doctorName={doctorName}
          doctorStatus={doctorStatus}
          onUpdateDoctorStatus={handleUpdateDoctorStatus}
          activeQueue={activeQueue}
          homeVisits={homeVisits}
          requests={requests}
          todayAppointments={todayAppointments}
          onCallNext={handleCallNext}
          onApprove={handleApprove}
          onReject={(id) => setRejectingId(id)}
          onComplete={handleComplete}
          onSwitchTab={(tab) => router.push(`/${locale}/dashboard?tab=${tab}`)}
          autoConfirm={autoConfirm}
          onToggleAutoConfirm={toggleAutoConfirm}
        />
      ) : activeTab === 'schedule' ? (
        <ClinicSchedule 
          doctorId={doctorId} 
          appointments={[...activeQueue, ...homeVisits, ...requests]} 
          onNewAppointment={() => { setEditingApt(null); setShowBooking(true); }}
        />
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
                    <th className="p-4">{locale === 'ar' ? 'نوع الكشف' : 'Visit Type'}</th>
                    <th className="p-4">{locale === 'ar' ? 'الوصول للعيادة' : 'Waiting Room'}</th>
                    <th className="p-4">{t('status')}</th>
                    <th className="p-4 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(() => {
                    const prioritizedQueue = [...activeQueue].sort((a, b) => {
                      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
                      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
                      return 0;
                    });
                    return prioritizedQueue.map((apt, idx) => {
                      const arrivalTime = parseArrivalTime(apt.notes)
                      const isArrived = !!arrivalTime
                      const ticketNum = (apt.queue_position && apt.queue_position <= activeQueue.length) ? apt.queue_position : (idx + 1)
                      const isInProgress = apt.status === 'in_progress'
                      return (
                      <tr
                        key={apt.id}
                        className={`transition-all ${
                          isInProgress
                            ? 'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-transparent dark:from-emerald-950/60 dark:via-teal-950/40 dark:to-transparent border-l-4 border-l-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                            : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/40 border-l-4 border-l-transparent'
                        }`}
                      >
                        <td className="p-4">
                          {isInProgress ? (
                            <div className="flex flex-col gap-1 items-start">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">Q{ticketNum}</span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white animate-pulse shadow-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                                  {locale === 'ar' ? 'بالعيادة الآن' : 'IN ROOM'}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                {locale === 'ar' ? 'الكشف جاري' : 'Current Patient'}
                              </span>
                            </div>
                          ) : (
                            <span className="font-black text-gray-400">Q{ticketNum}</span>
                          )}
                        </td>
                      <td className="p-4">
                        <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                          <span>{apt.patient?.full_name || apt.manual_patient?.full_name}</span>
                          {/* Triage Priority Badge */}
                          {(() => {
                            const tri = apt.notes?.match(/\[TRIAGE:\s*([a-z]+)\]/i);
                            if (!tri) return null;
                            const prio = tri[1].toLowerCase();
                            if (prio === 'emergency') {
                              return (
                                <span className="px-1.5 py-0.5 text-[10px] font-black rounded bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-300 animate-pulse">
                                  🔴 {locale === 'ar' ? 'طوارئ' : 'Emergency'}
                                </span>
                              );
                            }
                            if (prio === 'urgent') {
                              return (
                                <span className="px-1.5 py-0.5 text-[10px] font-black rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300">
                                  🟡 {locale === 'ar' ? 'عاجل' : 'Urgent'}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {/* Family member tag */}
                        {(() => {
                          let fam = apt.family_member_name;
                          if (!fam && apt.notes) {
                            const m = apt.notes.match(/\[FOR:\s*([^\]]+)\]/);
                            if (m) fam = m[1];
                          }
                          if (!fam) return null;
                          return (
                            <span className="inline-block mt-0.5 text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              👨‍👩‍👧 {locale === 'ar' ? `لصالح: ${fam}` : `For: ${fam}`}
                            </span>
                          );
                        })()}

                        {/* Vitals summary if recorded by nurse */}
                        {(() => {
                          const v = apt.notes?.match(/\[VITALS:\s*([^\]]+)\]/);
                          if (!v) return null;
                          return (
                            <div className="mt-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/40 text-[10px] font-semibold text-teal-800 dark:text-teal-200 inline-block">
                              🩺 {locale === 'ar' ? 'العلامات الحيوية: ' : 'Vitals: '}{v[1]}
                            </div>
                          );
                        })()}

                        {/* Nurse clinical note if recorded */}
                        {(() => {
                          const nn = apt.notes?.match(/\[NURSE_NOTE:\s*([^\]]+)\]/);
                          if (!nn) return null;
                          return (
                            <div className="mt-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800/40">
                              👩‍⚕️ {locale === 'ar' ? 'ملاحظة التمريض: ' : 'Nurse Note: '} {nn[1]}
                            </div>
                          );
                        })()}

                        {/* Phone & WhatsApp */}
                        {(apt.patient?.phone_number || apt.manual_patient?.phone_number) && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 font-medium">{apt.patient?.phone_number || apt.manual_patient?.phone_number}</span>
                            <a
                              href={getWhatsAppLink(
                                apt.patient?.phone_number || apt.manual_patient?.phone_number,
                                `Hello ${apt.patient?.full_name || apt.manual_patient?.full_name}, this is your clinic from MediLab.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1 shadow-sm"
                              title="Chat on WhatsApp"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                              <span>WhatsApp</span>
                            </a>
                          </div>
                        )}

                        {/* Patient Condition Note */}
                        {(() => {
                          if (!apt.notes) return null;
                          const match = apt.notes.match(/\[PATIENT_NOTE:\s*([^\]]+)\]/);
                          if (!match || !match[1]) return null;
                          return (
                            <div className="mt-1.5 p-2 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-[11px] max-w-xs">
                              <span className="font-black text-blue-600 dark:text-blue-400 block text-[10px] uppercase">
                                📝 {locale === 'ar' ? 'شكوى المريض:' : 'Patient Condition Notes:'}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300 italic">"{match[1]}"</span>
                            </div>
                          );
                        })()}
                        {(() => {
                          const m = apt.notes?.match(/\[REMOVED_FROM_QUEUE:\s*([^\]]+)\]/);
                          if (!m) return null;
                          return (
                            <div className="mt-1 p-1 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-[10px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1">
                              <span>🏃</span>
                              <span>{locale === 'ar' ? 'غادر العيادة:' : 'Left Queue:'} {m[1]}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4">
                        {((apt.notes || '').includes('[FREE_FOLLOW_UP]') || Number(apt.fees) === 0) ? (
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <span>🔄</span>
                              <span>{locale === 'ar' ? 'استشارة مجانية (0 ج.م)' : 'Free Follow-up (0 EGP)'}</span>
                            </span>
                            <span className="text-[10px] text-gray-400 capitalize">{(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5 items-start">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <span>🏷️</span>
                              <span>{locale === 'ar' ? `كشف مدفوع (${apt.fees || 200} ج.م)` : `Paid Visit (${apt.fees || 200} EGP)`}</span>
                            </span>
                            <span className="text-[10px] text-gray-400 capitalize">{(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        {isArrived ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 flex items-center gap-1.5 w-max">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>{locale === 'ar' ? 'وصل للعيادة' : 'Arrived'} ({arrivalTime})</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 w-max">
                            ⏳ {locale === 'ar' ? 'لم يصل بعد' : 'Not Checked In'}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {isInProgress ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 animate-pulse w-max">
                              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                              {locale === 'ar' ? 'الكشف جاري الآن' : 'In Progress (In Room)'}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold leading-none w-max bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                              {locale === 'ar' ? 'مجدول بالانتظار' : 'Scheduled'}
                            </span>
                          )}
                          {(() => {
                            const isClaimed = apt.payment_status === 'paid_by_patient' || !!apt.payment_reference || (apt.notes || '').includes('[PAID_BY_PATIENT');
                            return (
                              <span className={`text-[10px] font-black uppercase ${apt.payment_status === 'paid' ? 'text-emerald-600' : isClaimed ? 'text-blue-600' : 'text-amber-600'}`}>
                                {apt.payment_status === 'paid' ? '✅ Paid' : isClaimed ? `⏳ Patient Paid${apt.payment_reference ? ` (${apt.payment_reference})` : ''}` : '💰 Unpaid'}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end items-center flex-wrap">
                          {apt.payment_status !== 'paid' && (
                            <button
                              onClick={() => handleConfirmPayment(apt.id)}
                              className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-emerald-200 dark:border-emerald-800"
                              title="Confirm Received Payment"
                            >
                              💰 {apt.payment_status === 'paid_by_patient' || !!apt.payment_reference ? 'Verify Paid' : 'Confirm Paid'}
                            </button>
                          )}

                          {/* Meds Manager button */}
                          <button
                            onClick={() => setMedsPatient({
                              patientId: apt.patient_id,
                              manualPatientId: apt.manual_patient_id,
                              patientName: apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient',
                              appointmentId: apt.id
                            })}
                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors border border-indigo-200 dark:border-indigo-800"
                            title="Manage active medications"
                          >
                            💊 {locale === 'ar' ? 'الأدوية' : 'Meds'}
                          </button>

                          {/* Left Queue button */}
                          <button
                            onClick={() => setRemovingApt(apt)}
                            className="bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors border border-rose-200 dark:border-rose-800"
                            title="Patient left queue with note"
                          >
                            🏃 {locale === 'ar' ? 'غادر' : 'Left'}
                          </button>
                          {apt.status === 'scheduled' ? (
                            <>
                              {apt.patient_id && (
                                <button onClick={() => fetchPatientHistory(apt.patient_id!)} className="text-blue-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">History</button>
                              )}
                              <button onClick={() => { setEditingApt(apt); setShowBooking(true); }} className="bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-200 transition-colors">Reschedule</button>
                              <button onClick={() => handleCallNext(apt.id, apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient', ticketNum)} className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20">{t('call_next')}</button>
                            </>
                          ) : (
                            <>
                              {apt.patient_id && (
                                <>
                                  <button onClick={() => fetchPatientHistory(apt.patient_id!)} className="text-blue-600 hover:text-blue-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">History</button>
                                  <button
                                    onClick={() => setAdherencePatient({ id: apt.patient_id!, name: apt.patient?.full_name || 'Patient' })}
                                    className="bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors border border-violet-200 dark:border-violet-800"
                                    title="Medication Adherence Report"
                                  >
                                    💊 {locale === 'ar' ? 'الالتزام' : 'Adherence'}
                                  </button>
                                </>
                              )}
                              <button onClick={() => { setEditingApt(apt); setShowBooking(true); }} className="bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-200 transition-colors">Reschedule</button>
                              <button onClick={() => handleCallNext(apt.id, apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient', ticketNum)} className="bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-amber-600 transition-colors">Recall</button>
                              <button
                                onClick={() => setFollowUpApt(apt)}
                                className="bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 font-bold px-2.5 py-1.5 rounded-lg text-xs transition-colors border border-cyan-200 dark:border-cyan-800"
                                title="Schedule free follow-up visit"
                              >
                                📅 {locale === 'ar' ? 'متابعة' : 'Follow-Up'}
                              </button>
                              <button onClick={() => setActivePrescription(apt)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-purple-500/20">{t('write_prescription')}</button>
                              <button onClick={() => handleComplete(apt.id)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20">{t('mark_completed')}</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  });
                })()}
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center text-sm font-bold">🕐</span>
                          <h4 className="font-bold text-gray-900 dark:text-white">{apt.patient?.full_name || apt.manual_patient?.full_name}</h4>

                          {/* Family member tag */}
                          {(() => {
                            let fam = apt.family_member_name;
                            if (!fam && apt.notes) {
                              const m = apt.notes.match(/\[FOR:\s*([^\]]+)\]/);
                              if (m) fam = m[1];
                            }
                            if (!fam) return null;
                            return (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                👨‍👩‍👧 {locale === 'ar' ? `لصالح: ${fam}` : `For: ${fam}`}
                              </span>
                            );
                          })()}

                          {/* WhatsApp Patient Button */}
                          {(apt.patient?.phone_number || apt.manual_patient?.phone_number) && (
                            <a
                              href={getWhatsAppLink(
                                apt.patient?.phone_number || apt.manual_patient?.phone_number,
                                `Hello ${apt.patient?.full_name || apt.manual_patient?.full_name}, this is Dr. ${doctorName} regarding your appointment request at MediLab.`
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-black text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1 shadow-sm"
                              title="Chat on WhatsApp"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                        </div>

                        {/* Patient Condition Note */}
                        {(() => {
                          if (!apt.notes) return null;
                          const match = apt.notes.match(/\[PATIENT_NOTE:\s*([^\]]+)\]/);
                          if (!match || !match[1]) return null;
                          return (
                            <div className="mt-2 ml-10 p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs">
                              <span className="font-black text-blue-600 dark:text-blue-400 block text-[10px] uppercase">
                                📝 {locale === 'ar' ? 'شكوى وأعراض المريض:' : 'Patient Condition & Symptoms:'}
                              </span>
                              <span className="text-gray-700 dark:text-gray-300 italic">"{match[1]}"</span>
                            </div>
                          );
                        })()}

                        <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500 ml-10 items-center">
                          <span>📅 {new Date(apt.scheduled_time).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(apt.scheduled_time).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                          {((apt.notes || '').includes('[FREE_FOLLOW_UP]') || Number(apt.fees) === 0) ? (
                            <span className="font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800 text-xs flex items-center gap-1">
                              <span>🔄</span> {locale === 'ar' ? 'استشارة مجانية (0 ج.م)' : 'Free Follow-up (0 EGP)'}
                            </span>
                          ) : (
                            <span className="font-bold text-blue-600 dark:text-blue-400 text-xs flex items-center gap-1">
                              <span>🏷️</span> {locale === 'ar' ? 'كشف مدفوع' : 'Paid Visit'} ({(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}) • 💰 {apt.fees || 350} EGP
                            </span>
                          )}
                          {(() => {
                            const isClaimed = apt.payment_status === 'paid_by_patient' || !!apt.payment_reference || (apt.notes || '').includes('[PAID_BY_PATIENT');
                            return (
                              <span className={`font-bold ${apt.payment_status === 'paid' ? 'text-green-600' : isClaimed ? 'text-blue-600' : 'text-amber-600'}`}>
                                {apt.payment_status === 'paid' ? '✅ Paid' : isClaimed ? `⏳ Paid by Patient${apt.payment_reference ? ` (${apt.payment_reference})` : ''}` : '⏳ Unpaid'}
                              </span>
                            );
                          })()}
                          {apt.payment_status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmPayment(apt.id)}
                              className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-lg font-black transition-colors"
                              title="Confirm payment received"
                            >
                              💰 Confirm Paid
                            </button>
                          )}
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
                          onClick={() => { setEditingApt(apt); setShowBooking(true); }} 
                          className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all"
                        >
                          📅 Reschedule
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
            <div className="p-6 md:p-8">
              <DoctorAnalytics doctorId={doctorId} />
            </div>
          ) : activeTab === 'meds' ? (
            <div className="p-8">
              <div className="max-w-2xl mx-auto space-y-8">
                <div className={`${editingMedId ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800'} p-6 rounded-3xl border`}>
                  <h4 className="font-bold mb-4">{editingMedId ? 'Update Favorite Medication' : 'Add Favorite Medication'}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input 
                      placeholder="Medication Name" 
                      value={newMed.name}
                      onChange={e => {
                        const val = e.target.value
                        setNewMed(prev => ({
                          ...prev,
                          name: val,
                          form: (!editingMedId && prev.form === 'pill') ? inferFormFromName(val) : prev.form
                        }))
                      }}
                      className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        placeholder="Default Dosage (e.g. 500mg)" 
                        value={newMed.dosage}
                        onChange={e => setNewMed({...newMed, dosage: e.target.value})}
                        className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <select
                        value={newMed.form || 'pill'}
                        onChange={e => setNewMed({...newMed, form: e.target.value as any})}
                        className="rounded-xl px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                      >
                        <option value="pill">💊 Pill / Capsule</option>
                        <option value="drinking">🧴 Syrup / Drinking</option>
                        <option value="cream">🧴 Cream / Ointment</option>
                        <option value="injection">💉 Injection</option>
                        <option value="drops">💧 Drops</option>
                        <option value="spray">💨 Spray / Inhaler</option>
                        <option value="other">🩺 Other</option>
                      </select>
                    </div>
                    <input 
                      placeholder="Common Symptoms (e.g. #برد, Fever, Cough, صداع)" 
                      value={newMed.symptoms}
                      onChange={e => setNewMed({...newMed, symptoms: e.target.value})}
                      className="rounded-xl px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2"
                    />
                    <button onClick={handleAddMedToFavs} className={`${editingMedId ? 'bg-amber-600 shadow-amber-500/30' : 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] shadow-blue-500/30'} text-white font-bold py-2 rounded-xl shadow-lg sm:col-span-2 transition-all`}>
                      {editingMedId ? 'Update Medication' : 'Add to Favorites'}
                    </button>
                    {editingMedId && (
                      <button 
                        onClick={() => { setEditingMedId(null); setNewMed({ name: '', dosage: '', symptoms: '', form: 'pill' }); }} 
                        className="text-xs font-bold text-gray-500 hover:text-red-500 sm:col-span-2 underline underline-offset-4"
                      >Cancel Edit</button>
                    )}
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
                        <div className="flex items-center gap-3">
                          <span className="text-2xl p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30">{getFormIcon(m.form)}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold">{m.name}</p>
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                {m.form || 'pill'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">{m.default_dosage} {m.common_symptoms ? `• ${m.common_symptoms}` : ''}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingMedId(m.id);
                              setNewMed({ name: m.name, dosage: m.default_dosage || '', symptoms: m.common_symptoms || '', form: m.form || 'pill' });
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }} 
                            className="p-2 text-gray-400 hover:text-amber-500 transition-colors" title="Edit"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => handleDeleteMed(m.id)} className="p-2 text-gray-400 hover:text-red-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === 'patients' ? (
            <div className="p-8">
              <PatientsTab doctorId={doctorId} />
            </div>
          ) : activeTab === 'staff' ? (
            <div className="p-6 md:p-8">
              <DoctorStaffTab doctorId={doctorId} />
            </div>
          ) : activeTab === 'history' ? (
            <div className="p-6 md:p-8">
              <DoctorHistoryTab
                doctorId={doctorId}
                onOpenPrescription={(p) => {
                  setActivePrescription({
                    id: p.appointment_id || '',
                    patient_id: p.is_manual ? null : p.id,
                    manual_patient_id: p.is_manual ? p.id : null,
                    scheduled_time: new Date().toISOString(),
                    status: 'completed',
                    queue_position: 0,
                    patient: p.is_manual ? null : { full_name: p.name },
                    manual_patient: p.is_manual ? { full_name: p.name } : null
                  })
                }}
              />
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
          isStaff={true}
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
          manualPatientId={activePrescription.manual_patient_id}
          patientName={activePrescription.patient?.full_name || activePrescription.manual_patient?.full_name || 'Patient'}
          patientNotes={activePrescription.notes}
          onClose={() => setActivePrescription(null)}
          onComplete={() => {
            setActivePrescription(null)
            router.refresh()
          }}
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
          doctorId={doctorId}
          appointmentId={medsPatient.appointmentId}
          onClose={() => setMedsPatient(null)}
          onUpdated={async () => {
            setMedsPatient(null)
            const supabase = createClient()
            await refetchQueue(supabase)
          }}
        />
      )}

      {/* Modal: Schedule Free Follow-Up Visit */}
      {followUpApt && (
        <FollowUpModal
          doctorId={doctorId}
          doctorName={doctorName}
          appointment={followUpApt}
          onClose={() => setFollowUpApt(null)}
          onSuccess={() => setFollowUpApt(null)}
        />
      )}

      {/* Modal: Medication Adherence Report */}
      {adherencePatient && (
        <MedicationAdherenceReport
          patientId={adherencePatient.id}
          patientName={adherencePatient.name}
          onClose={() => setAdherencePatient(null)}
        />
      )}
    </div>
  )
}
