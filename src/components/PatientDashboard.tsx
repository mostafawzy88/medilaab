'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import { QRCodeSVG } from 'qrcode.react'
import BookingModal from './BookingModal'

type AppointmentProps = {
  id: string
  doctor_id: string
  queue_position: number
  fees: number
  doctor_name: string
  instapay_address: string | null
}

export default function PatientDashboard({ 
  initialAppointment 
}: { 
  initialAppointment: AppointmentProps | null 
}) {
  const t = useTranslations('Dashboard')
  const [appointment, setAppointment] = useState(initialAppointment)
  const [currentServing, setCurrentServing] = useState(1) // Assuming 1 is serving at start of day
  const [showBooking, setShowBooking] = useState(false)

  // Setup Supabase Realtime for Queue Updates
  useEffect(() => {
    const supabase = createClient()

    // Assuming a simplified model where the doctor's active appointment is broadcasted
    // or we listen to appointment status changes in our table.
    // For this scope, let's track status = 'in_progress' count or explicit event
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `doctor_id=eq.${appointment?.doctor_id}`,
        },
        (payload: any) => {
          // Simplistic logic: When ANY appointment for this doctor updates to 'in_progress'
          // Extract its queue_position to update 'currentServing'
          if (payload.new && payload.new.status === 'in_progress') {
            setCurrentServing(payload.new.queue_position || 1)
          }
          // If the patient's OWN appointment changes
          if (payload.new && payload.new.id === appointment?.id) {
            setAppointment((prev) => prev ? { ...prev, ...payload.new } : null)
          }
        }
      )
      .subscribe()

    // Initial fetch to get who is currently being served by this doctor today
    const fetchCurrentServing = async () => {
      if (!appointment?.doctor_id) return
      
      const startOfDay = new Date()
      startOfDay.setHours(0,0,0,0)
      
      const { data } = await supabase
        .from('appointments')
        .select('queue_position')
        .eq('doctor_id', appointment.doctor_id)
        .eq('status', 'in_progress')
        .gte('scheduled_time', startOfDay.toISOString())
        .order('scheduled_time', { ascending: false })
        .limit(1)
        .single()
        
      if (data?.queue_position) {
        setCurrentServing(data.queue_position)
      }
    }
    
    fetchCurrentServing()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [appointment?.doctor_id, appointment?.id])

  if (!appointment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-700">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-2xl font-semibold mb-2">{t('no_appointment')}</h3>
        <button 
          onClick={() => setShowBooking(true)}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full transition-all shadow-md"
        >
          {t('book_now')}
        </button>
        {showBooking && <BookingModal onClose={() => setShowBooking(false)} onSuccess={() => window.location.reload()} />}
      </div>
    )
  }

  // Calculate wait time: 20 mins per patient ahead
  const patientsAhead = Math.max(0, appointment.queue_position - currentServing)
  const waitTimeMins = patientsAhead * 20
  
  // Format InstaPay deep link
  const instapayAddress = appointment.instapay_address || 'placeholder@instapay'
  const qrData = `instapay://payment?address=${instapayAddress}&amount=${appointment.fees}`

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
      {/* Live Queue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{t('current_serving')}</p>
          <div className="text-6xl font-black text-slate-800 dark:text-slate-100">{currentServing}</div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-teal-500 rounded-3xl p-6 shadow-xl shadow-blue-500/20 relative overflow-hidden text-white">
          <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <p className="text-sm font-medium text-blue-100 mb-1">{t('your_turn')}</p>
          <div className="text-6xl font-black">{appointment.queue_position}</div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{t('est_wait')}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-orange-500">{waitTimeMins}</span>
            <span className="text-lg font-bold text-gray-400">{t('mins')}</span>
          </div>
          {patientsAhead === 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              It's your turn!
            </div>
          )}
        </div>
      </div>

      {/* InstaPay Quick Pay */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-800 md:flex items-center gap-8">
        <div className="flex-1 mb-8 md:mb-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-bold mb-4">
            New Feature
          </div>
          <h3 className="text-3xl font-bold mb-2">{t('pay_instapay')}</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md">
            Skip the reception desk. Scan the QR code directly with your Egyptian InstaPay app to settle your <strong>{appointment.fees} EGP</strong> consultation fee with Dr. {appointment.doctor_name}.
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-3xl shadow-lg border-4 border-purple-50 shrink-0">
          <QRCodeSVG 
            value={qrData} 
            size={180} 
            bgColor={"#ffffff"} 
            fgColor={"#000000"} 
            level={"Q"} 
            includeMargin={false}
          />
          <div className="text-center mt-3 text-xs font-bold text-gray-400 tracking-wider">
            {t('scan_qr', { fees: appointment.fees })}
          </div>
        </div>
      </div>
    </div>
  )
}
