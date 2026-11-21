'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations, useLocale } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import BookingModal from './BookingModal'
import PrescriptionViewerModal from './PrescriptionViewerModal'
import DoctorProfileModal from './DoctorProfileModal'
import FamilyMembersTab from './FamilyMembersTab'
import PatientHistoryTab from './PatientHistoryTab'
import PrescriptionCupsTimeline from './PrescriptionCupsTimeline'
import NotificationPermissionBanner from './NotificationPermissionBanner'
import PharmacyForwardModal from './PharmacyForwardModal'
import DoctorReviewModal from './DoctorReviewModal'
import LabRadiologyModal, { LabOrder, PARTNER_LABS } from './LabRadiologyModal'
import ObourMedicalWiki from './ObourMedicalWiki'
import { sendTurnAlertNotification } from '@/utils/notifications'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'

type AppointmentProps = {
  id: string
  doctor_id: string
  queue_position: number
  fees: number
  doctor_name: string
  doctor_phone?: string | null
  instapay_address: string | null
  payment_status?: string
  payment_reference?: string | null
  family_member_name?: string | null
  appointment_type?: string
  status?: string
  scheduled_time?: string
  notes?: string | null
  rejection_reason?: string | null
  reviewer_name?: string | null
}

export interface SmartSlotSuggestion {
  isoString: string
  displayString: string
  shortTime: string
  relativeDay: string
  dayName: string
  timeStr: string
}

export function getSmartSuggestedUpcomingDate(
  originalScheduledTime?: string | null,
  doctorWorkingHours?: any,
  locale: string = 'en'
): SmartSlotSuggestion {
  const now = new Date()
  let targetHour = 13 // Default 1:00 PM
  let targetMinute = 0

  if (originalScheduledTime) {
    const orig = new Date(originalScheduledTime)
    if (!isNaN(orig.getTime())) {
      targetHour = orig.getHours()
      targetMinute = orig.getMinutes()
    }
  }

  // Parse working hours if available
  let hoursMap: Record<string, string> | null = null
  if (doctorWorkingHours) {
    try {
      hoursMap = typeof doctorWorkingHours === 'string' ? JSON.parse(doctorWorkingHours) : doctorWorkingHours
    } catch {
      hoursMap = null
    }
  }

  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayNamesAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

  // Scan forward up to 14 days to find the earliest open slot
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date()
    candidate.setDate(now.getDate() + offset)
    candidate.setHours(targetHour, targetMinute, 0, 0)

    // If today, ensure at least 45 minutes notice
    if (offset === 0 && candidate.getTime() < now.getTime() + 45 * 60 * 1000) {
      continue
    }

    const dayIdx = candidate.getDay()
    const dayKey = dayKeys[dayIdx]

    // Check if doctor is closed on this day
    if (hoursMap && hoursMap[dayKey]) {
      const val = String(hoursMap[dayKey]).toLowerCase().trim()
      if (val === 'closed' || val === 'off' || val === 'مغلق') {
        continue
      }
    }

    const isToday = offset === 0
    const isTomorrow = offset === 1
    const timeStr = candidate.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    const shortTime = candidate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
    const dayName = locale === 'ar' ? dayNamesAr[dayIdx] : dayNamesEn[dayIdx]

    const relativeDay = isToday
      ? (locale === 'ar' ? 'اليوم' : 'Today')
      : isTomorrow
        ? (locale === 'ar' ? 'غداً' : 'Tomorrow')
        : dayName

    const dateFormatted = candidate.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric'
    })

    const displayString = locale === 'ar'
      ? `${relativeDay}، ${dateFormatted} في تمام الساعة ${timeStr}`
      : `${relativeDay}, ${dateFormatted} at ${timeStr}`

    return {
      isoString: candidate.toISOString(),
      displayString,
      shortTime: `${relativeDay} ${timeStr}`,
      relativeDay,
      dayName,
      timeStr
    }
  }

  // Fallback: tomorrow at targetHour
  const fallback = new Date()
  fallback.setDate(now.getDate() + 1)
  fallback.setHours(targetHour, targetMinute, 0, 0)
  return {
    isoString: fallback.toISOString(),
    displayString: locale === 'ar' ? 'غداً في 1:00 م' : 'Tomorrow at 1:00 PM',
    shortTime: locale === 'ar' ? 'غداً 1:00 م' : 'Tomorrow 1:00 PM',
    relativeDay: locale === 'ar' ? 'غداً' : 'Tomorrow',
    dayName: locale === 'ar' ? 'غداً' : 'Tomorrow',
    timeStr: '1:00 PM'
  }
}

type DoctorInfo = {
  id: string
  full_name: string
  avatar_url?: string | null
  specialization: string | null
  clinic_location: string | null
  working_hours: any
  phone_number: string | null
  bio?: string | null
  fees_normal?: number | null
  fees_urgent?: number | null
  fees_home_visit?: number | null
  availability_status?: string | null
}

type Certification = {
  id: string
  title: string
  description: string | null
  issued_at?: string
  doctor_name?: string
}

