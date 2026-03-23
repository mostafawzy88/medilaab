'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type Doctor = {
  id: string
  full_name: string
  instapay_address: string | null
}

type BookingModalProps = {
  onClose: () => void
  onSuccess: () => void
}

export default function BookingModal({ onClose, onSuccess }: BookingModalProps) {
  const t = useTranslations('Dashboard')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [selectedDoctor, setSelectedDoctor] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [booking, setBooking] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDoctors = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, instapay_address')
        .eq('role', 'doctor')
      
      if (data) setDoctors(data)
      setLoading(false)
    }
    fetchDoctors()
  }, [])

  const handleBooking = async () => {
    if (!selectedDoctor) return
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
      .eq('doctor_id', selectedDoctor)
      .gte('scheduled_time', startOfDay.toISOString())
      .lte('scheduled_time', endOfDay.toISOString())

    const nextPosition = (count || 0) + 1

    // Create appointment
    const { error } = await supabase.from('appointments').insert({
      patient_id: user.id,
      doctor_id: selectedDoctor,
      scheduled_time: new Date(selectedDate).toISOString(),
      queue_position: nextPosition,
      fees: 300.00, // Default fee
      status: 'scheduled'
    })

    if (!error) {
      onSuccess()
    } else {
      alert("Error booking appointment: " + error.message)
    }
    setBooking(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-md">
          <h2 className="text-xl font-bold">{t('book_appointment')}</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-10 text-center animate-pulse text-gray-400">Loading doctors...</div>
          ) : doctors.length === 0 ? (
            <div className="py-10 text-center text-gray-500">{t('no_doctors')}</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('select_doctor')}</label>
                <select 
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- {t('select_doctor')} --</option>
                  {doctors.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">{t('select_date')}</label>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <button 
                    onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                    className={`py-3 rounded-xl border font-medium transition-all ${selectedDate === new Date().toISOString().split('T')[0] ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    {t('today')}
                  </button>
                  <button 
                    onClick={() => {
                      const tomorrow = new Date()
                      tomorrow.setDate(tomorrow.getDate() + 1)
                      setSelectedDate(tomorrow.toISOString().split('T')[0])
                    }}
                    className={`py-3 rounded-xl border font-medium transition-all ${selectedDate !== new Date().toISOString().split('T')[0] ? 'bg-blue-600 border-blue-600 text-white' : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'}`}
                  >
                    {t('tomorrow')}
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleBooking}
                  disabled={!selectedDoctor || booking}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
                >
                  {booking ? 'Booking...' : t('confirm_booking')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
