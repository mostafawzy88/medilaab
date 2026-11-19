'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'

type Appointment = {
  id: string
  patient_id: string | null
  manual_patient_id?: string | null
  scheduled_time: string
  status: string
  fees?: number
  appointment_type?: string
  doctor_id?: string
  notes?: string | null
  payment_status?: string
  payment_reference?: string | null
  family_member_name?: string | null
  patient?: {
    full_name: string
    phone_number?: string | null
    clinic_location?: string | null
    latitude?: number | null
    longitude?: number | null
  } | null
  manual_patient?: {
    full_name: string
    phone_number?: string | null
  } | null
}

export default function ClinicSchedule({
  doctorId,
  appointments: initialAppointments,
  onNewAppointment
}: {
  doctorId: string
  appointments?: Appointment[]
  onNewAppointment?: () => void
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewState, setViewState] = useState<'Day' | 'Week'>('Day')
  const [viewMonth, setViewMonth] = useState(new Date())
  const [scheduleAppointments, setScheduleAppointments] = useState<Appointment[]>(initialAppointments || [])
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch appointments for schedule range
  const fetchScheduleAppointments = useCallback(async () => {
    if (!doctorId) return
    setLoading(true)
    const supabase = createClient()

    // 45 days back to 60 days forward from viewMonth
    const startWindow = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1).toISOString()
    const endWindow = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 2, 28).toISOString()

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, payment_reference, notes, family_member_name, doctor_id,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number, clinic_location, latitude, longitude),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
      .gte('scheduled_time', startWindow)
      .lte('scheduled_time', endWindow)
      .order('scheduled_time', { ascending: true })

    if (!error && data) {
      setScheduleAppointments(data as any)
    }
    setLoading(false)
  }, [doctorId, viewMonth])

  useEffect(() => {
    fetchScheduleAppointments()
  }, [fetchScheduleAppointments])

  // Realtime subscription
  useEffect(() => {
    if (!doctorId) return
    const supabase = createClient()
    const channel = supabase
      .channel('clinic-schedule-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorId}` },
        () => fetchScheduleAppointments()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [doctorId, fetchScheduleAppointments])

  // Generate hours from 8 AM to 8 PM
  const hours = Array.from({ length: 13 }, (_, i) => i + 8)

  // Map appointments to slots with flexible 30-min window
  const getApptForSlot = (date: Date, hour: number, isHalfHour: boolean) => {
    return scheduleAppointments.find(a => {
      if (!a.scheduled_time) return false
      const aptDate = new Date(a.scheduled_time)
      const isSameDay =
        aptDate.getFullYear() === date.getFullYear() &&
        aptDate.getMonth() === date.getMonth() &&
        aptDate.getDate() === date.getDate()

      if (!isSameDay) return false
      if (aptDate.getHours() !== hour) return false
      return isHalfHour ? aptDate.getMinutes() >= 30 : aptDate.getMinutes() < 30
    })
  }

  const getDayLabel = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // Mini Calendar Helpers
  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay()

  const changeMonth = (offset: number) => {
    const d = new Date(viewMonth)
    d.setMonth(d.getMonth() + offset)
    setViewMonth(d)
  }

  // Days with appointments for dot indicator
  const daysWithAppointments = new Set(
    scheduleAppointments.map(a => {
      const d = new Date(a.scheduled_time)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  // Get days to render based on viewState
  const getDaysToRender = () => {
    if (viewState === 'Day') return [currentDate]
    const current = new Date(currentDate)
    const first = current.getDate() - current.getDay() // Start from Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(current)
      d.setDate(first + i)
      return d
    })
  }

  const daysToRender = getDaysToRender()

  const getStatusColor = (status: string, appointmentType?: string) => {
    if (appointmentType === 'home_visit') {
      return 'bg-gradient-to-r from-amber-600 to-amber-700 border-amber-300'
    }
    switch (status) {
      case 'completed':
        return 'bg-emerald-600 border-emerald-300'
      case 'in_progress':
        return 'bg-purple-600 border-purple-300'
      case 'waiting':
      case 'proposed':
        return 'bg-sky-600 border-sky-300'
      default:
        return 'bg-blue-600 border-blue-300' // scheduled
    }
  }

  const moveDate = (offset: number) => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + (viewState === 'Week' ? offset * 7 : offset))
    setCurrentDate(d)
    setViewMonth(d)
  }

  return (
    <div className="flex flex-col md:flex-row h-[850px] border border-gray-200 dark:border-gray-800 rounded-3xl overflow-hidden bg-white dark:bg-[#150F2A] shadow-sm relative">
      {/* Left side panel (Mini Calendar & Filters) */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-[#0A0614] flex flex-col p-4 flex-shrink-0">
        <div className="mb-6">
          <h3 className="font-black text-gray-900 dark:text-white flex justify-between items-center text-sm">
            <span>{viewMonth.toLocaleDateString('default', { month: 'long', year: 'numeric' })}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                &gt;
              </button>
            </div>
          </h3>

          <div className="grid grid-cols-7 gap-1 mt-4 text-[10px] text-center text-gray-400 font-black uppercase tracking-widest">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>

          <div className="grid grid-cols-7 gap-y-1 mt-2">
            {/* Empty slots for first week offset */}
            {Array.from({ length: firstDayOfMonth(viewMonth) }).map((_, i) => (
              <div key={`empty-${i}`} className="w-7 h-7" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth(viewMonth) }, (_, i) => {
              const day = i + 1
              const isSelected =
                currentDate.getDate() === day &&
                currentDate.getMonth() === viewMonth.getMonth() &&
                currentDate.getFullYear() === viewMonth.getFullYear()
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === viewMonth.getMonth() &&
                new Date().getFullYear() === viewMonth.getFullYear()
              const hasAppts = daysWithAppointments.has(
                `${viewMonth.getFullYear()}-${viewMonth.getMonth()}-${day}`
              )

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    const newDate = new Date(viewMonth)
                    newDate.setDate(day)
                    setCurrentDate(newDate)
                  }}
                  className={`w-7 h-7 rounded-lg mx-auto flex flex-col items-center justify-center text-[11px] font-bold transition-all relative ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : isToday
                      ? 'text-blue-600 dark:text-blue-400 border border-blue-500 font-black'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
                  }`}
                >
                  <span>{day}</span>
                  {hasAppts && (
                    <span
                      className={`w-1 h-1 rounded-full absolute bottom-0.5 ${
                        isSelected ? 'bg-white' : 'bg-blue-500'
                      }`}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-800 space-y-2 text-xs">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Legend</p>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600" />
            <span className="text-gray-600 dark:text-gray-300">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-600" />
            <span className="text-gray-600 dark:text-gray-300">Home Visit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-600" />
            <span className="text-gray-600 dark:text-gray-300">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-600" />
            <span className="text-gray-600 dark:text-gray-300">Completed</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Controls */}
        <div className="h-16 border-b border-gray-200 dark:border-gray-800 px-6 flex justify-between items-center bg-white dark:bg-[#150F2A] flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                setCurrentDate(now)
                setViewMonth(now)
              }}
              className="px-4 py-1.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
            >
              Today
            </button>
            <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-xl p-1 bg-gray-50 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => moveDate(-1)}
                className="p-1 px-3 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm rounded-lg transition-all text-gray-500 font-bold"
              >
                &lt;
              </button>
              <span className="text-xs px-2 font-bold text-gray-400">📅</span>
              <button
                type="button"
                onClick={() => moveDate(1)}
                className="p-1 px-3 hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm rounded-lg transition-all text-gray-500 font-bold"
              >
                &gt;
              </button>
            </div>
            <select
              value={viewState}
              onChange={e => setViewState(e.target.value as any)}
              className="text-sm font-bold border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="Day">Day View</option>
              <option value="Week">Week View</option>
            </select>
            {loading && <span className="text-xs text-blue-500 font-medium animate-pulse">Syncing...</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewAppointment}
              className="px-4 py-2 bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white rounded-xl text-sm font-black shadow-md hover:opacity-95 transition-all"
            >
              + New Appointment
            </button>
          </div>
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex">
            {/* Time Axis */}
            <div className="w-20 border-r border-gray-100 dark:border-gray-800 text-xs text-gray-400 font-semibold sticky left-0 bg-white dark:bg-[#150F2A] z-10 pt-10 flex-shrink-0">
              {hours.map(h => (
                <div key={h} className="h-24 relative flex justify-end pr-2 -top-2">
                  {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
                </div>
              ))}
            </div>

            {/* Day Columns Container */}
            <div className="flex-1 flex pt-10 min-w-[600px] overflow-x-auto relative">
              {daysToRender.map((day, idx) => (
                <div
                  key={idx}
                  className="flex-1 relative border-r border-gray-100 dark:border-gray-800 last:border-r-0 min-w-[160px]"
                >
                  <div className="absolute top-0 transform -translate-y-full left-0 right-0 h-10 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-center font-black text-sm text-blue-600 dark:text-blue-400 z-10">
                    {getDayLabel(day)}
                  </div>

                  {/* Horizontal Grid Lines & Appointments */}
                  <div className="relative">
                    {hours.map(h => {
                      const topAppt = getApptForSlot(day, h, false)
                      const bottomAppt = getApptForSlot(day, h, true)

                      return (
                        <div key={h} className="h-24 border-b border-gray-100 dark:border-gray-800 relative">
                          {/* Half-hour dashed line */}
                          <div className="absolute top-1/2 left-0 right-0 h-px border-b border-dashed border-gray-100 dark:border-gray-800/80" />

                          {/* 00 min slot block */}
                          {topAppt && (
                            <div
                              onClick={() => setSelectedAppt(topAppt)}
                              className={`absolute top-0.5 left-1 right-1 h-11 ${getStatusColor(
                                topAppt.status,
                                topAppt.appointment_type
                              )} rounded-xl p-2 shadow-sm text-white border-l-4 hover:-translate-y-0.5 transition-transform cursor-pointer overflow-hidden z-20`}
                            >
                              <p className="text-xs font-black truncate leading-tight flex items-center gap-1">
                                {topAppt.appointment_type === 'home_visit' && <span>🏠</span>}
                                <span>{topAppt.patient?.full_name || topAppt.manual_patient?.full_name}</span>
                              </p>
                              <p className="text-[10px] opacity-90 mt-0.5">
                                {new Date(topAppt.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })} •{' '}
                                {topAppt.appointment_type === 'home_visit' ? 'Home Visit' : topAppt.status}
                              </p>
                            </div>
                          )}

                          {/* 30 min slot block */}
                          {bottomAppt && (
                            <div
                              onClick={() => setSelectedAppt(bottomAppt)}
                              className={`absolute top-12 left-1 right-1 h-11 ${getStatusColor(
                                bottomAppt.status,
                                bottomAppt.appointment_type
                              )} rounded-xl p-2 shadow-sm text-white border-l-4 hover:-translate-y-0.5 transition-transform cursor-pointer overflow-hidden z-20`}
                            >
                              <p className="text-xs font-black truncate leading-tight flex items-center gap-1">
                                {bottomAppt.appointment_type === 'home_visit' && <span>🏠</span>}
                                <span>{bottomAppt.patient?.full_name || bottomAppt.manual_patient?.full_name}</span>
                              </p>
                              <p className="text-[10px] opacity-90 mt-0.5">
                                {new Date(bottomAppt.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })} •{' '}
                                {bottomAppt.appointment_type === 'home_visit' ? 'Home Visit' : bottomAppt.status}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Detail Modal when clicking a slot in schedule */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-md w-full p-6 border border-gray-100 dark:border-gray-800 shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-blue-500">
                  {selectedAppt.appointment_type?.replace(/_/g, ' ') || 'Clinic Visit'}
                </span>
                <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">
                  {selectedAppt.patient?.full_name || selectedAppt.manual_patient?.full_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppt(null)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Dependent Tag */}
            {selectedAppt.family_member_name && (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                👨‍👩‍👧 For: {selectedAppt.family_member_name}
              </span>
            )}

            {/* Visit Details */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 space-y-2.5 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-400">Time:</span>
                <span className="font-bold">
                  {new Date(selectedAppt.scheduled_time).toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span className="font-bold capitalize">{selectedAppt.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fee:</span>
                <span className="font-bold">{selectedAppt.fees || 0} EGP ({selectedAppt.payment_status || 'pending'})</span>
              </div>
            </div>

            {/* Patient Complaint / Note */}
            {(() => {
              if (!selectedAppt.notes) return null
              const match = selectedAppt.notes.match(/\[PATIENT_NOTE:\s*([^\]]+)\]/)
              const noteText = match ? match[1] : (selectedAppt.notes.includes('[FOR:') ? '' : selectedAppt.notes)
              if (!noteText) return null
              return (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs">
                  <p className="font-bold text-amber-800 dark:text-amber-300 mb-1">📝 Patient Symptoms / Note:</p>
                  <p className="text-gray-700 dark:text-gray-300 italic">"{noteText}"</p>
                </div>
              )
            })()}

            {/* Home Visit Address & Google Maps */}
            {selectedAppt.appointment_type === 'home_visit' && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs">
                <p className="font-bold text-amber-700 dark:text-amber-300">📍 House Call Destination:</p>
                <p className="text-gray-800 dark:text-gray-200">
                  {selectedAppt.patient?.clinic_location || 'Address not entered in patient profile'}
                </p>
                {(selectedAppt.patient?.clinic_location || (selectedAppt.patient?.latitude && selectedAppt.patient?.longitude)) && (
                  <a
                    href={
                      selectedAppt.patient.latitude && selectedAppt.patient.longitude
                        ? `https://maps.google.com/?q=${selectedAppt.patient.latitude},${selectedAppt.patient.longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAppt.patient?.clinic_location || '')}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-sm"
                  >
                    <span>🗺️ Open in Google Maps</span>
                  </a>
                )}
              </div>
            )}

            {/* Actions: Phone & WhatsApp */}
            {(() => {
              const phone = selectedAppt.patient?.phone_number || selectedAppt.manual_patient?.phone_number
              const waUrl = getWhatsAppLink(phone, `Hello ${selectedAppt.patient?.full_name || selectedAppt.manual_patient?.full_name}, this is your clinic regarding your appointment.`)
              return (
                <div className="flex gap-2 pt-2">
                  {phone && (
                    <a
                      href={`tel:${phone}`}
                      className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-center font-bold text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                    >
                      <span>📞 Call</span>
                    </a>
                  )}
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-center font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 text-white" />
                      <span>WhatsApp</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => alert('No valid phone number registered for WhatsApp')}
                      className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 text-center font-bold text-xs cursor-not-allowed"
                    >
                      No WhatsApp
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedAppt(null)}
                    className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 font-bold text-xs"
                  >
                    Close
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
