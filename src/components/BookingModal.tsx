'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'

type Doctor = {
  id: string
  full_name: string
  instapay_address: string | null
  fees_normal: number | null
  fees_urgent: number | null
  fees_home_visit: number | null
  auto_confirm_appointments: boolean | null
  working_hours: any
}

type BookingModalProps = {
  onClose: () => void
  onSuccess: () => void
  initialDoctor?: Doctor | null
  editAppointmentId?: string | null
  isStaff?: boolean
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export default function BookingModal({ onClose, onSuccess, initialDoctor, editAppointmentId, isStaff }: BookingModalProps) {
  const t = useTranslations('Dashboard')
  const [step, setStep] = useState(1)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [appointmentType, setAppointmentType] = useState<'clinic_normal' | 'clinic_urgent' | 'home_visit'>('clinic_normal')
  const [paymentChoice, setPaymentChoice] = useState<'prepay' | 'pay_at_visit'>('prepay')
  const [booking, setBooking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [bookedSlots, setBookedSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  useEffect(() => {
    const fetchDoctors = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, instapay_address, fees_normal, fees_urgent, fees_home_visit, auto_confirm_appointments, working_hours')
        .eq('role', 'doctor')
        .eq('is_authorized', true)
      
      if (data) {
        setDoctors(data)
        if (initialDoctor) {
          setSelectedDoctorId(initialDoctor.id)
          setStep(2)
        }
      }
      setLoading(false)
    }
    fetchDoctors()
  }, [initialDoctor])

  // Fetch booked slots for the chosen date
  useEffect(() => {
    if (!selectedDate || !selectedDoctorId) {
      setBookedSlots([])
      return
    }

    const fetchSlots = async () => {
      setLoadingSlots(true)
      const supabase = createClient()
      const startOfDay = new Date(selectedDate)
      startOfDay.setHours(0,0,0,0)
      const endOfDay = new Date(selectedDate)
      endOfDay.setHours(23,59,59,999)

      let query = supabase
        .from('appointments')
        .select('scheduled_time')
        .eq('doctor_id', selectedDoctorId)
        .in('status', ['waiting', 'scheduled', 'in_progress'])
        .gte('scheduled_time', startOfDay.toISOString())
        .lte('scheduled_time', endOfDay.toISOString())
      
      // If editing an existing appointment, don't block its current slot
      if (editAppointmentId) {
        query = query.neq('id', editAppointmentId)
      }

      const { data } = await query
      
      if (data) {
        const slots = data.map(apt => {
          const d = new Date(apt.scheduled_time)
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        })
        setBookedSlots(slots)
      }
      setSelectedTime('') // Reset time when date changes
      setLoadingSlots(false)
    }
    
    fetchSlots()
  }, [selectedDate, selectedDoctorId, editAppointmentId])

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId)

  // Determine current fee
  let currentFee = 350
  if (selectedDoctor) {
    if (appointmentType === 'clinic_normal') currentFee = selectedDoctor.fees_normal || 350
    if (appointmentType === 'clinic_urgent') currentFee = selectedDoctor.fees_urgent || 500
    if (appointmentType === 'home_visit') currentFee = selectedDoctor.fees_home_visit || 1000
  }

  // Generate next 30 days
  const getNext30Days = () => {
    const days = []
    for (let i = 0; i < 30; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      days.push({
        dateObj: d,
        value: d.toISOString().split('T')[0],
        dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        month: d.toLocaleDateString('en-US', { month: 'short' })
      })
    }
    return days
  }

  // Generate 30-min slots based on doctor's working hours
  const getAvailableTimeSlots = () => {
    if (!selectedDoctor || !selectedDate) return []
    const dateObj = new Date(selectedDate)
    const dayKey = DAYS[dateObj.getDay()]
    const hours = typeof selectedDoctor.working_hours === 'string' ? JSON.parse(selectedDoctor.working_hours) : (selectedDoctor.working_hours || {})
    const dayHours = hours[dayKey]
    
    if (!dayHours || dayHours === 'Closed') return []

    const [start, end] = dayHours.split('-')
    if (!start || !end) return []

    const slots = []
    let [h, m] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)

    while (h < eh || (h === eh && m < em)) {
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
      
      // Skip past times if today
      const now = new Date()
      const isToday = selectedDate === now.toISOString().split('T')[0]
      const isPast = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))

      if (!isPast) {
        slots.push({
          time: timeStr,
          isBooked: bookedSlots.includes(timeStr)
        })
      }

      m += 30
      if (m >= 60) {
        h++
        m -= 60
      }
    }
    return slots
  }

  const handleBooking = async () => {
    if (!selectedDoctor || !selectedDate || !selectedTime) return
    setBooking(true)
    
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Construct full DateTime
    const [h, m] = selectedTime.split(':').map(Number)
    const finalDate = new Date(selectedDate)
    finalDate.setHours(h, m, 0, 0)
    
    const autoConfirm = selectedDoctor.auto_confirm_appointments === true
    let newStatus = autoConfirm ? 'scheduled' : 'waiting'
    
    // If staff is rescheduling, it MUST be 'proposed' (waiting for patient)
    if (isStaff && editAppointmentId) {
      newStatus = 'proposed'
    }

    let error;

    if (editAppointmentId) {
      // Edit existing
      const { error: updateError } = await supabase.from('appointments').update({
        scheduled_time: finalDate.toISOString(),
        status: newStatus // Rescheduling drops it back to waiting, unless auto-confirm is enabled
      }).eq('id', editAppointmentId)
      error = updateError
    } else {
      // Calculate queue position for the selected doctor and date just as index
      const { count } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', selectedDoctor.id)
        .gte('scheduled_time', new Date(selectedDate).toISOString())
        .lte('scheduled_time', new Date(new Date(selectedDate).setHours(23,59,59)).toISOString())

      const nextPosition = (count || 0) + 1

      // Create new appointment
      const { error: insertError } = await supabase.from('appointments').insert({
        patient_id: user.id,
        doctor_id: selectedDoctor.id,
        scheduled_time: finalDate.toISOString(),
        queue_position: nextPosition,
        fees: currentFee,
        appointment_type: appointmentType,
        status: newStatus,
        payment_status: paymentChoice === 'prepay' ? 'pending' : 'pending' // Usually pending at creation
      })
      error = insertError
    }

    if (!error) {
      onSuccess()
    } else {
      alert("Error booking appointment: " + error.message)
    }
    setBooking(false)
  }

  const timeSlots = getAvailableTimeSlots()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
          <h2 className="text-xl font-bold">
            {editAppointmentId ? 'Reschedule Appointment' : (step === 3 ? 'Confirm & Secure Booking' : t('book_appointment'))}
          </h2>
          <button onClick={onClose} className="p-2 bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors shadow-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content Area - Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
               <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
               <p className="text-gray-400 font-medium tracking-wide">Loading doctors...</p>
            </div>
          ) : doctors.length === 0 ? (
            <div className="py-20 text-center text-gray-500">{t('no_doctors')}</div>
          ) : (
            <>
              {/* Step 1: Doctor & Type Selection */}
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">{t('select_doctor')}</label>
                    <select 
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      className="w-full rounded-xl px-4 py-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-blue-600 outline-none font-bold transition-all appearance-none"
                      disabled={!!editAppointmentId} // Cannot change doctor when rescheduling
                    >
                      <option value="">-- Choose a Doctor --</option>
                      {doctors.map(doc => (
                        <option key={doc.id} value={doc.id}>Dr. {doc.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedDoctor && (
                    <div className="space-y-3">
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500">Visit Type</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {selectedDoctor.fees_normal !== 0 && selectedDoctor.fees_normal !== null && (
                          <button 
                            onClick={() => setAppointmentType('clinic_normal')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'clinic_normal' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-blue-200'}`}
                          >
                            <span className="text-2xl mb-2">🏥</span>
                            <p className="font-bold text-center">Clinic Visit</p>
                            <span className="font-black text-blue-600 mt-2">{selectedDoctor.fees_normal} EGP</span>
                          </button>
                        )}
                        {selectedDoctor.fees_urgent !== 0 && selectedDoctor.fees_urgent !== null && (
                          <button 
                            onClick={() => setAppointmentType('clinic_urgent')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'clinic_urgent' ? 'border-red-600 bg-red-50 dark:bg-red-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-red-200'}`}
                          >
                            <span className="text-2xl mb-2">⚡</span>
                            <p className="font-bold text-center">Urgent Visit</p>
                            <span className="font-black text-red-600 mt-2">{selectedDoctor.fees_urgent} EGP</span>
                          </button>
                        )}
                        {selectedDoctor.fees_home_visit !== 0 && selectedDoctor.fees_home_visit !== null && (
                          <button 
                            onClick={() => setAppointmentType('home_visit')}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'home_visit' ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-teal-200'}`}
                          >
                            <span className="text-2xl mb-2">🏠</span>
                            <p className="font-bold text-center">Home Visit</p>
                            <span className="font-black text-teal-600 mt-2">{selectedDoctor.fees_home_visit} EGP</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setStep(2)}
                    disabled={!selectedDoctorId}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 mt-4"
                  >
                    Next: Choose Date & Time
                  </button>
                </div>
              )}

              {/* Step 2: Date & Time Selection */}
              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  
                  {/* Horizontal Date Picker */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500">Pick a Day</label>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                      {getNext30Days().map(day => (
                        <button
                          key={day.value}
                          onClick={() => setSelectedDate(day.value)}
                          className={`flex-shrink-0 w-24 h-28 rounded-2xl border-2 flex flex-col items-center justify-center snap-start transition-all ${
                            selectedDate === day.value 
                              ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                              : 'border-gray-100 dark:border-gray-800 text-gray-500 hover:border-blue-300 dark:hover:border-blue-800'
                          }`}
                        >
                          <span className={`text-xs font-bold uppercase mb-1 ${selectedDate === day.value ? 'text-blue-100' : ''}`}>{day.dayName}</span>
                          <span className="text-2xl font-black">{day.dayNum}</span>
                          <span className={`text-xs font-bold mt-1 ${selectedDate === day.value ? 'text-blue-100' : ''}`}>{day.month}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Slots */}
                  {selectedDate && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                       <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-6">
                        <label className="text-xs font-black uppercase tracking-widest text-gray-500">Available Time Slots</label>
                      </div>
                      
                      {loadingSlots ? (
                        <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div></div>
                      ) : (
                        timeSlots.length === 0 ? (
                           <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
                             <span className="text-3xl mb-2 block">🏖️</span>
                             <p className="font-bold">Doctor is not available</p>
                             <p className="text-xs text-gray-500 mt-1">Please select another day</p>
                           </div>
                        ) : (
                          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                            {timeSlots.map(slot => (
                              <button
                                key={slot.time}
                                disabled={slot.isBooked}
                                onClick={() => setSelectedTime(slot.time)}
                                className={`
                                  py-3 px-2 rounded-xl border-2 font-black transition-all text-sm
                                  ${slot.isBooked 
                                      ? 'border-gray-100 bg-gray-50 text-gray-300 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-700 cursor-not-allowed' 
                                      : selectedTime === slot.time 
                                          ? 'border-green-600 bg-green-600 text-white shadow-lg shadow-green-500/30' 
                                          : 'border-green-200 bg-green-50 text-green-700 hover:border-green-400 hover:bg-green-100 dark:border-green-900/30 dark:bg-green-900/10 dark:text-green-400'
                                  }
                                `}
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                    {initialDoctor && !editAppointmentId ? null : (
                      <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-4 rounded-2xl hover:bg-gray-200">Back</button>
                    )}
                    <button 
                      onClick={() => editAppointmentId ? handleBooking() : setStep(3)} // Skip payment step if editing
                      disabled={!selectedDate || !selectedTime || booking}
                      className={`${initialDoctor && !editAppointmentId ? 'w-full' : 'flex-[2]'} bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 disabled:opacity-50 flex justify-center items-center`}
                    >
                      {editAppointmentId ? (booking ? 'Confirming...' : 'Confirm Reschedule') : 'Next: Payment'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment Choice & Confirmation */}
              {step === 3 && !editAppointmentId && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 text-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between py-1"><span className="text-gray-500">Doctor</span><span className="font-bold">Dr. {selectedDoctor?.full_name}</span></div>
                    <div className="flex justify-between py-1"><span className="text-gray-500">Date & Time</span><span className="font-bold">{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {selectedTime}</span></div>
                    <div className="flex justify-between py-1 border-t border-gray-200 dark:border-gray-700 mt-2 pt-2"><span className="text-gray-500">Total Fees</span><span className="font-black text-blue-600 text-lg">{currentFee} EGP</span></div>
                  </div>

                  {/* Payment choice */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">How would you like to pay?</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPaymentChoice('prepay')}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${paymentChoice === 'prepay' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-blue-200'}`}
                      >
                        <div className="text-2xl mb-1">💳</div>
                        <p className="font-bold text-sm">Prepay (InstaPay)</p>
                        <p className="text-[10px] text-gray-500 mt-1">Secure your slot now</p>
                      </button>
                      <button
                        onClick={() => setPaymentChoice('pay_at_visit')}
                        className={`p-4 rounded-xl border-2 text-center transition-all ${paymentChoice === 'pay_at_visit' ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-teal-200'}`}
                      >
                        <div className="text-2xl mb-1">🏥</div>
                        <p className="font-bold text-sm">Pay at Visit</p>
                        <p className="text-[10px] text-gray-500 mt-1">Pay when you arrive</p>
                      </button>
                    </div>
                  </div>

                  {/* InstaPay QR shown only for prepay */}
                  {paymentChoice === 'prepay' && selectedDoctor?.instapay_address && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-5 text-center animate-in zoom-in-95">
                      <h3 className="font-black text-blue-900 dark:text-blue-100 text-lg mb-3">Pay via InstaPay</h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                        Send <strong className="font-black">{currentFee} EGP</strong> to the doctor's InstaPay to secure your slot.
                      </p>
                      <div className="bg-white dark:bg-gray-900 rounded-xl p-4 inline-block shadow-sm">
                        <QRCodeSVG 
                          value={`instapay://payment?address=${selectedDoctor.instapay_address}&amount=${currentFee}`} 
                          size={120} bgColor="#ffffff" fgColor="#000000" 
                        />
                        <p className="text-xs font-bold text-gray-500 mt-3 break-all">{selectedDoctor.instapay_address}</p>
                      </div>
                    </div>
                  )}

                  {paymentChoice === 'pay_at_visit' && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-5 text-center animate-in zoom-in-95">
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        ⚠️ You will need to pay <strong className="font-black">{currentFee} EGP</strong> at the clinic. The doctor may cancel your slot if you don't show up.
                      </p>
                    </div>
                  )}

                  {/* Auto-confirm badge */}
                  {selectedDoctor?.auto_confirm_appointments && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-xl">
                      <span className="text-green-600 text-lg">⚡</span>
                      <p className="text-sm text-green-700 dark:text-green-300 font-medium">This doctor has <strong>auto-confirm</strong> enabled. Your appointment will be confirmed instantly!</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setStep(2)} disabled={booking} className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-4 rounded-2xl hover:bg-gray-200">Back</button>
                    <button 
                      onClick={handleBooking}
                      disabled={booking}
                      className="flex-[2] bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 disabled:opacity-50"
                    >
                      {booking ? 'Confirming...' : 'Confirm Booking'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
