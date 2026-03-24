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
}

type BookingModalProps = {
  onClose: () => void
  onSuccess: () => void
}

export default function BookingModal({ onClose, onSuccess }: BookingModalProps) {
  const t = useTranslations('Dashboard')
  const [step, setStep] = useState(1)
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [appointmentType, setAppointmentType] = useState<'clinic_normal' | 'clinic_urgent' | 'home_visit'>('clinic_normal')
  const [booking, setBooking] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDoctors = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, instapay_address, fees_normal, fees_urgent, fees_home_visit')
        .eq('role', 'doctor')
        .eq('is_authorized', true)
      
      if (data) setDoctors(data)
      setLoading(false)
    }
    fetchDoctors()
  }, [])

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId)

  // Determine current fee
  let currentFee = 350
  if (selectedDoctor) {
    if (appointmentType === 'clinic_normal') currentFee = selectedDoctor.fees_normal || 350
    if (appointmentType === 'clinic_urgent') currentFee = selectedDoctor.fees_urgent || 500
    if (appointmentType === 'home_visit') currentFee = selectedDoctor.fees_home_visit || 1000
  }

  // Generate next 30 days for date picker
  const getNext30Days = () => {
    const days = []
    for (let i = 0; i < 30; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      days.push({
        value: d.toISOString().split('T')[0],
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      })
    }
    return days
  }

  const handleBooking = async () => {
    if (!selectedDoctor || !selectedDate) return
    setBooking(true)
    
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Calculate queue position for the selected doctor and date
    const startOfDay = new Date(selectedDate)
    startOfDay.setHours(0,0,0,0)
    const endOfDay = new Date(selectedDate)
    endOfDay.setHours(23,59,59,999)

    const { count } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', selectedDoctor.id)
      .gte('scheduled_time', startOfDay.toISOString())
      .lte('scheduled_time', endOfDay.toISOString())

    const nextPosition = (count || 0) + 1

    // Create appointment
    const { error } = await supabase.from('appointments').insert({
      patient_id: user.id,
      doctor_id: selectedDoctor.id,
      scheduled_time: new Date(selectedDate).toISOString(),
      queue_position: nextPosition,
      fees: currentFee,
      appointment_type: appointmentType,
      status: 'waiting',
      payment_status: 'pending' // New field enforcing payments
    })

    if (!error) {
      onSuccess()
    } else {
      alert("Error booking appointment: " + error.message)
    }
    setBooking(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-300">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
          <h2 className="text-xl font-bold">{step === 3 ? 'Confirm & Secure Booking' : t('book_appointment')}</h2>
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
                      <div className="grid grid-cols-1 gap-3">
                        {selectedDoctor.fees_normal !== 0 && selectedDoctor.fees_normal !== null && (
                          <button 
                            onClick={() => setAppointmentType('clinic_normal')}
                            className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'clinic_normal' ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-blue-200'}`}
                          >
                            <div className="text-left">
                              <p className="font-bold">Normal Clinic Visit</p>
                              <p className="text-xs text-gray-500">Standard queue</p>
                            </div>
                            <span className="font-black text-blue-600">{selectedDoctor.fees_normal} EGP</span>
                          </button>
                        )}
                        {selectedDoctor.fees_urgent !== 0 && selectedDoctor.fees_urgent !== null && (
                          <button 
                            onClick={() => setAppointmentType('clinic_urgent')}
                            className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'clinic_urgent' ? 'border-red-600 bg-red-50 dark:bg-red-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-red-200'}`}
                          >
                            <div className="text-left">
                              <p className="font-bold">Urgent Visit</p>
                              <p className="text-xs text-gray-500">Priority queue</p>
                            </div>
                            <span className="font-black text-red-600">{selectedDoctor.fees_urgent} EGP</span>
                          </button>
                        )}
                        {selectedDoctor.fees_home_visit !== 0 && selectedDoctor.fees_home_visit !== null && (
                          <button 
                            onClick={() => setAppointmentType('home_visit')}
                            className={`flex justify-between items-center p-4 rounded-xl border-2 transition-all ${appointmentType === 'home_visit' ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-100 dark:border-gray-800 hover:border-teal-200'}`}
                          >
                            <div className="text-left">
                              <p className="font-bold">Home Visit</p>
                              <p className="text-xs text-gray-500">Doctor comes to you</p>
                            </div>
                            <span className="font-black text-teal-600">{selectedDoctor.fees_home_visit} EGP</span>
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
                    Next: Choose Date
                  </button>
                </div>
              )}

              {/* Step 2: Date Selection */}
              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-gray-500">Select Date (Next 30 Days)</label>
                    <select 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full rounded-xl px-4 py-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-blue-600 outline-none font-bold transition-all appearance-none"
                    >
                      <option value="">-- Choose a Date --</option>
                      {getNext30Days().map(day => (
                        <option key={day.value} value={day.value}>{day.label} ({day.value})</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 text-sm">
                    <div className="flex justify-between py-1"><span className="text-gray-500">Doctor</span><span className="font-bold">Dr. {selectedDoctor?.full_name}</span></div>
                    <div className="flex justify-between py-1"><span className="text-gray-500">Visit Type</span><span className="font-bold capitalize">{appointmentType.replace('_', ' ')}</span></div>
                    <div className="flex justify-between py-1 border-t border-gray-200 dark:border-gray-700 mt-2 pt-2"><span className="text-gray-500">Total Fees</span><span className="font-black text-blue-600 text-lg">{currentFee} EGP</span></div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-4 rounded-2xl hover:bg-gray-200">Back</button>
                    <button 
                      onClick={() => setStep(3)}
                      disabled={!selectedDate}
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                      Next: Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment Adherence & Confirmation */}
              {step === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl p-5 text-center">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 rounded-full flex items-center justify-center mx-auto mb-3 font-black text-xl">!</div>
                    <h3 className="font-black text-blue-900 dark:text-blue-100 text-lg mb-2">Payment Required to Secure Slot</h3>
                    <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed mb-4">
                      Doctors require pre-payment to confirm your seriousness. Your appointment will be marked as <strong className="font-black uppercase tracking-widest text-[#d97706]">Pending</strong> until you pay.
                    </p>
                    
                    <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-xl inline-block shadow-sm">
                      <QRCodeSVG 
                        value={`instapay://payment?address=${selectedDoctor?.instapay_address || 'placeholder@instapay'}&amount=${currentFee}`} 
                        size={120} 
                        bgColor="#ffffff" 
                        fgColor="#000000" 
                      />
                      <p className="text-xs font-bold text-gray-500 mt-3 break-all">{selectedDoctor?.instapay_address || 'Not Provided'}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setStep(2)} disabled={booking} className="flex-1 bg-gray-100 dark:bg-gray-800 font-bold py-4 rounded-2xl hover:bg-gray-200">Back</button>
                    <button 
                      onClick={handleBooking}
                      disabled={booking}
                      className="flex-[2] bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/30 disabled:opacity-50"
                    >
                      {booking ? 'Confirming...' : 'I Agree, Book Now'}
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
