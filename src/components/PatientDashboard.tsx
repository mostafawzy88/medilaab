'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import BookingModal from './BookingModal'
import PrescriptionViewerModal from './PrescriptionViewerModal'
import DoctorProfileModal from './DoctorProfileModal'

type AppointmentProps = {
  id: string
  doctor_id: string
  queue_position: number
  fees: number
  doctor_name: string
  instapay_address: string | null
  payment_status?: string
  appointment_type?: string
  status?: string
  scheduled_time?: string
  notes?: string | null
  rejection_reason?: string | null
  reviewer_name?: string | null
}

type DoctorInfo = {
  id: string
  full_name: string
  specialization: string | null
  clinic_location: string | null
  working_hours: any
  phone_number: string | null
  bio?: string | null
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
  const [appointments, setAppointments] = useState(initialAppointments)
  const [showBooking, setShowBooking] = useState(false)
  const [editAppointmentId, setEditAppointmentId] = useState<string | null>(null)
  const [prescriptions, setPrescriptions] = useState<any[]>([])
  const [loadingPrescriptions, setLoadingPrescriptions] = useState(false)
  const [viewingPrescription, setViewingPrescription] = useState<any | null>(null)
  const [patientName, setPatientName] = useState('Patient')
  
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'bookings'

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
      const { data } = await supabase.from('profiles').select('id, full_name, specialization, clinic_location, working_hours, phone_number').eq('role', 'doctor').eq('is_authorized', true)
      if (data) setAllDoctors(data)
      setSearching(false)
    }
    fetchAllDocs()
  }, [showAddDoctor])

  // Fetch live doctor status & relative queue positions
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayApts = appointments.filter(a => a.scheduled_time?.startsWith(todayStr) && (a.status === 'scheduled' || a.status === 'in_progress'));
    if (todayApts.length === 0) return;

    const supabase = createClient();
    const distinctDoctorIds = Array.from(new Set(todayApts.map(a => a.doctor_id)));

    const fetchLiveStatus = async () => {
      for (const docId of distinctDoctorIds) {
        try {
          // 1. Try secure RPC
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_doctor_live_queue', { p_doctor_id: docId });
          if (!rpcError && rpcData) {
            setLiveDoctorData(prev => ({ ...prev, [docId]: rpcData as LiveDoctorStatus }));
          } else {
            // 2. Fallback: query appointments where possible
            const { data: qData } = await supabase
              .from('appointments')
              .select('id, queue_position, status, scheduled_time, notes')
              .eq('doctor_id', docId)
              .neq('appointment_type', 'home_visit')
              .in('status', ['scheduled', 'in_progress'])
              .gte('scheduled_time', todayStr + 'T00:00:00');

            if (qData) {
              const inProgress = qData.find((a: any) => a.status === 'in_progress');
              setLiveDoctorData(prev => ({
                ...prev,
                [docId]: {
                  is_in_consultation: !!inProgress,
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
  }, [appointments]);

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
        return new Date(match[1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    if (!confirm('Are you sure you want to cancel this pending request?')) return;
    const supabase = createClient()
    const { error } = await supabase.from('appointments').delete().eq('id', apptId)
    if (error) {
      alert("Error deleting request: " + error.message)
    } else {
      setAppointments(prev => prev.filter(a => a.id !== apptId))
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

  // Fetch patient prescriptions
  useEffect(() => {
    if (activeTab !== 'prescriptions') return
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

  // Separate active from past
  const activeAppointments = appointments.filter(a => ['waiting', 'scheduled', 'in_progress', 'proposed'].includes(a.status || ''))
  const pastAppointments = appointments.filter(a => ['completed', 'cancelled'].includes(a.status || ''))

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

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto">
      {/* Bookings View */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
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
              {activeAppointments.map(apt => {
                const cfg = STATUS_CONFIG[apt.status || 'waiting']
                const isPending = apt.status === 'waiting'
                const isApproved = apt.status === 'scheduled'
                const needsPayment = apt.payment_status === 'pending' && isApproved
                
                return (
                  <div key={apt.id} className={`bg-white dark:bg-gray-900 rounded-2xl p-5 border ${isPending ? 'border-amber-200 dark:border-amber-800' : needsPayment ? 'border-blue-200 dark:border-blue-800' : 'border-gray-100 dark:border-gray-800'} shadow-sm flex flex-col justify-between`}>
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{cfg.icon}</span>
                          <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{needsPayment ? `💳 ${tp('awaiting_payment') || 'Awaiting Payment'}` : cfg.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
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
                           {isPending && (
                             <button 
                               onClick={() => handleDeleteAppointment(apt.id)} 
                               className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1.5 shadow-sm"
                               title="Cancel and remove this request"
                             >
                               <span>🗑️</span>
                               <span>{tp('delete') || 'Delete'}</span>
                             </button>
                           )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setViewingDoctorId(apt.doctor_id)}
                          className="font-black text-lg text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1.5 text-left group"
                          title="Click to view Dr. profile, rush hours & stats"
                        >
                          <span>Dr. {apt.doctor_name}</span>
                          <span className="text-xs text-blue-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">ℹ️ View Profile →</span>
                        </button>
                      </div>
                      
                      {apt.status === 'proposed' && (
                        <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                           <p className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                             <span>📢</span> {tp('proposed_time_msg') || 'The doctor has proposed a new time for your appointment.'}
                           </p>
                           <div className="flex gap-2">
                              <button 
                                onClick={() => handleProposalAction(apt.id, 'approve')}
                                className="flex-1 bg-purple-600 text-white font-bold py-2 rounded-xl text-xs shadow-lg shadow-purple-500/30 hover:bg-purple-700 transition-all"
                              >
                                {tp('approve_new_time') || 'Approve New Time'}
                              </button>
                              <button 
                                onClick={() => handleProposalAction(apt.id, 'reject')}
                                className="flex-1 bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-900 font-bold py-2 rounded-xl text-xs hover:bg-red-50 transition-all"
                              >
                                {tp('reject_cancel') || 'Reject & Cancel'}
                              </button>
                           </div>
                        </div>
                      )}
                      
                      {/* Live Queue, Arrival Alert & Doctor Free/Busy Status */}
                      {isApproved && apt.scheduled_time?.startsWith(new Date().toISOString().split('T')[0]) && apt.appointment_type !== 'home_visit' && (() => {
                        const arrivalTime = parseArrivalTime(apt.notes);
                        const isArrived = !!arrivalTime;
                        const docStatus = liveDoctorData[apt.doctor_id];
                        const myPosition = apt.queue_position || 1;
                        const currentServing = docStatus?.current_serving_position || 0;
                        const isMyTurn = apt.status === 'in_progress' || (currentServing === myPosition && currentServing > 0);
                        
                        // Calculate patients ahead
                        let patientsAhead = 0;
                        if (docStatus?.queue && docStatus.queue.length > 0) {
                          patientsAhead = docStatus.queue.filter(q => q.queue_position < myPosition && q.status !== 'completed').length;
                        } else {
                          patientsAhead = Math.max(0, myPosition - (currentServing || 1));
                        }

                        return (
                          <div className="mt-3 space-y-3">
                            {/* Arrival Notification Button / Confirmed Badge */}
                            {!isArrived ? (
                              <button
                                type="button"
                                disabled={arrivingId === apt.id}
                                onClick={() => handleMarkArrival(apt.id)}
                                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                              >
                                <span>📍</span>
                                <span>{arrivingId === apt.id ? 'Notifying Reception...' : (tp('i_have_arrived') || 'I Have Arrived at Clinic / وصلت إلى العيادة')}</span>
                              </button>
                            ) : (
                              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black">
                                  <span className="text-base">✅</span>
                                  <span>{tp('checked_in') || 'Checked In at Clinic'} ({arrivalTime})</span>
                                </div>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100">
                                  {tp('doctor_notified') || 'Doctor Notified'}
                                </span>
                              </div>
                            )}

                            {/* Live Turn & Doctor Free Status Widget */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/70 to-indigo-50/70 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-100 dark:border-blue-900/40 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                                  <span className="relative flex h-2.5 w-2.5">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${docStatus?.is_in_consultation ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${docStatus?.is_in_consultation ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                                  </span>
                                  <span>
                                    {docStatus?.is_in_consultation 
                                      ? (tp('doctor_busy') || 'Doctor is consulting with a patient') 
                                      : (tp('doctor_free') || 'Doctor is ready for next patient')}
                                  </span>
                                </div>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                  Live Turn
                                </span>
                              </div>

                              {/* Queue numbers */}
                              <div className="grid grid-cols-2 gap-2 text-center pt-1">
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                  <p className="text-[10px] uppercase font-black text-gray-400">{tp('your_turn_number') || 'Your Turn'}</p>
                                  <p className="text-base font-black text-blue-600">Q{myPosition}</p>
                                </div>
                                <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                  <p className="text-[10px] uppercase font-black text-gray-400">{tp('now_serving') || 'Now Serving'}</p>
                                  <p className="text-base font-black text-gray-800 dark:text-gray-200">
                                    {currentServing > 0 ? `Q${currentServing}` : (docStatus?.is_in_consultation ? 'In Room' : 'Ready')}
                                  </p>
                                </div>
                              </div>

                              {/* Turn status statement & Estimated time */}
                              <div className="pt-1 flex items-center justify-between text-xs font-bold flex-wrap gap-2">
                                {isMyTurn ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-black animate-pulse flex items-center gap-1">
                                    <span>🎉</span> {tp('its_your_turn') || "It's your turn right now! Please enter."}
                                  </span>
                                ) : patientsAhead === 0 ? (
                                  <span className="text-blue-600 dark:text-blue-400 font-black flex items-center gap-1">
                                    <span>⚡</span> {tp('you_are_next') || 'You are NEXT in line! Please wait at clinic door.'}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                    <span>👥</span> {patientsAhead} {patientsAhead === 1 ? (tp('patient_ahead') || 'patient ahead of you') : (tp('patients_ahead') || 'patients ahead of you')}
                                  </span>
                                )}
                                <span className="text-gray-500 text-[11px]">
                                  ⏱️ ~{Math.max(5, (patientsAhead || 1) * 15)} {t('mins') || 'mins wait'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-col gap-1 mt-3 text-sm text-gray-500">
                        <div className="flex gap-2 items-center">
                          <span className="w-5 text-center">📅</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">{apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                           <span className="w-5 text-center">🏥</span>
                           <span className="capitalize">{(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                           <span className="w-5 text-center">💰</span>
                           <span>{apt.fees} EGP</span>
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
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
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
                                    <p className="font-bold">{new Date(apt.scheduled_time!).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', hour12: false})}</p>
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

      {/* History & Logs Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 px-2">Audit History & Past Visits</h3>
          {pastAppointments.length === 0 && activeAppointments.length === 0 ? (
            <div className="p-12 text-center text-gray-500 bg-white dark:bg-gray-900 rounded-3xl">No history found.</div>
          ) : (
            <div className="space-y-4">
              {[...activeAppointments, ...pastAppointments].sort((a,b) => new Date(b.scheduled_time||0).getTime() - new Date(a.scheduled_time||0).getTime()).map(apt => {
                const cfg = STATUS_CONFIG[apt.status || 'completed']
                const isExpanded = expandedLogs === apt.id
                return (
                  <div key={apt.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm transition-all hover:border-gray-200 dark:hover:border-gray-700">
                    <div 
                      className="p-5 cursor-pointer flex flex-wrap gap-4 items-center justify-between"
                      onClick={() => fetchAppointmentLogs(apt.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full ${cfg.bg} flex items-center justify-center text-xl`}>{cfg.icon}</div>
                        <div>
                          <h4 className="font-bold">Dr. {apt.doctor_name}</h4>
                          <p className="text-sm text-gray-500">
                            {apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'TBD'} • {(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                          {apt.status === 'cancelled' && apt.rejection_reason && (
                            <p className="text-xs text-red-500 truncate max-w-[200px]" title={apt.rejection_reason}>{apt.rejection_reason}</p>
                          )}
                        </div>
                        <span className="text-gray-300 font-bold">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expandable Logs Section */}
                    {isExpanded && (
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-5 border-t border-gray-100 dark:border-gray-800">
                        <h5 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">Audit Timeline</h5>
                        {!appointmentLogs[apt.id] ? (
                          <p className="text-sm text-gray-500 text-center py-4">Loading logs...</p>
                        ) : appointmentLogs[apt.id].length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No audit logs found for this appointment.</p>
                        ) : (
                          <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
                            {appointmentLogs[apt.id].map((log, i) => (
                              <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full border-4 border-white dark:border-gray-900 bg-blue-500 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 shadow-sm text-[8px] text-white">
                                  {log.action === 'created' ? '➕' : log.action === 'rescheduled' ? '⏱️' : '📝'}
                                </div>
                                <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-sm capitalize">{log.action.replace('_', ' ')}</span>
                                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 mb-2">{log.details}</p>
                                  <div className="flex justify-between items-end">
                                    <div className="flex gap-2 items-center">
                                      {log.previous_status && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{log.previous_status}</span>}
                                      {log.new_status && (
                                        <>
                                          {log.previous_status && <span className="text-gray-300">→</span>}
                                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded">{log.new_status}</span>
                                        </>
                                      )}
                                    </div>
                                    <span className="text-[10px] items-center flex gap-1">
                                      <span className="text-gray-400">by</span> <span className="font-bold truncate max-w-[80px]">{log.changed_by_name}</span>
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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
              <h3 className="text-xl font-bold">No Doctors Yet</h3>
              <p className="text-gray-500 mt-2 mb-6">Connect with a doctor to view their profile and book appointments instantly.</p>
              <button onClick={() => setShowAddDoctor(true)} className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 text-white px-6 py-3 rounded-xl font-bold">Find a Doctor</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {doctors.map(doc => (
                <div key={doc.id} className="bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md group">
                  <div className="p-6">
                    <div className="flex justify-between items-start gap-4">
                      
                      {/* Doctor Basic Info */}
                      <div className="flex items-start gap-5 flex-1 cursor-pointer" onClick={() => {
                        setExpandedDoctorId(expandedDoctorId === doc.id ? null : doc.id);
                        if (expandedDoctorId !== doc.id) fetchDoctorCertificates(doc.id);
                      }}>
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center text-2xl font-black shrink-0 shadow-lg shadow-blue-500/20">
                          {doc.full_name?.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-xl font-black">Dr. {doc.full_name}</h2>
                          {doc.specialization && (
                            <span className="text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg inline-block mt-1">{doc.specialization}</span>
                          )}
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2 max-w-lg">{doc.bio || 'Experienced medical professional dedicated to providing the best care for patients.'}</p>
                        </div>
                      </div>

                      {/* Top Right Actions */}
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <button 
                          onClick={() => handleRemoveDoctor(doc.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-1"
                          title="Remove Doctor"
                        >✕</button>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingDoctorId(doc.id);
                            }}
                            className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold px-3.5 py-2.5 rounded-xl hover:bg-blue-100 transition-all border border-blue-200 dark:border-blue-800 flex items-center gap-1.5 shadow-sm"
                            title="View doctor's public statistics, rush hours and bio"
                          >
                            <span>ℹ️ Profile & Stats</span>
                          </button>
                          <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSelectedDoctor(doc);
                               setEditAppointmentId(null);
                               setShowBooking(true);
                             }}
                             className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white text-xs font-black px-4 py-2.5 rounded-xl hover:opacity-95 transition-all shadow-md shadow-blue-500/20"
                           >
                             Book Visit
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedDoctorId === doc.id && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 p-6 border-t border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                           <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Clinic & Hours</h4>
                           <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-700">
                             <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                               <p className="text-sm text-gray-500 mb-1">📍 Address</p>
                               <p className="font-bold text-sm leading-relaxed">{doc.clinic_location || 'Address not provided'}</p>
                             </div>
                             <div>
                               <p className="text-sm text-gray-500 mb-1">🕒 Working Hours</p>
                               {renderDoctorWorkingHours(doc.working_hours)}
                             </div>
                           </div>
                        </div>
                        <div>
                           <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Certificates & Qualifications</h4>
                           {!doctorCerts[doc.id] ? (
                             <p className="text-sm text-gray-400 py-4">Loading certificates...</p>
                           ) : doctorCerts[doc.id].length === 0 ? (
                             <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 text-center">
                                <p className="text-xl mb-2">🎓</p>
                                <p className="text-gray-500 text-sm">No certificates listed publicly.</p>
                             </div>
                           ) : (
                             <div className="space-y-3">
                               {doctorCerts[doc.id].map(cert => (
                                 <div key={cert.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-700 flex gap-3 shadow-sm">
                                    <div className="text-2xl shrink-0">🏅</div>
                                    <div>
                                      <p className="font-bold text-sm">{cert.title}</p>
                                      {cert.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{cert.description}</p>}
                                    </div>
                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
                         className="cursor-pointer group flex-1"
                         onClick={() => setViewingDoctorId(doc.id)}
                       >
                         <p className="font-bold group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                           Dr. {doc.full_name}
                           <span className="text-[10px] text-gray-400 font-normal">🔍 View</span>
                         </p>
                         <p className="text-xs text-blue-600 font-medium">{doc.specialization || 'General Practitioner'}</p>
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

      {/* Prescriptions Tab */}
      {activeTab === 'prescriptions' && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold">My Prescriptions</h3>
            <p className="text-sm text-gray-500">Official prescriptions issued to you by your doctor.</p>
          </div>
          {loadingPrescriptions ? (
            <div className="py-20 text-center animate-pulse text-gray-400">Loading prescriptions...</div>
          ) : prescriptions.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="text-5xl">💊</div>
              <p className="text-gray-400 font-medium">No prescriptions yet.</p>
              <p className="text-sm text-gray-300">Prescriptions issued by your doctor will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {prescriptions.map(rx => (
                <div key={rx.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 text-purple-600 flex items-center justify-center shrink-0 text-2xl shadow-sm">💊</div>
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-lg">{rx.diagnosis || 'General Prescription'}</p>
                          <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-md">Rx</span>
                        </div>
                        {rx.symptoms && <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed"><span className="font-bold text-gray-400 uppercase text-xs">Symptoms:</span> {rx.symptoms}</p>}
                        {rx.medications?.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {rx.medications.map((m: any, idx: number) => (
                              <span key={idx} className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-full text-xs font-bold border border-purple-100 dark:border-purple-900/30 text-purple-700 dark:text-purple-300">
                                {m.name} {m.dosage ? `· ${m.dosage}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-4 flex gap-4 text-xs font-bold text-gray-400">
                          <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">👨‍⚕️ Dr. {rx.doctor_name}</span>
                          <span className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">📅 {rx.created_at ? new Date(rx.created_at).toLocaleDateString() : ''}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setViewingPrescription(rx)}
                      className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-xl font-bold text-sm transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
    </div>
  )
}
