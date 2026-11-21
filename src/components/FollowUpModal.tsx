'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

type FollowUpModalProps = {
  doctorId: string
  doctorName: string
  appointment: {
    id: string
    patient_id: string | null
    manual_patient_id?: string | null
    appointment_type?: string
    patient: { full_name: string; phone_number?: string | null } | null
    manual_patient?: { full_name: string } | null
  }
  onClose: () => void
  onSuccess: () => void
}

function downloadICS(appointment: { scheduledTime: string; patientName: string; doctorName: string }) {
  const start = new Date(appointment.scheduledTime)
  const end = new Date(start.getTime() + 30 * 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Free Follow-Up Visit - Dr. ${appointment.doctorName}`,
    `DESCRIPTION:Free follow-up medical appointment for ${appointment.patientName}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `followup-${appointment.patientName.replace(/ /g, '_')}.ics`
  a.click()
  URL.revokeObjectURL(url)
}

function getGoogleCalendarUrl(appointment: { scheduledTime: string; patientName: string; doctorName: string }) {
  const start = new Date(appointment.scheduledTime)
  const end = new Date(start.getTime() + 30 * 60000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  const title = encodeURIComponent(`Free Follow-Up Visit - Dr. ${appointment.doctorName}`)
  const details = encodeURIComponent(`Free follow-up medical appointment for ${appointment.patientName} at MediLab Clinic.`)
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}`
}

export default function FollowUpModal({
  doctorId,
  doctorName,
  appointment,
  onClose,
  onSuccess,
}: FollowUpModalProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const patientName =
    appointment.patient?.full_name || appointment.manual_patient?.full_name || 'Patient'

  // Date range: today+1 to today+30
  const today = new Date()
  const minDateStr = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const maxDateStr = maxDate.toISOString().slice(0, 10)

  const [selectedDate, setSelectedDate] = useState(minDateStr)
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking] = useState(false)
  const [bookedICS, setBookedICS] = useState<{ scheduledTime: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Load already booked times for the selected date + doctor
  useEffect(() => {
    if (!selectedDate) return
    const fetchBooked = async () => {
      setLoadingSlots(true)
      setSelectedTime('')
      const supabase = createClient()
      const dayStart = `${selectedDate}T00:00:00`
      const dayEnd = `${selectedDate}T23:59:59`
      const { data } = await supabase
        .from('appointments')
        .select('scheduled_time')
        .eq('doctor_id', doctorId)
        .gte('scheduled_time', dayStart)
        .lte('scheduled_time', dayEnd)
        .in('status', ['scheduled', 'in_progress', 'waiting'])
      setBookedSlots((data || []).map((r: any) => r.scheduled_time?.slice(11, 16) ?? ''))
      setLoadingSlots(false)
    }
    fetchBooked()
  }, [selectedDate, doctorId])

  // Generate 15-min slots from 08:00 to 21:00
  const allSlots: string[] = []
  for (let h = 8; h < 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      allSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  const availableSlots = allSlots.filter(s => !bookedSlots.includes(s))

  const formatSlot = (slot: string) => {
    const [hStr, mStr] = slot.split(':')
    const h = parseInt(hStr)
    const m = mStr
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${m} ${ampm}`
  }

  const handleBook = async () => {
    if (!selectedDate || !selectedTime) {
      setErrorMsg(isAr ? 'يرجى اختيار التاريخ والوقت' : 'Please select date and time')
      return
    }
    setErrorMsg('')
    setBooking(true)

    const scheduledTime = `${selectedDate}T${selectedTime}:00`
    const baseNotes = `[FREE_FOLLOW_UP] Follow-up for: ${patientName}${notes ? ` | ${notes}` : ''}`

    const supabase = createClient()

    // Find next queue position
    const dayStart = `${selectedDate}T00:00:00`
    const dayEnd = `${selectedDate}T23:59:59`
    const { data: existing } = await supabase
      .from('appointments')
      .select('queue_position')
      .eq('doctor_id', doctorId)
      .gte('scheduled_time', dayStart)
      .lte('scheduled_time', dayEnd)
      .order('queue_position', { ascending: false })
      .limit(1)

    const nextPosition = (existing?.[0]?.queue_position ?? 0) + 1

    const { error } = await supabase.from('appointments').insert({
      doctor_id: doctorId,
      patient_id: appointment.patient_id,
      manual_patient_id: appointment.manual_patient_id ?? null,
      scheduled_time: scheduledTime,
      status: 'scheduled',
      appointment_type: appointment.appointment_type || 'clinic_normal',
      fees: 0,
      payment_status: 'paid',
      notes: baseNotes,
      queue_position: nextPosition,
    })

    setBooking(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setBookedICS({ scheduledTime })
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-gray-900 dark:text-white">
                📅 {isAr ? 'جدولة زيارة متابعة مجانية' : 'Schedule Free Follow-Up Visit'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {isAr ? 'المريض:' : 'Patient:'}{' '}
                <span className="font-bold text-cyan-600 dark:text-cyan-400">{patientName}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-3 py-1.5 rounded-xl text-xs font-black text-emerald-700 dark:text-emerald-300">
            <span>🆓</span>
            <span>{isAr ? 'مجاني - 0 جنيه' : 'Free Visit — 0 EGP'}</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Date picker */}
          <div>
            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              📆 {isAr ? 'التاريخ' : 'Date'}
            </label>
            <input
              type="date"
              min={minDateStr}
              max={maxDateStr}
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-cyan-500 outline-none text-sm font-semibold"
            />
          </div>

          {/* Time slots */}
          <div>
            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              🕐 {isAr ? 'الوقت المتاح' : 'Available Times'}
            </label>
            {loadingSlots ? (
              <div className="text-center py-4 text-gray-400 text-sm">
                {isAr ? 'جاري التحميل...' : 'Loading slots...'}
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="text-center py-4 text-red-500 text-sm font-bold">
                {isAr ? 'لا توجد مواعيد متاحة في هذا اليوم' : 'No available slots on this date'}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={`py-2 rounded-xl text-xs font-bold border-2 transition-all ${
                      selectedTime === slot
                        ? 'bg-cyan-500 border-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-cyan-400 hover:text-cyan-600'
                    }`}
                  >
                    {formatSlot(slot)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              📝 {isAr ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isAr ? 'ملاحظات للزيارة...' : 'Notes for the follow-up visit...'}
              className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-cyan-500 outline-none text-sm resize-none h-20"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl p-3 text-sm text-red-600 dark:text-red-400 font-bold">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Success + ICS download */}
          {bookedICS && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl p-4 text-center space-y-3">
              <p className="text-emerald-700 dark:text-emerald-300 font-black text-sm">
                ✅ {isAr ? 'تم حجز موعد المتابعة المجاني بنجاح!' : 'Free Follow-Up Booked Successfully!'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadICS({
                      scheduledTime: bookedICS.scheduledTime,
                      patientName,
                      doctorName,
                    })
                  }
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  📥 {isAr ? 'تحميل ملف التقويم (.ics)' : 'Download Calendar (.ics)'}
                </button>
                <a
                  href={getGoogleCalendarUrl({
                    scheduledTime: bookedICS.scheduledTime,
                    patientName,
                    doctorName,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  📅 {isAr ? 'إضافة إلى Google Calendar' : 'Add to Google Calendar'}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {!bookedICS && (
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleBook}
              disabled={booking || !selectedDate || !selectedTime}
              className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white font-black shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {booking
                ? isAr
                  ? 'جاري الحجز...'
                  : 'Booking...'
                : isAr
                  ? '📅 حجز الزيارة المجانية'
                  : '📅 Book Follow-Up'}
            </button>
          </div>
        )}
        {bookedICS && (
          <div className="px-6 pb-6">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isAr ? 'إغلاق' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
