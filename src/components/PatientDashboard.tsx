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

type DoctorInfo = {
  id: string
  full_name: string
  specialization: string | null
  clinic_location: string | null
  working_hours: any
  phone_number: string | null
}

type Certification = {
  id: string
  title: string
  description: string | null
  issued_at: string
  doctor_name: string
}

export default function PatientDashboard({
  initialAppointment,
  doctorId
}: {
  initialAppointment: AppointmentProps | null
  doctorId?: string | null
}) {
  const t = useTranslations('Dashboard')
  const [appointment, setAppointment] = useState(initialAppointment)
  const [currentServing, setCurrentServing] = useState(1)
  const [showBooking, setShowBooking] = useState(false)
  const [activeTab, setActiveTab] = useState<'queue' | 'doctor' | 'certs'>('queue')
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null)
  const [certs, setCerts] = useState<Certification[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'appointments',
        filter: `doctor_id=eq.${appointment?.doctor_id}`,
      }, (payload: any) => {
        if (payload.new?.status === 'in_progress') setCurrentServing(payload.new.queue_position || 1)
        if (payload.new?.id === appointment?.id) setAppointment(prev => prev ? { ...prev, ...payload.new } : null)
      }).subscribe()

    const fetchCurrentServing = async () => {
      if (!appointment?.doctor_id) return
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
      const { data } = await supabase.from('appointments').select('queue_position').eq('doctor_id', appointment.doctor_id).eq('status', 'in_progress').gte('scheduled_time', startOfDay.toISOString()).order('scheduled_time', { ascending: false }).limit(1).single()
      if (data?.queue_position) setCurrentServing(data.queue_position)
    }
    fetchCurrentServing()
    return () => { supabase.removeChannel(channel) }
  }, [appointment?.doctor_id, appointment?.id])

  // Fetch doctor info
  useEffect(() => {
    const fetchDoctor = async () => {
      const did = appointment?.doctor_id || doctorId
      if (!did) return
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, specialization, clinic_location, working_hours, phone_number')
        .eq('id', did)
        .single()
      if (data) setDoctor(data)
    }
    fetchDoctor()
  }, [appointment?.doctor_id, doctorId])

  // Fetch certifications
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

  const DAYS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

  if (!appointment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-700 space-y-6">
        {doctor && (
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl font-black">
                {doctor.full_name?.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-lg">Dr. {doctor.full_name}</p>
                {doctor.specialization && <p className="text-sm text-blue-600 font-medium">{doctor.specialization}</p>}
              </div>
            </div>
            {doctor.clinic_location && <p className="text-xs text-gray-500">📍 {doctor.clinic_location}</p>}
          </div>
        )}
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 mx-auto">
            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold mb-2">{t('no_appointment')}</h3>
          <button
            onClick={() => setShowBooking(true)}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full transition-all shadow-md font-bold"
          >
            {t('book_now')}
          </button>
        </div>
        {showBooking && <BookingModal onClose={() => setShowBooking(false)} onSuccess={() => window.location.reload()} />}
      </div>
    )
  }

  const patientsAhead = Math.max(0, appointment.queue_position - currentServing)
  const waitTimeMins = patientsAhead * 20
  const instapayAddress = appointment.instapay_address || 'placeholder@instapay'
  const qrData = `instapay://payment?address=${instapayAddress}&amount=${appointment.fees}`

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
      {/* Tab Nav */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        {[
          { key: 'queue', label: 'My Queue' },
          { key: 'doctor', label: 'My Doctor' },
          { key: 'certs', label: 'Certificates' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab.key ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">{t('current_serving')}</p>
              <div className="text-6xl font-black text-slate-800 dark:text-slate-100">{currentServing}</div>
            </div>
            <div className="bg-gradient-to-br from-blue-600 to-teal-500 rounded-3xl p-6 shadow-xl shadow-blue-500/20 relative overflow-hidden text-white">
              <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
              <p className="text-sm font-medium text-blue-100 mb-1">{t('your_turn')}</p>
              <div className="text-6xl font-black">{appointment.queue_position}</div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-gray-800 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">{t('est_wait')}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-orange-500">{waitTimeMins}</span>
                <span className="text-lg font-bold text-gray-400">{t('mins')}</span>
              </div>
              {patientsAhead === 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-wider">
                  <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
                  It's your turn!
                </div>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-800 md:flex items-center gap-8">
            <div className="flex-1 mb-8 md:mb-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-sm font-bold mb-4">InstaPay</div>
              <h3 className="text-3xl font-bold mb-2">{t('pay_instapay')}</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md">
                Scan the QR code with your Egyptian InstaPay app to settle your <strong>{appointment.fees} EGP</strong> fee with Dr. {appointment.doctor_name}.
              </p>
            </div>
            <div className="bg-white p-4 rounded-3xl shadow-lg border-4 border-purple-50 shrink-0">
              <QRCodeSVG value={qrData} size={180} bgColor="#ffffff" fgColor="#000000" level="Q" includeMargin={false} />
              <div className="text-center mt-3 text-xs font-bold text-gray-400 tracking-wider">{t('scan_qr', { fees: appointment.fees })}</div>
            </div>
          </div>
        </div>
      )}

      {/* My Doctor Tab */}
      {activeTab === 'doctor' && (
        <div className="space-y-6">
          {doctor ? (
            <>
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-sm border border-gray-100 dark:border-gray-800">
                <div className="flex items-start gap-6">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center text-3xl font-black shrink-0">
                    {doctor.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-black">Dr. {doctor.full_name}</h2>
                    {doctor.specialization && (
                      <span className="inline-block mt-1 text-sm font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full">{doctor.specialization}</span>
                    )}
                    {doctor.phone_number && (
                      <p className="mt-3 text-sm text-gray-500">📞 {doctor.phone_number}</p>
                    )}
                    {doctor.clinic_location && (
                      <p className="mt-1 text-sm text-gray-500">📍 {doctor.clinic_location}</p>
                    )}
                  </div>
                </div>
              </div>

              {doctor.working_hours && (
                <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Working Hours</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(DAYS).map(([key, label]) => {
                      const val = (doctor.working_hours || {})[key] || 'Closed'
                      const isClosed = val === 'Closed'
                      return (
                        <div key={key} className={`flex justify-between items-center p-3 rounded-xl ${isClosed ? 'bg-gray-50 dark:bg-gray-800/50' : 'bg-blue-50 dark:bg-blue-900/20'}`}>
                          <span className="text-sm font-bold">{label}</span>
                          <span className={`text-sm font-medium ${isClosed ? 'text-gray-400' : 'text-blue-700 dark:text-blue-300'}`}>{val}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-20 text-center text-gray-400 italic">No doctor info available.</div>
          )}
        </div>
      )}

      {/* Certifications Tab */}
      {activeTab === 'certs' && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold">My Certifications</h3>
            <p className="text-sm text-gray-500">Medical certificates issued to you by your doctor.</p>
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0 text-lg">📋</div>
                      <div>
                        <p className="font-bold">{cert.title}</p>
                        {cert.description && <p className="text-sm text-gray-500 mt-1">{cert.description}</p>}
                        <p className="text-xs text-gray-400 mt-2">Issued by Dr. {cert.doctor_name} • {new Date(cert.issued_at).toLocaleDateString()}</p>
                      </div>
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
}