type AppointmentLog = {
  id: string
  action: string
  previous_status: string | null
  new_status: string | null
  details: string | null
  created_at: string
  changed_by_name?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  waiting: { label: 'Pending Approval', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '🕐' },
  scheduled: { label: 'Approved', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '✅' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '🔵' },
  completed: { label: 'Completed', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', icon: '☑️' },
  cancelled: { label: 'Rejected / Cancelled', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '❌' },
  proposed: { label: 'Doctor Proposed New Time', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: '📅' },
}

export default function PatientDashboard({
  initialAppointments,
  initialDoctors
}: {
  initialAppointments: AppointmentProps[]
  initialDoctors: DoctorInfo[]
}) {
  const t = useTranslations('Dashboard')
  const tp = useTranslations('Patient')
  const locale = useLocale()

  const getSafePatientMsg = (key: string, fallbackEn: string, fallbackAr: string) => {
    try {
      const val = tp(key as any)
      if (val && !val.startsWith('Patient.')) return val
    } catch {}
    return locale === 'ar' ? fallbackAr : fallbackEn
  }

  const notifiedTurnRef = useRef<Record<string, { calling?: boolean; next?: boolean }>>({})
  const [appointments, setAppointments] = useState(initialAppointments)
  const [showBooking, setShowBooking] = useState(false)
  const [editAppointmentId, setEditAppointmentId] = useState<string | null>(null)
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
  const [viewingPrescription, setViewingPrescription] = useState<any | null>(null)
  const [patientName, setPatientName] = useState('Patient')
  const [patientUserId, setPatientUserId] = useState<string>('')

  // CSAT Automated Satisfaction prompt state
  const [pendingCsatApt, setPendingCsatApt] = useState<AppointmentProps | null>(null)
  const [csatRating, setCsatRating] = useState<number>(5)
  const [csatHoverRating, setCsatHoverRating] = useState<number>(0)
  const [csatComment, setCsatComment] = useState<string>('')
  const [csatTags, setCsatTags] = useState<string[]>([])
  const [csatSubmitting, setCsatSubmitting] = useState<boolean>(false)
  const [csatSubmitted, setCsatSubmitted] = useState<boolean>(false)
  const [csatModalApt, setCsatModalApt] = useState<AppointmentProps | null>(null)

  // Direct Pharmacy Forwarding state
  const [forwardingRx, setForwardingRx] = useState<any | null>(null)

  // Direct Pill check-in state on Overview
  const [overviewTakenMeds, setOverviewTakenMeds] = useState<Record<string, string>>({})

  // Diagnostic Lab & Radiology state
  const [patientViewingLab, setPatientViewingLab] = useState<LabOrder | null>(null)

  // Extract all lab orders from patient's prescriptions
  const patientLabOrders: Array<LabOrder & { rxId: string; rxDate: string }> = useMemo(() => {
    const list: any[] = []
    prescriptions.forEach((rx: any) => {
      const notes = rx.doctor_notes || ''
      const match = notes.match(/\[LAB_ORDERS:\s*([\s\S]*?)\]/)
      if (match) {
        try {
          const parsed = JSON.parse(match[1])
          if (Array.isArray(parsed)) {
            parsed.forEach((order: any) => {
              list.push({
                ...order,
                rxId: rx.id,
                rxDate: rx.created_at
              })
            })
          }
        } catch {}
      }
    })
    return list
  }, [prescriptions])

  const handlePatientLabCoordinationUpdate = async (orderId: string, updateData: {
    status: string
    facilityName: string
    referenceNumber: string
    notes: string
  }) => {
    try {
      const supabase = createClient()
      const targetRx = prescriptions.find((rx: any) => {
        const notes = rx.doctor_notes || ''
        return notes.includes(orderId) || notes.includes('[LAB_ORDERS:')
      })

      if (!targetRx) return

      let orders: any[] = []
      try {
        const match = targetRx.doctor_notes.match(/\[LAB_ORDERS:\s*([\s\S]*?)\]/)
        if (match) orders = JSON.parse(match[1])
      } catch {}

      const updatedOrders = orders.map((o: any) => {
        if (o.id === orderId) {
          const updates = o.coordination_updates || []
          updates.push({
            status: updateData.status,
            timestamp: new Date().toISOString(),
            note: updateData.notes,
            facilityName: updateData.facilityName
          })
          return {
            ...o,
            status: updateData.status,
            chosen_facility_name: updateData.facilityName,
            reference_number: updateData.referenceNumber,
            patient_notes: updateData.notes,
            coordination_updates: updates
          }
        }
        return o
      })

      const cleanNotes = targetRx.doctor_notes.replace(/\[LAB_ORDERS:\s*[\s\S]*?\]/, '').trim()
      const newNotes = `${cleanNotes ? cleanNotes + '\n' : ''}[LAB_ORDERS: ${JSON.stringify(updatedOrders)}]`

      const { error } = await supabase
        .from('prescriptions')
        .update({ doctor_notes: newNotes })
        .eq('id', targetRx.id)

      if (error) throw error

      setPrescriptions((prev: any[]) => prev.map(rx => rx.id === targetRx.id ? { ...rx, doctor_notes: newNotes } : rx))
    } catch (err) {
      console.error('Error updating lab coordination from patient:', err)
    }
  }

  useEffect(() => {
    const getPatientAuth = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setPatientUserId(user.id)
      }
    }
    getPatientAuth()
  }, [])
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'overview'

  const [viewMode, setViewMode] = useState<'cards' | 'calendar'>('cards')
  
  const [doctors, setDoctors] = useState<DoctorInfo[]>(initialDoctors)
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorInfo | null>(null)
  const [viewingDoctorId, setViewingDoctorId] = useState<string | null>(null)
  const [allDoctors, setAllDoctors] = useState<DoctorInfo[]>([])
  const [showAddDoctor, setShowAddDoctor] = useState(false)
  const [searching, setSearching] = useState(false)
  const [addingDoctor, setAddingDoctor] = useState<string | null>(null)
  
  const [expandedDoctorId, setExpandedDoctorId] = useState<string | null>(null)
  const [doctorCerts, setDoctorCerts] = useState<Record<string, Certification[]>>({})
  
  const [certs, setCerts] = useState<Certification[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)

  const [appointmentLogs, setAppointmentLogs] = useState<Record<string, AppointmentLog[]>>({})
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null)
  const [queueWaitTimes, setQueueWaitTimes] = useState<Record<string, number>>({})

  // Live doctor status & queue turns
  type LiveDoctorStatus = {
    is_in_consultation: boolean
    current_serving_position: number
    total_clinic_today: number
    waiting_outside_count: number
    doctor_status?: string
    is_unavailable?: boolean
    queue: Array<{
      id: string
      queue_position: number
      status: string
      scheduled_time: string
      is_arrived: boolean
    }>
  }
  const [liveDoctorData, setLiveDoctorData] = useState<Record<string, LiveDoctorStatus>>({})
  const [arrivingId, setArrivingId] = useState<string | null>(null)

  // Fetch all authorized doctors for searching
  useEffect(() => {
    if (!showAddDoctor) return
    const fetchAllDocs = async () => {
      setSearching(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, specialization, bio, clinic_location, working_hours, phone_number, fees_normal, fees_urgent, fees_home_visit, availability_status')
        .eq('role', 'doctor')
        .eq('is_authorized', true)
      if (data) setAllDoctors(data as any)
      setSearching(false)
    }
    fetchAllDocs()
  }, [showAddDoctor])

  const isSameLocalDate = (d1?: string | null) => {
    if (!d1) return false
    const date1 = new Date(d1)
    const now = new Date()
    return date1.getFullYear() === now.getFullYear() &&
           date1.getMonth() === now.getMonth() &&
           date1.getDate() === now.getDate()
  }

  // Fetch live doctor status & relative queue positions
  useEffect(() => {
    const todayApts = appointments.filter(a => isSameLocalDate(a.scheduled_time) && (a.status === 'scheduled' || a.status === 'in_progress'));
    const distinctDoctorIds = Array.from(new Set([
      ...todayApts.map(a => a.doctor_id),
      ...doctors.map(d => d.id)
    ])).filter(Boolean);

    if (distinctDoctorIds.length === 0) return;

    const supabase = createClient();
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const fetchLiveStatus = async () => {
      for (const docId of distinctDoctorIds) {
        try {
          // 1. Try secure RPC
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_doctor_live_queue', { p_doctor_id: docId });
          if (!rpcError && rpcData) {
            setLiveDoctorData(prev => ({ ...prev, [docId]: rpcData as LiveDoctorStatus }));
          } else {
            // 2. Fallback: query appointments directly
            const { data: qData } = await supabase
              .from('appointments')
              .select('id, queue_position, status, scheduled_time, notes')
              .eq('doctor_id', docId)
              .neq('appointment_type', 'home_visit')
              .in('status', ['scheduled', 'in_progress'])
              .gte('scheduled_time', startOfToday.toISOString());

            if (qData) {
              const inProgress = qData.find((a: any) => a.status === 'in_progress');
              const { data: docProf } = await supabase
                .from('profiles')
                .select('availability_status, working_hours')
                .eq('id', docId)
                .single();
              const docSt = docProf?.availability_status || (docProf?.working_hours as any)?.current_status || 'available';
              const isUnavail = docSt === 'unavailable';

              setLiveDoctorData(prev => ({
                ...prev,
                [docId]: {
                  is_in_consultation: !!inProgress || docSt === 'busy',
                  doctor_status: docSt,
                  is_unavailable: isUnavail,
                  current_serving_position: inProgress?.queue_position || 0,
                  total_clinic_today: qData.length,
                  waiting_outside_count: qData.filter((a: any) => a.status === 'scheduled').length,
                  queue: qData.map((a: any) => ({
                    id: a.id,
                    queue_position: a.queue_position || 1,
                    status: a.status,
                    scheduled_time: a.scheduled_time,
                    is_arrived: (a.notes || '').includes('[ARRIVED:')
                  }))
                }
              }));
            }
          }
        } catch (err) {
          console.error('Error fetching live queue for doctor:', docId, err);
        }
      }
    };

    fetchLiveStatus();

    // Subscribe to realtime updates for these doctors
    const channels = distinctDoctorIds.map(docId => {
      return supabase
        .channel(`patient-live-queue-${docId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${docId}` }, () => {
          fetchLiveStatus();
        })
        .subscribe();
    });

    const interval = setInterval(fetchLiveStatus, 30000); // 30s polling backup
    return () => {
      clearInterval(interval);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [appointments, doctors]);

  // Push Notifications: Alert patient phone when doctor is calling now or when patient is next in line
  useEffect(() => {
    if (typeof window === 'undefined') return

    const isSameLocalDate = (d1?: string | null) => {
      if (!d1) return false
      const date1 = new Date(d1)
      const now = new Date()
      return date1.getFullYear() === now.getFullYear() &&
             date1.getMonth() === now.getMonth() &&
             date1.getDate() === now.getDate()
    }

    appointments.forEach(apt => {
      if (!isSameLocalDate(apt.scheduled_time)) return
      if (apt.status === 'completed' || apt.status === 'cancelled') return

      const docStatus = liveDoctorData[apt.doctor_id]
      const activeQueueToday = (docStatus?.queue || []).filter(q => q.status !== 'completed' && q.status !== 'cancelled')
      const myIdx = activeQueueToday.findIndex(q => q.id === apt.id)

      let patientsAhead = 0
      if (myIdx >= 0) {
        patientsAhead = myIdx
      } else if (apt.scheduled_time) {
        const aptDate = new Date(apt.scheduled_time).getTime()
        patientsAhead = activeQueueToday.filter(q => q.scheduled_time && new Date(q.scheduled_time).getTime() < aptDate).length
      }

      const myTurnNumber = myIdx >= 0 ? (myIdx + 1) : ((apt.queue_position && apt.queue_position <= (activeQueueToday.length || 1)) ? apt.queue_position : 1)
      const isCallingMeNow = apt.status === 'in_progress'

      const alreadyNotified = notifiedTurnRef.current[apt.id] || {}

      // 1. Doctor calling now
      if (isCallingMeNow && !alreadyNotified.calling) {
        notifiedTurnRef.current[apt.id] = { ...alreadyNotified, calling: true }
        sendTurnAlertNotification({
          doctorName: apt.doctor_name || 'Doctor',
          turnNumber: myTurnNumber,
          isCallingNow: true,
          patientsAhead: 0,
          locale,
        })
      }
      // 2. Next in line alert
      else if (!isCallingMeNow && patientsAhead <= 1 && !alreadyNotified.next) {
        notifiedTurnRef.current[apt.id] = { ...alreadyNotified, next: true }
        sendTurnAlertNotification({
          doctorName: apt.doctor_name || 'Doctor',
          turnNumber: myTurnNumber,
          isCallingNow: false,
          patientsAhead,
          locale,
        })
      }
    })
  }, [appointments, liveDoctorData, locale]);

  // Handle patient arrival alert
  const handleMarkArrival = async (aptId: string) => {
    setArrivingId(aptId);
    try {
      const supabase = createClient();
      const currentApt = appointments.find(a => a.id === aptId);
      const arrivedTag = `[ARRIVED: ${new Date().toISOString()}]`;
      const updatedNotes = currentApt?.notes ? `${currentApt.notes} ${arrivedTag}` : arrivedTag;

      const { error } = await supabase
        .from('appointments')
        .update({ notes: updatedNotes })
        .eq('id', aptId);

      if (error) {
        alert('Could not update arrival status: ' + error.message);
      } else {
        setAppointments(prev => prev.map(a => a.id === aptId ? { ...a, notes: updatedNotes } : a));
      }
    } catch (err: any) {
      alert('Error marking arrival: ' + (err.message || 'Unknown error'));
    } finally {
      setArrivingId(null);
    }
  };

  const parseArrivalTime = (notes?: string | null) => {
    if (!notes) return null;
    const match = notes.match(/\[ARRIVED:\s*([^\]]+)\]/);
    if (match && match[1]) {
      try {
        return new Date(match[1]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      } catch {
        return null;
      }
    }
    return null;
  };

  const handleAddDoctor = async (docId: string) => {
    setAddingDoctor(docId)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert("Please sign in first"); return }

      const { error } = await supabase.from('patient_doctors').insert({ patient_id: user.id, doctor_id: docId })
      if (error) {
        if (error.code === '23505') alert("This doctor is already in your list.")
        else throw error
      } else {
        const newDoc = allDoctors.find(d => d.id === docId)
        if (newDoc) setDoctors(prev => [...prev, newDoc])
        setShowAddDoctor(false)
      }
    } catch (err: any) {
      alert("Failed to add doctor: " + (err.message || "Unknown error"))
    } finally {
      setAddingDoctor(null)
    }
  }

  const handleRemoveDoctor = async (docId: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('patient_doctors').delete().eq('patient_id', user.id).eq('doctor_id', docId)
    if (!error) setDoctors(prev => prev.filter(d => d.id !== docId))
  }

  const fetchDoctorCertificates = async (docId: string) => {
    if (doctorCerts[docId]) return // already fetched
    const supabase = createClient()
    const { data } = await supabase.from('doctor_certificates').select('id, title, description').eq('doctor_id', docId)
    if (data) {
      setDoctorCerts(prev => ({ ...prev, [docId]: data }))
    }
  }

  const fetchAppointmentLogs = async (apptId: string) => {
    if (appointmentLogs[apptId]) {
      setExpandedLogs(expandedLogs === apptId ? null : apptId)
      return
    }
    const supabase = createClient()
    const { data } = await supabase
      .from('appointment_logs')
      .select('id, action, previous_status, new_status, details, created_at, profiles:changed_by(full_name)')
      .eq('appointment_id', apptId)
      .order('created_at', { ascending: false })
    
    if (data) {
      const logs = data.map((l: any) => ({
        ...l,
        changed_by_name: l.profiles?.full_name || 'System'
      }))
      setAppointmentLogs(prev => ({ ...prev, [apptId]: logs }))
      setExpandedLogs(expandedLogs === apptId ? null : apptId)
    }
  }

  const handleDeleteAppointment = async (apptId: string) => {
    if (!confirm(locale === 'ar' ? 'هل أنت متأكد من إلغاء هذا الطلب؟' : 'Are you sure you want to cancel this pending request?')) return;
    const supabase = createClient()
    const { error } = await supabase.from('appointments').delete().eq('id', apptId)
    if (error) {
      alert("Error deleting request: " + error.message)
    } else {
      setAppointments(prev => prev.filter(a => a.id !== apptId))
    }
  }

  const handleCancelMeeting = async (apptId: string) => {
    if (!confirm(locale === 'ar' ? 'هل أنت متأكد من رغبتك في إلغاء هذا الموعد؟' : 'Are you sure you want to cancel this appointment?')) return;
    const supabase = createClient()
    const { error } = await supabase.from('appointments').update({
      status: 'cancelled',
      notes: '[Cancelled by Patient]'
    }).eq('id', apptId)
    if (error) {
      alert("Error cancelling appointment: " + error.message)
    } else {
      setAppointments(prev => prev.filter(a => a.id !== apptId))
    }
  }

  const handleMarkPaymentPaid = async (apptId: string) => {
    const ref = prompt(
      locale === 'ar'
        ? 'أدخل رقم الحوالة أو اسم الحساب المحول منه (اختياري):'
        : 'Enter InstaPay payment reference or sender name (optional):',
      'InstaPay Transfer'
    )
    if (ref === null) return;
    const supabase = createClient()
    const refVal = ref.trim() || 'InstaPay Transfer'
    let { error } = await supabase.from('appointments').update({
      payment_status: 'paid_by_patient',
      payment_reference: refVal
    }).eq('id', apptId)

    // Fallback if Postgres payment_status enum has not yet been altered to include 'paid_by_patient'
    if (error && (error.message?.includes('payment_status') || error.message?.includes('enum') || error.message?.includes('paid_by_patient'))) {
      const retry1 = await supabase.from('appointments').update({
        payment_reference: refVal
      }).eq('id', apptId)
      
      if (!retry1.error) {
        error = null
      } else {
        const { data: aptData } = await supabase.from('appointments').select('notes').eq('id', apptId).single()
        const paidTag = `[PAID_BY_PATIENT: ${refVal}]`
        const newNotes = `${aptData?.notes || ''} ${paidTag}`.trim()
        const retry2 = await supabase.from('appointments').update({ notes: newNotes }).eq('id', apptId)
        error = retry2.error
      }
    }

    if (error) {
      alert("Error updating payment: " + error.message)
    } else {
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, payment_status: 'paid_by_patient', payment_reference: refVal } : a))
    }
  }

  const handleProposalAction = async (apptId: string, action: 'approve' | 'reject') => {
    const supabase = createClient()
    const newStatus = action === 'approve' ? 'scheduled' : 'cancelled'
    const { error } = await supabase
      .from('appointments')
      .update({ status: newStatus })
      .eq('id', apptId)
    
    if (error) {
      alert("Error: " + error.message)
    } else {
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a))
    }
  }

  const handleAcceptSmartProposal = async (apptId: string, newIsoString: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('appointments')
      .update({
        scheduled_time: newIsoString,
        status: 'scheduled'
      })
      .eq('id', apptId)

    if (error) {
      alert("Error updating appointment: " + error.message)
      return
    }

    setAppointments(prev => prev.map(a => a.id === apptId ? {
      ...a,
      scheduled_time: newIsoString,
      status: 'scheduled'
    } : a))

    alert(locale === 'ar'
      ? '✨ تم تأكيد الموعد الذكي المقترح بنجاح!'
      : '✨ Smart suggested appointment slot confirmed successfully!')
  }

  // Fetch patient medical certifications
  useEffect(() => {
    if (activeTab !== 'certs') return
    const fetchCerts = async () => {
      setLoadingCerts(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('certifications')
        .select('id, title, description, issued_at, profiles!certifications_doctor_id_fkey(full_name)')
        .eq('patient_id', user.id)
        .order('issued_at', { ascending: false })
      if (data) {
        setCerts(data.map((c: any) => ({ ...c, doctor_name: c.profiles?.full_name || 'Doctor' })))
      }
      setLoadingCerts(false)
    }
    fetchCerts()
  }, [activeTab])

  // Fetch patient prescriptions (needed on both Overview and Prescriptions tabs)
  useEffect(() => {
    if (activeTab !== 'prescriptions' && activeTab !== 'overview') return
    const fetchPrescriptions = async () => {
      setLoadingPrescriptions(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      // Get patient name
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      if (prof) setPatientName(prof.full_name || 'Patient')

      const { data } = await supabase
        .from('prescriptions')
        .select(`
          id, doctor_id, created_at, diagnosis, symptoms, medications, doctor_notes,
          doctor:profiles!prescriptions_doctor_id_fkey(full_name)
        `)
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
      
      if (data) {
        setPrescriptions(data.map((rx: any) => ({
          ...rx,
          doctor_name: rx.doctor?.full_name || 'Doctor'
        })))
      }
      setLoadingPrescriptions(false)
    }
    fetchPrescriptions()
  }, [activeTab])

  // Load today's taken medication logs from localStorage
  useEffect(() => {
    try {
      const todayKey = `medilab_taken_${new Date().toISOString().slice(0, 10)}`
      const saved = localStorage.getItem(todayKey)
      if (saved) {
        setOverviewTakenMeds(JSON.parse(saved))
      }
    } catch {}
  }, [])

  // Check for completed visits that need an automated CSAT rating prompt
  useEffect(() => {
    const checkUnreviewedVisits = async () => {
      const completed = appointments.filter(a => a.status === 'completed')
      if (completed.length === 0) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      try {
        const { data: reviews } = await supabase
          .from('doctor_reviews')
          .select('appointment_id')
          .eq('patient_id', user.id)

        const reviewedIds = new Set((reviews || []).map((r: any) => r.appointment_id).filter(Boolean))

        // Find the most recent completed visit without a review and not dismissed
        const candidate = completed.find(a => {
          if (reviewedIds.has(a.id)) return false
          const isDismissed = localStorage.getItem(`medilab_csat_dismissed_${a.id}`)
          return !isDismissed
        })

        if (candidate) {
          setPendingCsatApt(candidate)
        }
      } catch (err) {
        console.warn('CSAT check notice:', err)
      }
    }

    checkUnreviewedVisits()
  }, [appointments])

  // Handle quick CSAT submission
  const handleQuickSubmitCsat = async (starScore: number) => {
    if (!pendingCsatApt) return
    setCsatSubmitting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setCsatSubmitting(false)
      return
    }

    try {
      await supabase.from('doctor_reviews').insert({
        doctor_id: pendingCsatApt.doctor_id,
        patient_id: user.id,
        appointment_id: pendingCsatApt.id,
        rating: starScore,
        review_text: csatComment.trim() || null,
        tags: csatTags
      })
      setCsatSubmitted(true)
      localStorage.setItem(`medilab_csat_dismissed_${pendingCsatApt.id}`, 'true')
      setTimeout(() => setPendingCsatApt(null), 3500)
    } catch (err) {
      console.warn('CSAT submit error:', err)
    } finally {
      setCsatSubmitting(false)
    }
  }

  // Handle quick Overview Pill Check-in
  const handleOverviewTakeDose = async (medName: string, slotName: string, rxId?: string) => {
    const key = `${medName}_${slotName}`
    const isAlreadyTaken = !!overviewTakenMeds[key]
    const nowISO = new Date().toISOString()
    const todayStr = nowISO.slice(0, 10)

    setOverviewTakenMeds(prev => {
      const next = { ...prev }
      if (isAlreadyTaken) {
        delete next[key]
      } else {
        next[key] = nowISO
      }
      try {
        localStorage.setItem(`medilab_taken_${todayStr}`, JSON.stringify(next))
      } catch {}
      return next
    })

    if (!isAlreadyTaken) {
      try {
        await fetch('/api/adherence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: patientUserId || null,
            prescription_id: rxId || null,
            medication_name: medName,
            slot: slotName,
            taken_at: nowISO,
            scheduled_date: todayStr,
            confirmed_by: 'patient',
            notes: 'Checked-in via Patient Overview Dashboard'
          })
        })
      } catch (err) {
        console.warn('Adherence log fetch error:', err)
      }
    }
  }

  // Separate active from past
  const activeAppointments = appointments.filter(a => ['waiting', 'scheduled', 'in_progress', 'proposed'].includes(a.status || ''))
  const pastAppointments = appointments.filter(a => ['completed', 'cancelled'].includes(a.status || ''))
  const todayAppointments = activeAppointments.filter(a => isSameLocalDate(a.scheduled_time) && ['scheduled', 'in_progress', 'waiting'].includes(a.status || ''))

  const renderDoctorWorkingHours = (workingHours: any) => {
    if (!workingHours) return <p className="text-gray-500 italic text-sm">Not specified</p>;
    let hours = workingHours;
    if (typeof hours === 'string') {
      try { hours = JSON.parse(hours) } catch { return null }
    }
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
        {days.map(d => (
          <div key={d} className="flex justify-between border-b border-gray-100 dark:border-gray-800 py-1">
            <span className="text-gray-500 uppercase text-xs font-bold">{d}</span>
            <span className={`font-medium ${hours[d] === 'Closed' ? 'text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{hours[d] || 'Closed'}</span>
          </div>
        ))}
      </div>
    )
  }


  const renderAppointmentCard = (apt: any) => {

                const cfg = STATUS_CONFIG[apt.status || 'waiting']
                const isPending = apt.status === 'waiting'
                const isApproved = apt.status === 'scheduled'
                const isPaid = apt.payment_status === 'paid'
                const isPaidByPatient = apt.payment_status === 'paid_by_patient' || !!apt.payment_reference || (apt.notes || '').includes('[PAID_BY_PATIENT')
                const needsPayment = !isPaid && !isPaidByPatient && isApproved
                const isProposed = apt.status === 'proposed'
                const isProposedPast = isProposed && !!apt.scheduled_time && (new Date(apt.scheduled_time).getTime() < Date.now())
                const isFollowUp = (apt.notes || '').includes('[FREE_FOLLOW_UP]') || (apt.notes || '').includes('follow_up') || Number(apt.fees) === 0

                let badgeText = cfg.label
                let badgeColor = cfg.color
                let badgeIcon = cfg.icon

                if (isProposed) {
                  if (isProposedPast) {
                    badgeText = locale === 'ar' ? 'انتهت صلاحية الموعد المقترح' : 'PROPOSED TIME EXPIRED'
                    badgeColor = 'text-amber-700'
                    badgeIcon = '⏳'
                  } else {
                    badgeText = locale === 'ar' ? 'اقتراح موعد جديد من الطبيب' : 'DOCTOR PROPOSED NEW TIME'
                    badgeColor = 'text-purple-700'
                    badgeIcon = '📅'
                  }
                } else if (isApproved) {
                  if (isPaid) {
                    badgeText = locale === 'ar' ? 'تم تأكيد الدفع' : 'PAID & CONFIRMED'
                    badgeColor = 'text-emerald-700'
                    badgeIcon = '✅'
                  } else if (isPaidByPatient) {
                    badgeText = locale === 'ar' ? 'تم إرسال الدفع (بانتظار التأكيد)' : 'PAYMENT SUBMITTED (VERIFYING)'
                    badgeColor = 'text-blue-700'
                    badgeIcon = '⏳'
                  } else {
                    badgeText = tp('awaiting_payment') || 'Awaiting Payment'
                    badgeColor = 'text-blue-700'
                    badgeIcon = '💳'
                  }
                }
                
                return (
                  <div key={apt.id} className={`bg-white dark:bg-gray-900 rounded-2xl p-5 border ${isProposedPast ? 'border-amber-300 dark:border-amber-700 shadow-amber-500/10' : isProposed ? 'border-purple-300 dark:border-purple-700' : isPending ? 'border-amber-200 dark:border-amber-800' : needsPayment ? 'border-blue-200 dark:border-blue-800' : isPaid ? 'border-emerald-200 dark:border-emerald-800/60' : 'border-gray-100 dark:border-gray-800'} shadow-sm flex flex-col justify-between`}>
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{badgeIcon}</span>
                          <span className={`text-xs font-black uppercase tracking-wider ${badgeColor}`}>{badgeText}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                           {/* Mark Payment as Paid action */}
                           {!isPaid && !isPaidByPatient && isApproved && (
                             <button
                               onClick={() => handleMarkPaymentPaid(apt.id)}
                               className="text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1.5 shadow-sm"
                               title="Confirm payment made via InstaPay"
                             >
                               <span>💳</span>
                               <span>{locale === 'ar' ? 'دفعت (انستاباي)' : 'I Have Paid'}</span>
                             </button>
                           )}

                           {/* Reschedule / Edit */}
                           {(isPending || isApproved) && (
                             <button 
                               onClick={() => { 
                                 const doc = doctors.find(d => d.id === apt.doctor_id) || allDoctors.find(d => d.id === apt.doctor_id);
                                 setSelectedDoctor(doc || ({ id: apt.doctor_id, full_name: apt.doctor_name } as any));
                                 setEditAppointmentId(apt.id); 
                                 setShowBooking(true); 
                               }} 
                               className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1.5 shadow-sm"
                               title="Modify or reschedule this visit"
                             >
                               <span>✏️</span>
                               <span>{isPending ? 'Edit' : (tp('reschedule') || 'Reschedule')}</span>
                             </button>
                           )}

                           {/* Cancel Meeting */}
                           {(isPending || isApproved) && (
                             <button 
                               onClick={() => handleCancelMeeting(apt.id)} 
                               className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1.5 shadow-sm"
                               title="Cancel this appointment"
                             >
                               <span>🚫</span>
                               <span>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</span>
                             </button>
                           )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingDoctorId(apt.doctor_id)}
                          className="font-black text-lg text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 text-left group"
                          title="Click to view Dr. profile, rush hours & stats"
                        >
                          <span>Dr. {apt.doctor_name}</span>
                          <span className="text-xs text-blue-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">ℹ️ View Profile →</span>
                        </button>

                        {/* WhatsApp Dr. button */}
                        {(() => {
                          const docObj = doctors.find(d => d.id === apt.doctor_id) || allDoctors.find(d => d.id === apt.doctor_id);
                          const docPhone = apt.doctor_phone || docObj?.phone_number;
                          const waUrl = getWhatsAppLink(docPhone, `Hello Dr. ${apt.doctor_name}, this is regarding my appointment at MediLab.`);
                          if (!waUrl) {
                            return (
                              <button
                                type="button"
                                onClick={() => alert(locale === 'ar' ? `الطبيب د. ${apt.doctor_name} لم يقم بإضافة رقم هاتف متاح للواتساب بعد` : `Dr. ${apt.doctor_name} has not registered a valid WhatsApp phone number yet.`)}
                                className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors flex items-center gap-1.5 opacity-70"
                                title="No valid phone registered"
                              >
                                <WhatsAppIcon className="w-4 h-4 text-gray-400" />
                                <span>WhatsApp</span>
                              </button>
                            );
                          }
                          return (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 transition-all flex items-center gap-1.5 shadow-sm group"
                              title="Chat with doctor on WhatsApp"
                            >
                              <WhatsAppIcon className="w-4 h-4 text-[#25D366] group-hover:scale-110 transition-transform" />
                              <span className="font-black">WhatsApp</span>
                            </a>
                          );
                        })()}
                      </div>

                      {apt.family_member_name && (
                        <div className="mt-1">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            👨‍👩‍👧 {locale === 'ar' ? `لصالح: ${apt.family_member_name}` : `For: ${apt.family_member_name}`}
                          </span>
                        </div>
                      )}

                      {/* Display Patient Condition Note if available */}
                      {(() => {
                        if (!apt.notes) return null;
                        const match = apt.notes.match(/\[PATIENT_NOTE:\s*([^\]]+)\]/);
                        if (!match || !match[1]) return null;
                        return (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-xs">
                            <p className="font-bold text-[10px] uppercase text-blue-500 mb-0.5">
                              📝 {locale === 'ar' ? 'ملاحظاتك للطبيب:' : 'Your Note to Doctor:'}
                            </p>
                            <p className="text-gray-700 dark:text-gray-300 italic leading-relaxed">
                              "{match[1]}"
                            </p>
                          </div>
                        );
                      })()}
                      
                      {/* Display Queue Removal Note if applicable */}
                      {(() => {
                        if (!apt.notes || !apt.notes.includes('[REMOVED_FROM_QUEUE:')) return null;
                        const match = apt.notes.match(/\[REMOVED_FROM_QUEUE:\s*([^\]]+)\]/);
                        const nurseNoteMatch = apt.notes.match(/\[NURSE_NOTE:\s*([^\]]+)\]/);
                        return (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs">
                            <p className="font-bold text-[10px] uppercase text-red-600 mb-0.5 flex items-center gap-1">
                              <span>⚠️</span> {locale === 'ar' ? 'ملاحظة مغادرة العيادة:' : 'Removed from Clinic Queue:'}
                            </p>
                            <p className="text-gray-800 dark:text-gray-200 font-semibold">
                              {match?.[1] || 'Patient left queue'}
                            </p>
                            {nurseNoteMatch?.[1] && (
                              <p className="text-[11px] text-gray-500 italic mt-0.5">
                                "{nurseNoteMatch[1]}"
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      
                      {apt.status === 'proposed' && (() => {
                        const docObj = doctors.find(d => d.id === apt.doctor_id) || allDoctors.find(d => d.id === apt.doctor_id);
                        const smartSuggestion = getSmartSuggestedUpcomingDate(apt.scheduled_time, docObj?.working_hours, locale);

                        if (isProposedPast) {
                          return (
                            <div className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-purple-500/10 to-indigo-500/10 border-2 border-amber-400/60 dark:border-amber-500/40 space-y-3.5 shadow-md animate-in fade-in slide-in-from-top-2">
                              {/* Header alert */}
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
                                  ⏳
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                      {locale === 'ar' ? 'الموعد المقترح انتهى وقته' : 'Doctor Proposed Date Has Passed'}
                                    </span>
                                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-200/60 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 rounded-md">
                                      {locale === 'ar' ? 'منتهي الصلاحية' : 'Expired'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                                    {locale === 'ar'
                                      ? `اقترح الطبيب سابقاً موعد (${apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''}) ولكن التاريخ قد مضى. قام نظامنا الذكي بحساب أقرب موعد متاح لك مع الطبيب:`
                                      : `The doctor previously proposed ${apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : ''}, which has already passed. Our smart engine calculated the nearest open slot for you:`}
                                  </p>
                                </div>
                              </div>

                              {/* Smart Suggested Slot Showcase */}
                              <div className="p-3.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-xl border-2 border-emerald-500/60 shadow-sm flex items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                    <span className="animate-pulse">✨</span> {locale === 'ar' ? 'الموعد البديل الذكي الموصى به' : 'Smart Recommended Slot'}
                                  </span>
                                  <p className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                                    <span>📅</span> {smartSuggestion.displayString}
                                  </p>
                                </div>
                                <span className="px-2.5 py-1 text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 rounded-lg shrink-0 border border-emerald-300 dark:border-emerald-700">
                                  {locale === 'ar' ? 'متاح ✓' : 'Available ✓'}
                                </span>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                                {/* 1. Accept Smart Slot */}
                                <button
                                  type="button"
                                  onClick={() => handleAcceptSmartProposal(apt.id, smartSuggestion.isoString)}
                                  className="flex-[2] bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black py-2.5 px-3 rounded-xl text-xs shadow-md shadow-emerald-500/25 flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
                                >
                                  <span>✨</span>
                                  <span>{locale === 'ar' ? `الموافقة على الموعد المقترح (${smartSuggestion.shortTime})` : `Accept Suggested (${smartSuggestion.shortTime})`}</span>
                                </button>

                                {/* 2. Choose Different Slot */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const doc = doctors.find(d => d.id === apt.doctor_id) || allDoctors.find(d => d.id === apt.doctor_id);
                                    setSelectedDoctor(doc || ({ id: apt.doctor_id, full_name: apt.doctor_name } as any));
                                    setEditAppointmentId(apt.id);
                                    setShowBooking(true);
                                  }}
                                  className="flex-1 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                                >
                                  <span>🗓️</span>
                                  <span>{locale === 'ar' ? 'اختيار موعد آخر' : 'Pick Other Time'}</span>
                                </button>

                                {/* 3. Reject / Cancel */}
                                <button
                                  type="button"
                                  onClick={() => handleProposalAction(apt.id, 'reject')}
                                  className="bg-white dark:bg-gray-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-900 font-bold py-2.5 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1 shadow-sm"
                                >
                                  <span>🚫</span>
                                  <span>{locale === 'ar' ? 'إلغاء' : 'Decline'}</span>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // Future proposed date: standard approval
                        return (
                          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                             <p className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                               <span>📢</span> {tp('proposed_time_msg') || 'The doctor has proposed a new time for your appointment.'}
                             </p>
                             <div className="flex gap-2">
                                <button 
                                  onClick={() => handleProposalAction(apt.id, 'approve')}
                                  className="flex-1 bg-purple-600 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-purple-500/30 hover:bg-purple-700 transition-all"
                                >
                                  {tp('approve_new_time') || 'Approve New Time'}
                                </button>
                                <button 
                                  onClick={() => {
                                    const doc = doctors.find(d => d.id === apt.doctor_id) || allDoctors.find(d => d.id === apt.doctor_id);
                                    setSelectedDoctor(doc || ({ id: apt.doctor_id, full_name: apt.doctor_name } as any));
                                    setEditAppointmentId(apt.id);
                                    setShowBooking(true);
                                  }}
                                  className="px-3 bg-white dark:bg-gray-800 text-blue-600 border border-blue-200 dark:border-blue-800 font-bold py-2.5 rounded-xl text-xs hover:bg-blue-50 transition-all"
                                >
                                  {locale === 'ar' ? 'تغيير' : 'Change'}
                                </button>
                                <button 
                                  onClick={() => handleProposalAction(apt.id, 'reject')}
                                  className="flex-1 bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-900 font-bold py-2.5 rounded-xl text-xs hover:bg-red-50 transition-all"
                                >
                                  {tp('reject_cancel') || 'Reject & Cancel'}
                                </button>
                             </div>
                          </div>
                        );
                      })()}
                      
                      {/* Live Queue, Arrival Alert & Doctor Free/Busy Status */}
                      {isApproved && apt.appointment_type !== 'home_visit' && (() => {
                        const isSameLocalDate = (d1?: string | null) => {
                          if (!d1) return false
                          const date1 = new Date(d1)
                          const now = new Date()
                          return date1.getFullYear() === now.getFullYear() &&
                                 date1.getMonth() === now.getMonth() &&
                                 date1.getDate() === now.getDate()
                        }
                        if (!isSameLocalDate(apt.scheduled_time)) return null;

                        const arrivalTime = parseArrivalTime(apt.notes);
                        const isArrived = !!arrivalTime;
                        const docStatus = liveDoctorData[apt.doctor_id];

                        // Ground-truth active waiting queue (excludes cancelled & completed)
                        const activeQueueToday = (docStatus?.queue || []).filter(q => q.status !== 'completed' && q.status !== 'cancelled');
                        const myIdx = activeQueueToday.findIndex(q => q.id === apt.id);
                        
                        // Clean, reliable active queue position & patients ahead
                        let patientsAhead = 0;
                        if (myIdx >= 0) {
                          patientsAhead = myIdx;
                        } else if (apt.scheduled_time) {
                          const aptDate = new Date(apt.scheduled_time).getTime();
                          patientsAhead = activeQueueToday.filter(q => q.scheduled_time && new Date(q.scheduled_time).getTime() < aptDate).length;
                        }

                        const myTurnNumber = myIdx >= 0 ? (myIdx + 1) : ((apt.queue_position && apt.queue_position <= (activeQueueToday.length || 1)) ? apt.queue_position : 1);
                        const isCallingMeNow = apt.status === 'in_progress';
                        const inProgressIdx = activeQueueToday.findIndex(q => q.status === 'in_progress');
                        const currentServing = inProgressIdx >= 0 ? (inProgressIdx + 1) : (docStatus?.current_serving_position || (docStatus?.is_in_consultation ? 1 : 0));

                        return (
                          <div className="mt-3 space-y-3">
                            {/* Urgent Live Calling Banner when Doctor Calls Patient */}
                            {isCallingMeNow && (
                              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 border-2 border-emerald-400 animate-pulse flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-2xl">🔔</span>
                                  <div>
                                    <p className="font-black text-sm uppercase tracking-wide">
                                      {locale === 'ar' ? 'الطبيب ينادي عليك الآن!' : 'Doctor is Calling You Now!'}
                                    </p>
                                    <p className="text-xs text-emerald-100">
                                      {locale === 'ar' ? 'تذكرتك حان دورها، يرجى الدخول لغرفة الكشف فوراً.' : 'Your turn is ready! Please proceed directly into the examination room.'}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs font-black bg-white text-emerald-700 px-3 py-1 rounded-xl shadow-sm">
                                  Q{myTurnNumber}
                                </span>
                              </div>
                            )}

                            {/* Arrival Notification Button / Confirmed Badge */}
                            {!isArrived ? (
                              <button
                                type="button"
                                disabled={arrivingId === apt.id}
                                onClick={() => handleMarkArrival(apt.id)}
                                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                              >
                                <span>📍</span>
                                <span>{arrivingId === apt.id ? getSafePatientMsg('notifying_reception', 'Notifying Reception...', 'جاري إخطار الاستقبال...') : getSafePatientMsg('i_have_arrived', 'I Have Arrived at Clinic', 'وصلت إلى العيادة')}</span>
                              </button>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black">
                                  <span className="text-base">✅</span>
                                  <span>{getSafePatientMsg('checked_in', 'Checked In at Clinic', 'تم تسجيل الوصول بالعيادة')} ({arrivalTime})</span>
                                </div>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                                  {getSafePatientMsg('doctor_notified', 'Doctor Notified', 'تم إخطار الطبيب')}
                                </span>
                              </div>
                            )}

                            {/* Live Turn & Doctor Free Status Widget */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/70 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/40 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                                  <span className="relative flex h-2.5 w-2.5">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${docStatus?.is_unavailable ? 'bg-rose-400' : docStatus?.is_in_consultation ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${docStatus?.is_unavailable ? 'bg-rose-500' : docStatus?.is_in_consultation ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                  </span>
                                  <span className={docStatus?.is_unavailable ? 'text-rose-600 dark:text-rose-400 font-black' : ''}>
                                    {docStatus?.is_unavailable
                                      ? getSafePatientMsg('doctor_on_break', 'Doctor is currently on break / unavailable', 'الطبيب في استراحة مؤقتة حالياً')
                                      : docStatus?.is_in_consultation 
                                        ? getSafePatientMsg('doctor_busy', 'Doctor is consulting with a patient', 'الطبيب مع مريض حالياً') 
                                        : getSafePatientMsg('doctor_free', 'Doctor is ready for next patient', 'الطبيب متاح ومستعد للمريض التالي')}
                                  </span>
                                </div>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                  Live Turn
                                </span>
                              </div>

                              {/* Queue numbers */}
                              <div className="grid grid-cols-2 gap-2 text-center pt-1">
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                  <p className="text-[10px] uppercase font-black text-gray-400">{getSafePatientMsg('your_turn_number', 'Your Turn', 'رقم دورك')}</p>
                                  <p className="text-lg font-black text-blue-600">Q{myTurnNumber}</p>
                                </div>
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                  <p className="text-[10px] uppercase font-black text-gray-400">{getSafePatientMsg('now_serving', 'Now Serving', 'الكشف الحالي')}</p>
                                  <p className="text-lg font-black text-gray-800 dark:text-gray-200">
                                    {isCallingMeNow ? `Q${myTurnNumber}` : (currentServing > 0 ? `Q${currentServing}` : (docStatus?.is_in_consultation ? 'In Room' : 'Ready'))}
                                  </p>
                                </div>
                              </div>

                              {/* Turn status statement & Estimated time */}
                              <div className="pt-1 flex items-center justify-between text-xs font-bold flex-wrap gap-2">
                                {isCallingMeNow ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black animate-pulse flex items-center gap-1">
                                    <span>🔔</span> {locale === 'ar' ? 'حان دورك الآن! يرجى الدخول' : "It's your turn right now! Please enter."}
                                  </span>
                                ) : patientsAhead === 0 ? (
                                  <span className="text-blue-600 dark:text-blue-400 font-black flex items-center gap-1">
                                    <span>⚡</span> {locale === 'ar' ? 'أنت التالي في الطابور! (0 مرضى قبلك)' : 'You are NEXT in line! (0 patients ahead)'}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                    <span>👥</span> {patientsAhead} {patientsAhead === 1 ? getSafePatientMsg('patient_ahead', 'patient ahead of you', 'مريض قبلك في الطابور') : getSafePatientMsg('patients_ahead', 'patients ahead of you', 'مرضى قبلك في الطابور')}
                                  </span>
                                )}
                                <span className="text-gray-500 text-[11px]">
                                  ⏱️ ~{Math.max(5, (patientsAhead || 0) * 15)} {t('mins') || 'mins wait'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-col gap-1.5 mt-3 text-sm text-gray-500">
                        <div className="flex gap-2 items-center flex-wrap">
                          <span className="w-5 text-center">📅</span>
                          <span className={`font-medium ${isProposedPast ? 'line-through text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                            {apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : 'TBD'}
                          </span>
                          {isProposedPast && (
                            <span className="text-[10px] font-black bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                              {locale === 'ar' ? 'منتهي الصلاحية' : 'Expired'}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                           <span className="w-5 text-center">🏥</span>
                           {isFollowUp ? (
                             <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                               <span>🔄</span>
                               <span>{locale === 'ar' ? 'استشارة مجانية (متابعة أسبوعية)' : 'Free Follow-up / Checkup'}</span>
                             </span>
                           ) : (
                             <span className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                               <span>🏷️</span>
                               <span>{locale === 'ar' ? 'كشف مدفوع' : 'Paid Visit'}</span>
                               <span className="capitalize text-xs text-gray-500">({(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')})</span>
                             </span>
                           )}
                        </div>
                        <div className="flex gap-2 items-center">
                           <span className="w-5 text-center">💰</span>
                           <span className="font-black text-gray-900 dark:text-gray-100">
                             {isFollowUp ? (
                               <span className="text-emerald-600 dark:text-emerald-400 font-black">{locale === 'ar' ? 'مجاناً (0 ج.م)' : 'FREE (0 EGP)'}</span>
                             ) : (
                               `${apt.fees || 200} EGP`
                             )}
                           </span>
                        </div>
                      </div>
                    </div>

                    {needsPayment && apt.instapay_address && (
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-in fade-in">
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                          <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-3">
                            {tp('pay_to_secure', { fees: apt.fees }) || `Pay ${apt.fees} EGP to InstaPay to secure this exact slot`}
                          </p>
                          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 inline-block shadow-sm">
                            <QRCodeSVG value={`instapay://payment?address=${apt.instapay_address}&amount=${apt.fees}`} size={80} bgColor="#ffffff" fgColor="#000000" />
                          </div>
                          <p className="text-xs font-bold text-gray-500 mt-2 break-all">{tp('payment_link') || 'payment link'}</p>

                          <button
                            type="button"
                            onClick={() => handleMarkPaymentPaid(apt.id)}
                            className="mt-3 w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                          >
                            <span>✓</span>
                            <span>{locale === 'ar' ? 'تم تحويل الرسوم عبر انستاباي' : 'I Have Paid via InstaPay'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {isPaidByPatient && (
                      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3 text-center text-xs text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center gap-2">
                          <span>⏳</span>
                          <span>
                            {locale === 'ar'
                              ? `تم إرسال الدفع (${apt.payment_reference || 'انستاباي'}). بانتظار تأكيد الاستلام من العيادة.`
                              : `Payment submitted (${apt.payment_reference || 'InstaPay'}). Waiting for clinic staff confirmation.`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto">

      {/* Overview / Home Dashboard View */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Phone Push Notifications Permission & Status Banner */}
          <NotificationPermissionBanner />

          {/* Automated Patient Satisfaction Score (CSAT) Banner */}
          {pendingCsatApt && (
            <div className="bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-indigo-500/15 border-2 border-amber-400/40 rounded-3xl p-6 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-amber-300/20">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-2xl bg-amber-500/20 text-amber-300 text-lg">⭐</span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                      {locale === 'ar' ? 'مؤشر رضا المريض (CSAT)' : 'Patient Satisfaction Score'}
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-gray-950 dark:text-white">
                      {locale === 'ar'
                        ? `كيف كانت تجربتك في كشف د. ${pendingCsatApt.doctor_name}؟`
                        : `How was your consultation with Dr. ${pendingCsatApt.doctor_name}?`}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(`medilab_csat_dismissed_${pendingCsatApt.id}`, 'true')
                    setPendingCsatApt(null)
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white flex items-center justify-center text-xs transition-colors shrink-0"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>

              {csatSubmitted ? (
                <div className="pt-4 flex items-center gap-3 text-emerald-400 font-bold text-sm">
                  <span className="text-xl">✅</span>
                  <span>{locale === 'ar' ? 'شكراً لتقييمك! تم حفظ التقييم بنجاح وتعزيز مؤشر الطبيب.' : 'Thank you! Your satisfaction rating was submitted successfully.'}</span>
                </div>
              ) : (
                <div className="pt-4 space-y-4">
                  {/* Star Rating Selector */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 mr-2">
                      {locale === 'ar' ? 'تقييم الزيارة:' : 'Rate Consultation:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setCsatHoverRating(star)}
                          onMouseLeave={() => setCsatHoverRating(0)}
                          onClick={() => setCsatRating(star)}
                          className="text-2xl sm:text-3xl transition-transform hover:scale-125 focus:outline-none"
                        >
                          <span className={(csatHoverRating || csatRating) >= star ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600'}>
                            ★
                          </span>
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-black text-amber-500 dark:text-amber-300 ml-2">
                      {csatRating === 5 ? (locale === 'ar' ? 'ممتاز جداً 🌟' : 'Exceptional 🌟') :
                       csatRating === 4 ? (locale === 'ar' ? 'جيد جداً 👍' : 'Very Good 👍') :
                       csatRating === 3 ? (locale === 'ar' ? 'مقبول' : 'Good') :
                       csatRating === 2 ? (locale === 'ar' ? 'دون التوقعات' : 'Fair') :
                       (locale === 'ar' ? 'غير راضٍ' : 'Needs Improvement')}
                    </span>
                  </div>

                  {/* Quick Compliment Tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { tag: '🎯 Accurate Diagnosis', ar: 'تشخيص دقيق' },
                      { tag: '⏱️ Low Wait Time', ar: 'وقت انتظار قليل' },
                      { tag: '💬 Clear Explanation', ar: 'شرح وافٍ للعلاج' },
                      { tag: '👂 Attentive Listener', ar: 'استماع باهتمام' },
                      { tag: '👶 Great with Kids', ar: 'تعامل رائع مع الأطفال' }
                    ].map(item => {
                      const isSelected = csatTags.includes(item.tag)
                      return (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => {
                            setCsatTags(prev => isSelected ? prev.filter(t => t !== item.tag) : [...prev, item.tag])
                          }}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-amber-400 text-slate-950 shadow-md font-black'
                              : 'bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {locale === 'ar' ? item.ar : item.tag}
                        </button>
                      )
                    })}
                  </div>

                  {/* Comment & Submit Button */}
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <input
                      type="text"
                      value={csatComment}
                      onChange={(e) => setCsatComment(e.target.value)}
                      placeholder={locale === 'ar' ? 'أضف تعليقاً إضافياً للطبيب (اختياري)...' : 'Add an optional note or compliment...'}
                      className="w-full flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 text-xs focus:outline-none focus:border-amber-400"
                    />

                    <button
                      type="button"
                      disabled={csatSubmitting}
                      onClick={() => handleQuickSubmitCsat(csatRating)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:brightness-110 active:scale-95 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all shrink-0 flex items-center justify-center gap-2"
                    >
                      {csatSubmitting ? (
                        <span>{locale === 'ar' ? 'جارٍ الإرسال...' : 'Submitting...'}</span>
                      ) : (
                        <>
                          <span>⭐</span>
                          <span>{locale === 'ar' ? 'إرسال التقييم' : 'Submit CSAT Rating'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hero Welcome & Quick Stats Banner */}
          <div className="bg-gradient-to-r from-blue-900/40 via-indigo-950/40 to-slate-900/60 border border-blue-500/20 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-xl relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[11px] font-black bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    {locale === 'ar' ? 'بوابة المريض الذكية' : 'MediLab Patient Portal'}
                  </span>
                  <span className="text-xs text-gray-400 font-bold">
                    {new Date().toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                  {locale === 'ar' ? `أهلاً بك، ${patientName}` : `Welcome back, ${patientName}`}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-xl">
                  {locale === 'ar'
                    ? 'تابع طابور عيادتك المباشر، وقت الانتظار المتوقع، مواعيد الكشف، وأكواب جدول أدويتك اليومية بكل سهولة.'
                    : 'Monitor your live clinic queue, estimated wait times, consultation bookings, and 5-cup medication timeline seamlessly.'}
                </p>
              </div>

              {/* Quick Book Visit CTA */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setEditAppointmentId(null); setShowBooking(true); }}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:brightness-110 text-white font-black text-sm shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2 active:scale-95"
                >
                  <span className="text-base">+</span>
                  <span>{locale === 'ar' ? 'حجز موعد كشف جديد' : 'Book New Visit'}</span>
                </button>
              </div>
            </div>

            {/* Quick Metric Cards Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-gray-200/20 dark:border-white/10">
              <div
                onClick={() => router.push(`/${locale}/dashboard?tab=bookings`)}
                className="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-gray-200/50 dark:border-white/10 transition-all cursor-pointer group"
                title="View bookings"
              >
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-bold">
                  <span>{locale === 'ar' ? 'الحجوزات النشطة' : 'Active Bookings'}</span>
                  <span className="text-base group-hover:scale-110 transition-transform">📅</span>
                </div>
                <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">{activeAppointments.length}</p>
                <span className="text-[10px] text-blue-600 dark:text-blue-300 font-bold group-hover:underline">
                  {locale === 'ar' ? 'عرض الكشوفات ←' : 'View bookings →'}
                </span>
              </div>

              <div
                onClick={() => {
                  const queueElement = document.getElementById('live-queue-radar');
                  if (queueElement) queueElement.scrollIntoView({ behavior: 'smooth' });
                }}
                className="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-gray-200/50 dark:border-white/10 transition-all cursor-pointer group"
                title="Today's queue status"
              >
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-bold">
                  <span>{locale === 'ar' ? 'كشوفات اليوم' : "Today's Visits"}</span>
                  <span className="text-base group-hover:scale-110 transition-transform">⚡</span>
                </div>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {todayAppointments.length}
                </p>
                <span className="text-[10px] text-amber-600 dark:text-amber-300 font-bold group-hover:underline">
                  {todayAppointments.length > 0 ? (locale === 'ar' ? 'متابعة الطابور المباشر ↓' : 'Track live turn ↓') : (locale === 'ar' ? 'لا زيارات اليوم' : 'No visits today')}
                </span>
              </div>

              <div
                onClick={() => router.push(`/${locale}/dashboard?tab=prescriptions`)}
                className="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-gray-200/50 dark:border-white/10 transition-all cursor-pointer group"
                title="View prescriptions"
              >
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-bold">
                  <span>{locale === 'ar' ? 'أكواب وجرعات الدواء' : 'Medication Cups'}</span>
                  <span className="text-base group-hover:scale-110 transition-transform">💊</span>
                </div>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{prescriptions.length}</p>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-300 font-bold group-hover:underline">
                  {locale === 'ar' ? 'جدول الجرعات ←' : '5-Cup Timeline →'}
                </span>
              </div>

              <div
                onClick={() => router.push(`/${locale}/dashboard?tab=doctors`)}
                className="p-3.5 rounded-2xl bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 border border-gray-200/50 dark:border-white/10 transition-all cursor-pointer group"
                title="View doctors"
              >
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-bold">
                  <span>{locale === 'ar' ? 'أطباؤك المعتمدون' : 'Linked Doctors'}</span>
                  <span className="text-base group-hover:scale-110 transition-transform">👨‍⚕️</span>
                </div>
                <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{doctors.length}</p>
                <span className="text-[10px] text-purple-600 dark:text-purple-300 font-bold group-hover:underline">
                  {locale === 'ar' ? 'عيادات الأطباء ←' : 'My clinics →'}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Live Waiting Room Queue & Wait Time Radar */}
          <div id="live-queue-radar">
            {todayAppointments.length > 0 ? (() => {
              const primaryApt = todayAppointments[0]
              const docStatus = liveDoctorData[primaryApt.doctor_id]
              const activeQueueToday = (docStatus?.queue || []).filter(q => q.status !== 'completed' && q.status !== 'cancelled')
              const myIdx = activeQueueToday.findIndex(q => q.id === primaryApt.id)
              let patientsAhead = 0
              if (myIdx >= 0) {
                patientsAhead = myIdx
              } else if (primaryApt.scheduled_time) {
                const aptDate = new Date(primaryApt.scheduled_time).getTime()
                patientsAhead = activeQueueToday.filter(q => q.scheduled_time && new Date(q.scheduled_time).getTime() < aptDate).length
              }
              const myTurnNumber = myIdx >= 0 ? (myIdx + 1) : ((primaryApt.queue_position && primaryApt.queue_position <= (activeQueueToday.length || 1)) ? primaryApt.queue_position : 1)
              const isCallingMeNow = primaryApt.status === 'in_progress'
              const inProgressIdx = activeQueueToday.findIndex(q => q.status === 'in_progress')
              const currentServing = inProgressIdx >= 0 ? (inProgressIdx + 1) : (docStatus?.current_serving_position || (docStatus?.is_in_consultation ? 1 : 0))
              const arrivalTime = parseArrivalTime(primaryApt.notes)
              const isArrived = !!arrivalTime
              const estWaitMins = Math.max(5, patientsAhead * 15)

              const docObj = doctors.find(d => d.id === primaryApt.doctor_id) || allDoctors.find(d => d.id === primaryApt.doctor_id)
              const docPhone = primaryApt.doctor_phone || docObj?.phone_number
              const waUrl = getWhatsAppLink(docPhone, `Hello Dr. ${primaryApt.doctor_name}, this is regarding my appointment at MediLab.`)

              return (
                <div className="bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-emerald-500/10 border-2 border-blue-400/40 dark:border-blue-500/30 rounded-3xl p-6 shadow-lg shadow-blue-500/5 space-y-4">
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-100 dark:border-blue-900/40">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-3.5 w-3.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${docStatus?.is_unavailable ? 'bg-rose-400' : docStatus?.is_in_consultation ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                        <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${docStatus?.is_unavailable ? 'bg-rose-500' : docStatus?.is_in_consultation ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                      </span>
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                          <span>{locale === 'ar' ? 'رادار طابور العيادة المباشر اليوم' : 'Live Clinic Queue Radar'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
                            {locale === 'ar' ? 'موعد اليوم' : 'Visit Today'}
                          </span>
                        </h3>
                        <p className="text-xs text-gray-500">
                          Dr. {primaryApt.doctor_name} • {primaryApt.scheduled_time ? new Date(primaryApt.scheduled_time).toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : 'Today'}
                        </p>
                      </div>
                    </div>

                    {/* Doctor availability badge */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-3 py-1 rounded-xl flex items-center gap-1.5 ${
                        docStatus?.is_unavailable
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : docStatus?.is_in_consultation
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      }`}>
                        <span>{docStatus?.is_unavailable ? '🔴' : docStatus?.is_in_consultation ? '🟡' : '🟢'}</span>
                        <span>
                          {docStatus?.is_unavailable
                            ? (locale === 'ar' ? 'الطبيب في استراحة مؤقتة' : 'Doctor on Break')
                            : docStatus?.is_in_consultation
                              ? (locale === 'ar' ? 'الطبيب مع مريض بالكشف' : 'Doctor with Patient')
                              : (locale === 'ar' ? 'الطبيب متاح ومستعد' : 'Doctor Free & Ready')}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Calling banner if doctor is calling */}
                  {isCallingMeNow && (
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/20 border-2 border-emerald-400 animate-pulse flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">🔔</span>
                        <div>
                          <p className="font-black text-sm uppercase tracking-wide">
                            {locale === 'ar' ? 'الطبيب ينادي عليك الآن!' : 'Doctor is Calling You Now!'}
                          </p>
                          <p className="text-xs text-emerald-100">
                            {locale === 'ar' ? 'تذكرتك حان دورها، يرجى الدخول لغرفة الكشف فوراً.' : 'Your turn is ready! Please proceed directly into the examination room.'}
                          </p>
                        </div>
                      </div>
                      <span className="text-base font-black bg-white text-emerald-700 px-4 py-2 rounded-xl shadow-md">
                        Q{myTurnNumber}
                      </span>
                    </div>
                  )}

                  {/* 4 Metric Radar Gauges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                      <p className="text-[10px] uppercase font-black text-gray-400">
                        {locale === 'ar' ? 'رقم تذكرتك' : 'Your Ticket'}
                      </p>
                      <p className="text-2xl font-black text-blue-600 mt-0.5">Q{myTurnNumber}</p>
                      <span className="text-[10px] text-gray-500 font-bold">{locale === 'ar' ? 'دورك في العيادة' : 'Your place'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                      <p className="text-[10px] uppercase font-black text-gray-400">
                        {locale === 'ar' ? 'الكشف الحالي' : 'Now Serving'}
                      </p>
                      <p className="text-2xl font-black text-gray-800 dark:text-gray-100 mt-0.5">
                        {isCallingMeNow ? `Q${myTurnNumber}` : (currentServing > 0 ? `Q${currentServing}` : (docStatus?.is_in_consultation ? 'In Room' : 'Ready'))}
                      </p>
                      <span className="text-[10px] text-gray-500 font-bold">{locale === 'ar' ? 'بالغرفة حالياً' : 'In room'}</span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                      <p className="text-[10px] uppercase font-black text-gray-400">
                        {locale === 'ar' ? 'المرضى قبلك' : 'Patients Ahead'}
                      </p>
                      <p className="text-2xl font-black text-purple-600 mt-0.5">{patientsAhead}</p>
                      <span className="text-[10px] text-purple-500 font-bold">
                        {patientsAhead === 0 ? (locale === 'ar' ? '⚡ أنت التالي فوراً' : '⚡ Next in line!') : (locale === 'ar' ? 'في صالة الانتظار' : 'Waiting outside')}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                      <p className="text-[10px] uppercase font-black text-gray-400">
                        {locale === 'ar' ? 'الوقت المتوقع' : 'Estimated Wait'}
                      </p>
                      <p className="text-2xl font-black text-emerald-600 mt-0.5">~{estWaitMins}m</p>
                      <span className="text-[10px] text-emerald-500 font-bold">{locale === 'ar' ? 'دقائق انتظار تقريبية' : 'Estimated wait'}</span>
                    </div>
                  </div>

                  {/* Arrival check-in action */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="w-full sm:w-auto flex-1">
                      {!isArrived ? (
                        <button
                          type="button"
                          disabled={arrivingId === primaryApt.id}
                          onClick={() => handleMarkArrival(primaryApt.id)}
                          className="w-full py-2.5 px-5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                        >
                          <span>📍</span>
                          <span>{arrivingId === primaryApt.id ? (locale === 'ar' ? 'جاري إخطار الاستقبال...' : 'Notifying Reception...') : (locale === 'ar' ? 'وصلت إلى العيادة (إخطار الاستقبال)' : 'I Have Arrived at Clinic')}</span>
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black">
                            <span className="text-base">✅</span>
                            <span>{locale === 'ar' ? 'تم تسجيل حضورك بالعيادة' : 'Checked In at Clinic'} ({arrivalTime})</span>
                          </div>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                            {locale === 'ar' ? 'تم إخطار الطبيب' : 'Doctor Notified'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                          <span className="font-black">WhatsApp Dr.</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingDoctorId(primaryApt.doctor_id)}
                        className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-4 py-2.5 rounded-xl border border-blue-200 dark:border-blue-900/40 transition-colors"
                      >
                        {locale === 'ar' ? 'الملف الشخصي' : 'Doctor Profile'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })() : (
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl shrink-0">
                    🗓️
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-gray-900 dark:text-white">
                      {locale === 'ar' ? 'لا توجد كشوفات بالعيادة مجدولة لليوم' : 'No Clinic Consultations Today'}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {activeAppointments.length > 0 && activeAppointments[0].scheduled_time
                        ? (locale === 'ar'
                            ? `موعد كشفك القادم مع د. ${activeAppointments[0].doctor_name} في ${new Date(activeAppointments[0].scheduled_time).toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`
                            : `Your next upcoming visit is with Dr. ${activeAppointments[0].doctor_name} on ${new Date(activeAppointments[0].scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`)
                        : (locale === 'ar' ? 'جميع مواعيدك القادمة ستظهر هنا مع وقت الانتظار المباشر ورقم التذكرة.' : 'Upcoming visits and real-time waiting queue radar will appear here.')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditAppointmentId(null); setShowBooking(true); }}
                  className="px-4 py-2 rounded-xl text-xs font-black bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-900/40 transition-colors whitespace-nowrap"
                >
                  {locale === 'ar' ? '+ حجز موعد كشف' : '+ Book an Appointment'}
                </button>
              </div>
            )}
          </div>

          {/* Section: Active Bookings & Consultations (The Cards from My Bookings) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📅</span>
                  <span>{locale === 'ar' ? 'حجوزاتك الحالية ومتابعة الطابور' : 'Active Bookings & Live Queue Watch'}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {locale === 'ar' ? 'راقب مدة الانتظار المتوقعة، وقم بتأكيد الدفع أو تعديل الموعد' : 'Keep an eye on how long you have to wait to see the doctor, pay or reschedule'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/${locale}/dashboard?tab=bookings`)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>{locale === 'ar' ? 'عرض الكل والتقويم' : 'View All & Calendar'}</span>
                <span>→</span>
              </button>
            </div>

            {activeAppointments.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
                <div className="text-4xl mb-3">📅</div>
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm">
                  {locale === 'ar' ? 'لا توجد حجوزات نشطة حالياً' : 'No active bookings right now'}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {locale === 'ar' ? 'يمكنك حجز موعد جديد مع طبيبك المفضل بسهولة.' : 'Book a visit to secure your slot with your preferred doctor.'}
                </p>
                <button
                  type="button"
                  onClick={() => { setEditAppointmentId(null); setShowBooking(true); }}
                  className="mt-4 px-5 py-2.5 bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:brightness-110 text-white rounded-xl text-xs font-black shadow-md transition-all"
                >
                  {locale === 'ar' ? '+ حجز موعد جديد' : '+ Book New Visit'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeAppointments.map(apt => renderAppointmentCard(apt))}
              </div>
            )}
          </div>

          {/* Section: Today's 5 Medication Cups Glance */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>💊</span>
                  <span>{locale === 'ar' ? 'جدول أكواب وجرعات أدوية اليوم (5 كؤوس)' : "Today's Medication Cups (5 Daily Cups)"}</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {locale === 'ar' ? 'تقسيم مواعيد تناول الأدوية على مدار اليوم لضمان الالتزام الدوائي' : 'Visual dosage timeline divided across your day to ensure medication adherence'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/${locale}/dashboard?tab=prescriptions`)}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <span>{locale === 'ar' ? 'فتح جدول الأكواب الكامل والتسجيل' : 'Open Full 5-Cup Timeline'}</span>
                <span>→</span>
              </button>
            </div>

            {/* 5 Cups Visual Row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { slot: 'morning', titleEn: 'Morning Cup', titleAr: 'كوب الصباح', time: '08:00 AM', icon: '🌅', color: 'from-amber-400 to-orange-500' },
                { slot: 'midday', titleEn: 'Midday Cup', titleAr: 'كوب الظهيرة', time: '01:00 PM', icon: '☀️', color: 'from-cyan-400 to-teal-500' },
                { slot: 'evening', titleEn: 'Evening Cup', titleAr: 'كوب المساء', time: '05:30 PM', icon: '🌇', color: 'from-orange-500 to-amber-500' },
                { slot: 'night', titleEn: 'Night Cup', titleAr: 'كوب الليل', time: '08:30 PM', icon: '🌆', color: 'from-indigo-400 to-purple-600' },
                { slot: 'bedtime', titleEn: 'Bedtime Cup', titleAr: 'قبل النوم', time: '10:30 PM', icon: '🌙', color: 'from-purple-500 to-slate-700' },
              ].map((cup) => (
                <div
                  key={cup.slot}
                  onClick={() => router.push(`/${locale}/dashboard?tab=prescriptions`)}
                  className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-600 cursor-pointer transition-all text-center group"
                >
                  <div className={`w-10 h-10 mx-auto rounded-xl bg-gradient-to-br ${cup.color} text-white flex items-center justify-center text-lg shadow-sm group-hover:scale-110 transition-transform`}>
                    {cup.icon}
                  </div>
                  <p className="text-xs font-black text-gray-800 dark:text-gray-200 mt-2">
                    {locale === 'ar' ? cup.titleAr : cup.titleEn}
                  </p>
                  <p className="text-[10px] text-gray-400 font-bold">{cup.time}</p>
                </div>
              ))}
            </div>

            {/* Quick 1-Click Pill Check-in Checklist */}
            {prescriptions.length > 0 && prescriptions[0].medications?.length > 0 && (
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span>⚡</span>
                    <span>{locale === 'ar' ? 'تسجيل أدوية اليوم بنقرة واحدة:' : "Today's Quick Medication Check-in:"}</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    {locale === 'ar' ? 'يتم حفظ الجرعة فوراً وتحديث التزامك' : 'Instantly logged to adherence history'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {prescriptions[0].medications.slice(0, 6).map((med: any, mIdx: number) => {
                    const key = `${med.name}_morning`
                    const isTaken = !!overviewTakenMeds[key] || !!overviewTakenMeds[`${med.name}_dose`]
                    return (
                      <div
                        key={mIdx}
                        className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          isTaken
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                            : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 text-gray-900 dark:text-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-black text-xs truncate">{med.name}</p>
                          <p className="text-[10px] text-gray-500 truncate">{med.dosage || '1 dose'}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOverviewTakeDose(med.name, 'morning', prescriptions[0].id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all ${
                            isTaken
                              ? 'bg-emerald-500 text-white shadow-sm'
                              : 'bg-white dark:bg-gray-700 hover:bg-emerald-600 hover:text-white text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <span>✓</span>
                          <span>{isTaken ? (locale === 'ar' ? 'تم التناول' : 'Taken') : (locale === 'ar' ? 'تناول' : 'Take')}</span>
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section: Linked Doctors Quick Grid */}
          {doctors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <span>👨‍⚕️</span>
                  <span>{locale === 'ar' ? 'أطباؤك المعتمدون' : 'My Attending Doctors'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => router.push(`/${locale}/dashboard?tab=doctors`)}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {locale === 'ar' ? 'عرض جميع الأطباء →' : 'View All Doctors →'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {doctors.slice(0, 3).map(doc => {
                  return (
                    <div key={doc.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-black flex items-center justify-center text-sm shrink-0">
                          {doc.full_name ? doc.full_name[0] : 'D'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-black text-xs text-gray-900 dark:text-white truncate">
                            Dr. {doc.full_name}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">{doc.specialization || 'General Practitioner'}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDoctor(doc)
                          setEditAppointmentId(null)
                          setShowBooking(true)
                        }}
                        className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 text-blue-600 dark:text-blue-300 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
                      >
                        {locale === 'ar' ? 'حجز' : 'Book'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section: Pending Diagnostic Lab & Radiology Tests */}
          {patientLabOrders.length > 0 && (
            <div className="bg-gradient-to-r from-cyan-500/10 via-teal-500/10 to-blue-500/10 border-2 border-cyan-400/30 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 text-lg">🧪</span>
                  <div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                      <span>{locale === 'ar' ? 'فحوصاتك الطبية والأشعة المطلوبة' : 'Required Lab Tests & Radiology Scans'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 font-bold uppercase">
                        {patientLabOrders.length} {locale === 'ar' ? 'فحص' : 'Tests'}
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {locale === 'ar' 
                        ? 'حجز مباشر عبر واتساب لمعامل المختبر، البرج، ألفا سكان، وكايرو سكان مع سحب عينات منزلي'
                        : 'Book tests via WhatsApp with Al Mokhtabar, Al Borg, Alfa Scan & Cairo Scan with home sample visits'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPatientViewingLab(patientLabOrders[0])}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <span>🏥</span>
                  <span>{locale === 'ar' ? 'دليل المعامل المعتمدة' : 'Accredited Labs Guide'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {patientLabOrders.map((lo, idx) => {
                  const partner = PARTNER_LABS.find(p => p.id === lo.preferred_lab) || PARTNER_LABS[0]
                  return (
                    <div
                      key={idx}
                      className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-black text-sm text-gray-900 dark:text-white">{lo.test_name}</h4>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300 uppercase">
                              {lo.category}
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              lo.status === 'completed'
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                : lo.status === 'sample_collected'
                                  ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                                  : lo.status === 'scheduled'
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            }`}>
                              {lo.status === 'completed'
                                ? (locale === 'ar' ? '✅ النتائج جاهزة' : '✅ Results Ready')
                                : lo.status === 'sample_collected'
                                  ? (locale === 'ar' ? '🧪 تم سحب العينة' : '🧪 Sample Collected')
                                  : lo.status === 'scheduled'
                                    ? (locale === 'ar' ? '📅 تم تحديد الموعد' : '📅 Scheduled')
                                    : (locale === 'ar' ? '⏳ بانتظار الإجراء' : '⏳ Pending')}
                            </span>
                          </div>
                        </div>
                        {lo.instructions && (
                          <p className="text-xs text-gray-600 dark:text-gray-300 font-medium" dir="auto">
                            <span className="font-bold text-gray-400">{locale === 'ar' ? 'تعليمات الفحص: ' : 'Prep: '}</span>
                            {lo.instructions}
                          </p>
                        )}
                        {lo.chosen_facility_name ? (
                          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-400/20 text-xs">
                            <p className="font-black text-indigo-700 dark:text-indigo-300">
                              📍 {lo.chosen_facility_name}
                            </p>
                            {lo.reference_number && (
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                Ref #: {lo.reference_number}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-cyan-700 dark:text-cyan-400">
                            {locale === 'ar' ? 'المعمل المقترح: ' : 'Recommended Lab: '}
                            <strong>{partner.nameEn}</strong> ({partner.hotline})
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button
                          type="button"
                          onClick={() => setPatientViewingLab(lo)}
                          className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <span>💬</span>
                          <span>{locale === 'ar' ? 'حجز المعمل عبر واتساب' : 'Book via WhatsApp'}</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Section: Obour City Medical Directory Banner (when no pending labs) */}
          {patientLabOrders.length === 0 && (
            <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-teal-900/30 border border-blue-500/30 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-2xl shrink-0 border border-cyan-400/30">
                  🏙️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-cyan-400">
                      {locale === 'ar' ? 'موسوعة ودليل مدينة العبور الطبية' : 'Obour City Medical Wikipedia'}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold">
                      {locale === 'ar' ? 'معامل وأشعة وصيدليات 24 ساعة' : 'Labs, Scans & 24/7 Pharmacies'}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-white mt-0.5">
                    {locale === 'ar'
                      ? 'دليل جغرافي شامل وموثق لمعامل التحاليل، مراكز الأشعة، والمستشفيات في العبور'
                      : 'Comprehensive verified directory of labs, scans, and emergency hospitals in Obour City'}
                  </h4>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/${locale}/dashboard?tab=obour_wiki`)}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-black rounded-xl text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 shrink-0"
              >
                <span>🔍</span>
                <span>{locale === 'ar' ? 'تصفح الدليل والموسوعة' : 'Explore Obour Directory'}</span>
              </button>
            </div>
          )}

          {/* Section: Recent Prescription Highlight */}
          {prescriptions.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl shrink-0">
                  📄
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                      {locale === 'ar' ? 'أحدث روشتة طبية' : 'Latest Medical Prescription'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(prescriptions[0].created_at).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white mt-0.5">
                    {prescriptions[0].diagnosis || 'General Consultation'} • Dr. {prescriptions[0].doctor_name}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {(prescriptions[0].medications || []).length} {locale === 'ar' ? 'أدوية موصوفة' : 'medications prescribed'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setViewingPrescription(prescriptions[0])}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60 rounded-xl text-xs font-black transition-colors"
                >
                  {locale === 'ar' ? 'عرض الروشتة و PDF' : 'View Rx & PDF'}
                </button>

                <button
                  type="button"
                  onClick={() => setForwardingRx(prescriptions[0])}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-110 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                >
                  <span>📦</span>
                  <span>{locale === 'ar' ? 'طلب من الصيدلية' : 'Order via Pharmacy'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bookings View */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          {/* Phone Push Notifications Permission & Status Banner */}
          <NotificationPermissionBanner />

          <div className="flex flex-wrap gap-4 justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-3xl border border-gray-100 dark:border-gray-800">
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
               <button onClick={() => setViewMode('cards')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'cards' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>{tp('cards') || 'Cards'}</button>
               <button onClick={() => setViewMode('calendar')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>{tp('calendar') || 'Calendar'}</button>
            </div>
            <button
              onClick={() => { setEditAppointmentId(null); setShowBooking(true); }}
              className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm"
            >
              {tp('book_new_visit') || '+ Book New Visit'}
            </button>
          </div>

          {activeAppointments.length === 0 ? (
             <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
              <div className="text-5xl mb-4">📅</div>
              <h3 className="text-xl font-bold">{tp('no_active_bookings') || 'No Active Bookings'}</h3>
              <p className="text-gray-500 mt-2">{tp('no_active_desc') || "You don't have any upcoming visits booked."}</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeAppointments.map(apt => renderAppointmentCard(apt))}            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm overflow-x-auto">
               <div className="min-w-[800px]">
                 <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-6 px-2">Next 30 Days Availability</h4>
                 {/* Mini Calendar View Grid */}
                 <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const d = new Date()
                      d.setDate(d.getDate() + i)
                      const dateStr = d.toISOString().split('T')[0]
                      const dayApts = activeAppointments.filter(a => a.scheduled_time?.startsWith(dateStr))
                      const isToday = i === 0;
                      
                      return (
                        <div key={i} className={`flex flex-col gap-1 p-2 rounded-2xl border ${isToday ? 'border-blue-200 bg-blue-50/30' : 'border-gray-50 dark:border-gray-800'}`}>
                           <div className="text-center pb-1 border-b border-gray-100 dark:border-gray-800">
                             <p className="text-[10px] font-bold uppercase text-gray-400">{d.toLocaleDateString('en-US', { weekday: 'short'})}</p>
                             <p className={`text-sm font-black ${isToday ? 'text-blue-600' : ''}`}>{d.getDate()}</p>
                           </div>
                           <div className="space-y-1 max-h-[100px] overflow-y-auto custom-scrollbar">
                              {dayApts.length === 0 ? (
                                <div className="text-[10px] text-center text-gray-300 italic py-2">-</div>
                              ) : dayApts.map(apt => {
                                const isPending = apt.status === 'waiting'
                                return (
                                  <div key={apt.id} className={`p-1 rounded-lg text-[9px] border ${isPending ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10' : 'bg-green-50 border-green-200 dark:bg-green-900/10'}`}>
                                    <p className="font-bold">{new Date(apt.scheduled_time!).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', hour12: true})}</p>
                                    <p className="truncate opacity-75">Dr. {apt.doctor_name.split(' ')[0]}</p>
                                  </div>
                                )
                              })}
                           </div>
                        </div>
                      )
                    })}
                 </div>
               </div>
            </div>
          )}
        </div>
      )}



      {/* My Doctors Tab */}
      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 px-2">Linked Clinics</h3>
            <button onClick={() => setShowAddDoctor(true)} className="text-sm font-black text-white bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:bg-blue-700 px-5 py-2 rounded-xl transition-colors shadow-lg shadow-blue-500/20">+ Add Doctor</button>
          </div>
          
          {doctors.length === 0 ? (
             <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="text-5xl mb-4">👨‍⚕️</div>
              <h3 className="text-xl font-bold">{locale === 'ar' ? 'لا يوجد أطباء مضافون' : 'No Doctors Yet'}</h3>
              <p className="text-gray-500 mt-2 mb-6">{locale === 'ar' ? 'تواصل مع طبيبك المفضل لمتابعة حالته وحجز المواعيد ومعرفة دورك مباشرة.' : 'Connect with your doctor to track their live status, view your turn, and book appointments instantly.'}</p>
              <button onClick={() => setShowAddDoctor(true)} className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-95 transition-all shadow-lg shadow-blue-500/20 text-white px-6 py-3 rounded-xl font-bold">{locale === 'ar' ? 'البحث عن طبيب' : 'Find a Doctor'}</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {doctors.map(doc => {
                const liveStatus = liveDoctorData[doc.id];
                const isUnavailable = liveStatus?.is_unavailable || doc.availability_status === 'unavailable';
                const isInConsultation = liveStatus?.is_in_consultation || doc.availability_status === 'busy';

                // 1. Doctor status config
                const statusInfo = isUnavailable ? {
                  label: locale === 'ar' ? 'غير متاح / استراحة' : 'On Break / Unavailable',
                  badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900',
                  dot: 'bg-rose-500',
                } : isInConsultation ? {
                  label: locale === 'ar' ? 'مع مريض حالياً' : 'With a Patient',
                  badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900',
                  dot: 'bg-amber-500 animate-pulse',
                } : {
                  label: locale === 'ar' ? 'متاح وجاهز' : 'Free & Ready',
                  badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
                  dot: 'bg-emerald-500',
                };

                // 2. Active clinic appointment with this doctor today
                const activeApptToday = appointments.find(a => 
                  a.doctor_id === doc.id && 
                  isSameLocalDate(a.scheduled_time) && 
                  a.appointment_type !== 'home_visit' &&
                  (a.status === 'scheduled' || a.status === 'in_progress')
                );

                // 3. Upcoming appointment on future date
                const upcomingAppt = !activeApptToday ? appointments.find(a => 
                  a.doctor_id === doc.id && 
                  a.status !== 'cancelled' && 
                  a.status !== 'completed' &&
                  a.scheduled_time && new Date(a.scheduled_time).getTime() > Date.now()
                ) : null;

                // 4. Calculate Turn and Estimated Arrival for today
                let turnData = null;
                if (activeApptToday) {
                  const queue = liveStatus?.queue || [];
                  const myQueueIdx = queue.findIndex(q => q.id === activeApptToday.id);
                  let patientsAhead = 0;
                  if (myQueueIdx >= 0) {
                    patientsAhead = myQueueIdx;
                  } else if (activeApptToday.scheduled_time) {
                    const myTime = new Date(activeApptToday.scheduled_time).getTime();
                    patientsAhead = queue.filter(q => q.scheduled_time && new Date(q.scheduled_time).getTime() < myTime).length;
                  }

                  const myTurnNumber = myQueueIdx >= 0 ? (myQueueIdx + 1) : ((activeApptToday.queue_position && activeApptToday.queue_position <= (queue.length || 1)) ? activeApptToday.queue_position : 1);
                  const isCallingNow = activeApptToday.status === 'in_progress';
                  const estWaitMins = Math.max(5, patientsAhead * 15);
                  const expectedTime = new Date(Date.now() + estWaitMins * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
                  
                  // Arrival recommendation: buffer 10-15 mins early
                  const bufferMins = Math.max(0, estWaitMins - 15);
                  const recommendedArrival = bufferMins > 0 
                    ? new Date(Date.now() + bufferMins * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
                    : (locale === 'ar' ? 'الآن فوراً' : 'Immediately');

                  turnData = {
                    myTurnNumber,
                    isCallingNow,
                    patientsAhead,
                    estWaitMins,
                    expectedTime,
                    recommendedArrival
                  };
                }

                return (
                  <div key={doc.id} className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 flex flex-col justify-between group relative">
                    <div>
                      {/* Card Header: Avatar, Name, Specialization & Remove Button */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center text-2xl font-black shrink-0 shadow-lg shadow-blue-500/20 overflow-hidden border border-gray-100 dark:border-gray-800">
                            {doc.avatar_url ? (
                              <img src={doc.avatar_url} alt={doc.full_name} className="w-full h-full object-cover" />
                            ) : (
                              doc.full_name?.charAt(0) || 'D'
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-black text-lg text-gray-900 dark:text-white truncate">
                              Dr. {doc.full_name}
                            </h4>
                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 truncate">
                              {doc.specialization || 'General Practitioner'}
                            </p>
                            {doc.clinic_location && (
                              <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                📍 {doc.clinic_location}
                              </p>
                            )}
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleRemoveDoctor(doc.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1.5 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                          title="Remove from My Doctors"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Live Doctor Status Bar */}
                      <div className="mb-4">
                        <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between ${statusInfo.badge}`}>
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`}></span>
                            <span>{statusInfo.label}</span>
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                            {liveStatus?.is_in_consultation ? (locale === 'ar' ? 'جلسة كشف' : 'Active') : 'Live'}
                          </span>
                        </div>
                      </div>

                      {/* My Turn & Estimated Wait Tracker (The User's Core Need!) */}
                      {turnData ? (
                        <div className={`mb-5 p-4 rounded-2xl border transition-all ${
                          turnData.isCallingNow
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 border-emerald-400 animate-pulse'
                            : 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/50'
                        }`}>
                          {turnData.isCallingNow ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                                  <span>🔔</span> {locale === 'ar' ? 'حان دورك الآن!' : "It's Your Turn Now!"}
                                </span>
                                <span className="bg-white text-emerald-800 font-black text-xs px-2.5 py-0.5 rounded-lg shadow-sm">
                                  Q{turnData.myTurnNumber}
                                </span>
                              </div>
                              <p className="text-xs text-emerald-100 font-medium">
                                {locale === 'ar' ? 'يرجى التوجه لغرفة الكشف فوراً.' : 'Doctor is waiting for you in the examination room.'}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                  {locale === 'ar' ? 'طابور كشفك اليوم' : "Today's Visit Turn"}
                                </span>
                                <span className="bg-blue-600 text-white font-black text-xs px-2.5 py-0.5 rounded-lg shadow-sm">
                                  Q{turnData.myTurnNumber}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                  <p className="text-[10px] uppercase font-bold text-gray-400">
                                    {locale === 'ar' ? 'مرضى قبلك' : 'Ahead'}
                                  </p>
                                  <p className="text-base font-black text-gray-800 dark:text-white">
                                    {turnData.patientsAhead} {locale === 'ar' ? 'مرضى' : 'in line'}
                                  </p>
                                </div>
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/40">
                                  <p className="text-[10px] uppercase font-bold text-gray-400">
                                    {locale === 'ar' ? 'الوقت المتوقع' : 'Expected Time'}
                                  </p>
                                  <p className="text-base font-black text-blue-600 dark:text-blue-400">
                                    {turnData.expectedTime}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-1 border-t border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between text-[11px] font-bold text-gray-600 dark:text-gray-300">
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <span>🚗</span> {locale === 'ar' ? `الموعد المثالي لوصولك: ${turnData.recommendedArrival}` : `Arrive by: ${turnData.recommendedArrival}`}
                                </span>
                                <span>⏱️ ~{turnData.estWaitMins}m</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : upcomingAppt ? (
                        <div className="mb-5 p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-indigo-700 dark:text-indigo-300">
                              📅 {locale === 'ar' ? 'موعدك القادم' : 'Upcoming Visit'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-200/60 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 uppercase">
                              {(upcomingAppt.appointment_type || 'clinic').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="font-bold text-gray-800 dark:text-gray-200">
                            {new Date(upcomingAppt.scheduled_time!).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {locale === 'ar' ? 'سيتم تفعيل متابعة الطابور المباشر صباح يوم الكشف.' : 'Live queue tracking activates on the morning of your visit.'}
                          </p>
                        </div>
                      ) : (
                        <div className="mb-5 p-3 rounded-2xl bg-gradient-to-r from-blue-50/80 to-teal-50/80 dark:from-blue-950/30 dark:to-teal-950/30 border border-blue-100 dark:border-blue-900/40 text-xs flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold uppercase text-gray-400 block">
                              {locale === 'ar' ? 'وقت الانتظار المتوقع الآن' : 'Clinic Wait Time Now'}
                            </span>
                            <span className="font-black text-blue-600 dark:text-blue-400 text-sm">
                              {isUnavailable
                                ? (locale === 'ar' ? '🔴 الطبيب باستراحة' : '🔴 On Break')
                                : (liveStatus?.queue?.length || 0) === 0 && !isInConsultation
                                  ? (locale === 'ar' ? '⚡ فوري (~0 دقيقة) - متاح' : '⚡ Immediate (~0 mins)')
                                  : (locale === 'ar' 
                                      ? `⏱️ ~${Math.max(15, (liveStatus?.queue?.length || 1) * 15)} دقيقة (${liveStatus?.queue?.length || 1} بالانتظار)` 
                                      : `⏱️ ~${Math.max(15, (liveStatus?.queue?.length || 1) * 15)} mins (${liveStatus?.queue?.length || 1} in queue)`)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-gray-400 block">
                              {locale === 'ar' ? 'قيمة الكشف' : 'Consultation Fee'}
                            </span>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              {doc.fees_normal || 350} EGP
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Action Buttons: Book Visit, Profile & Reviews, WhatsApp */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDoctor(doc);
                          setEditAppointmentId(null);
                          setShowBooking(true);
                        }}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-95 text-white font-black text-xs shadow-md shadow-blue-500/20 transition-all text-center"
                      >
                        {locale === 'ar' ? 'حجز موعد' : 'Book Visit'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setViewingDoctorId(doc.id)}
                        className="py-2.5 px-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors flex items-center justify-center gap-1"
                        title="View profile, stats, rush hours and patient reviews"
                      >
                        <span>ℹ️</span>
                        <span>{locale === 'ar' ? 'البروفايل' : 'Profile'}</span>
                      </button>

                      {(() => {
                        const waUrl = getWhatsAppLink(doc.phone_number, `Hello Dr. ${doc.full_name}, I am your patient from MediLab.`);
                        if (!waUrl) return null;
                        return (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2.5 px-3 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white transition-all flex items-center justify-center shadow-sm"
                            title="Chat with doctor on WhatsApp"
                          >
                            <WhatsAppIcon className="w-4 h-4 text-white" />
                          </a>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Add Doctor Modal */}
          {showAddDoctor && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black">Find a Doctor</h3>
                   <button onClick={() => setShowAddDoctor(false)} className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
                 </div>
                 <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                   {searching ? (
                     <div className="py-12 flex justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
                   ) : allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).map(doc => (
                     <div key={doc.id} className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50">
                       <div 
                         className="cursor-pointer group flex-1 flex items-center gap-3 min-w-0"
                         onClick={() => setViewingDoctorId(doc.id)}
                       >
                         <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center font-black shrink-0 overflow-hidden shadow-sm">
                           {doc.avatar_url ? (
                             <img src={doc.avatar_url} alt={doc.full_name} className="w-full h-full object-cover" />
                           ) : (
                             doc.full_name?.charAt(0) || 'D'
                           )}
                         </div>
                         <div className="min-w-0">
                           <p className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors truncate">
                             Dr. {doc.full_name}
                           </p>
                           <p className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate">{doc.specialization || 'General Practitioner'}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         <button
                           type="button"
                           onClick={() => setViewingDoctorId(doc.id)}
                           className="px-3 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800 transition-colors"
                         >
                           Profile & Stats
                         </button>
                         <button 
                           disabled={addingDoctor !== null}
                           onClick={() => handleAddDoctor(doc.id)}
                           className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-90 text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/20 disabled:opacity-50"
                         >
                           {addingDoctor === doc.id ? '...' : '+ Add'}
                         </button>
                       </div>
                     </div>
                   ))}
                   {!searching && allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).length === 0 && (
                     <div className="py-12 text-center text-gray-400">
                       <p className="text-3xl mb-2">🔍</p>
                       <p className="text-sm font-medium pr-2">No new doctors found.</p>
                     </div>
                   )}
                 </div>
               </div>
             </div>
          )}
        </div>
      )}

      {/* Certifications Tab */}
      {activeTab === 'certs' && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold">My Medical Records & Certifications</h3>
            <p className="text-sm text-gray-500">Medical certificates and sick leaves issued to you by your doctor.</p>
          </div>
          {loadingCerts ? (
            <div className="py-20 text-center animate-pulse text-gray-400">Loading certificates...</div>
          ) : certs.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="text-5xl">📄</div>
              <p className="text-gray-400 font-medium">No certificates yet.</p>
              <p className="text-sm text-gray-300">Certificates issued by your doctor will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {certs.map(cert => (
                <div key={cert.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-600 flex items-center justify-center shrink-0 text-2xl shadow-sm">📋</div>
                    <div>
                      <p className="font-bold text-lg">{cert.title}</p>
                      {cert.description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{cert.description}</p>}
                      <div className="mt-4 flex gap-4 text-xs font-bold text-gray-400">
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">👨‍⚕️ Dr. {cert.doctor_name}</span>
                        <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">📅 {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prescriptions Tab: 5 Daily Cups Timeline & Archives */}
      {activeTab === 'prescriptions' && (
        <PrescriptionCupsTimeline
          prescriptions={prescriptions}
          loading={loadingPrescriptions}
          patientName={patientName}
          patientId={patientUserId}
          onViewPrescription={(rx) => setViewingPrescription(rx)}
        />
      )}

      {/* Family Members Tab */}
      {activeTab === 'family' && (
        <FamilyMembersTab
          onBookForMember={() => {
            setSelectedDoctor(null)
            setEditAppointmentId(null)
            setShowBooking(true)
          }}
        />
      )}

      {/* Visit History Tab */}
      {activeTab === 'history' && (
        <PatientHistoryTab patientName={patientName} />
      )}

      {/* Obour City Medical Directory & Wikipedia Tab */}
      {activeTab === 'obour_wiki' && (
        <div className="space-y-6">
          <ObourMedicalWiki
            onSelectFacilityForTest={(facility) => {
              if (patientLabOrders.length > 0) {
                setPatientViewingLab(patientLabOrders[0])
              } else {
                setPatientViewingLab({
                  id: 'direct_' + Date.now(),
                  test_name: `فحص طبي / تحليل في ${facility.nameAr}`,
                  category: facility.category === 'radiology' ? 'radiology' : 'blood',
                  ordered_at: new Date().toISOString(),
                  priority: 'routine',
                  preferred_lab: 'obour_partner',
                  instructions: `زيارة إلى ${facility.nameAr} - ${facility.district}`
                })
              }
            }}
          />
        </div>
      )}

      {/* Booking Modal */}
      {showBooking && <BookingModal 
        onClose={() => { setShowBooking(false); setEditAppointmentId(null); }} 
        onSuccess={() => window.location.reload()} 
        initialDoctor={selectedDoctor ? { id: selectedDoctor.id, full_name: selectedDoctor.full_name } as any : undefined}
        editAppointmentId={editAppointmentId}
      />}

      {viewingPrescription && (
        <PrescriptionViewerModal
          prescription={viewingPrescription}
          patientName={patientName}
          onClose={() => setViewingPrescription(null)}
        />
      )}

      {viewingDoctorId && (
        <DoctorProfileModal
          doctorId={viewingDoctorId}
          onClose={() => setViewingDoctorId(null)}
          isLinked={doctors.some(d => d.id === viewingDoctorId)}
          onAddDoctor={handleAddDoctor}
          onBook={(doc) => {
            setSelectedDoctor(doc);
            setEditAppointmentId(null);
            setShowBooking(true);
          }}
        />
      )}

      {/* Pharmacy Partner Integration Modal */}
      {forwardingRx && (
        <PharmacyForwardModal
          isOpen={!!forwardingRx}
          onClose={() => setForwardingRx(null)}
          prescription={forwardingRx}
          patientName={patientName}
        />
      )}

      {/* CSAT Doctor Review Modal */}
      {csatModalApt && (
        <DoctorReviewModal
          doctorId={csatModalApt.doctor_id}
          doctorName={csatModalApt.doctor_name}
          appointmentId={csatModalApt.id}
          onClose={() => setCsatModalApt(null)}
          onSuccess={() => {
            setCsatModalApt(null)
            setCsatSubmitted(true)
            if (pendingCsatApt?.id === csatModalApt.id) {
              setPendingCsatApt(null)
            }
          }}
        />
      )}

      {/* Lab & Radiology Partner Modal */}
      {patientViewingLab && (
        <LabRadiologyModal
          order={patientViewingLab}
          patientName={patientName}
          onClose={() => setPatientViewingLab(null)}
          onUpdateCoordination={handlePatientLabCoordinationUpdate}
        />
      )}
    </div>
  )
}
