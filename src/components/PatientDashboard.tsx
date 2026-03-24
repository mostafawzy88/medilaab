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
  payment_status?: string
  appointment_type?: string
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
  initialDoctors
}: {
  initialAppointment: AppointmentProps | null
  initialDoctors: DoctorInfo[]
}) {
  const t = useTranslations('Dashboard')
  const [appointment, setAppointment] = useState(initialAppointment)
  const [currentServing, setCurrentServing] = useState(1)
  const [showBooking, setShowBooking] = useState(false)
  const [activeTab, setActiveTab] = useState<'queue' | 'doctors' | 'certs'>('queue')
  const [doctors, setDoctors] = useState<DoctorInfo[]>(initialDoctors)
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorInfo | null>(initialDoctors[0] || null)
  const [allDoctors, setAllDoctors] = useState<DoctorInfo[]>([])
  const [showAddDoctor, setShowAddDoctor] = useState(false)
  const [searching, setSearching] = useState(false)
  const [certs, setCerts] = useState<Certification[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)
  const [updatingPayment, setUpdatingPayment] = useState(false)

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

  const handleAddDoctor = async (docId: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('patient_doctors').insert({ patient_id: user.id, doctor_id: docId })
    if (!error) {
      const newDoc = allDoctors.find(d => d.id === docId)
      if (newDoc) setDoctors(prev => [...prev, newDoc])
      setShowAddDoctor(false)
    }
  }

  const handleRemoveDoctor = async (docId: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('patient_doctors').delete().eq('patient_id', user.id).eq('doctor_id', docId)
    if (!error) setDoctors(prev => prev.filter(d => d.id !== docId))
  }

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

  const handleMarkAsPaid = async () => {
    if (!appointment) return
    setUpdatingPayment(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: 'paid' })
      .eq('id', appointment.id)
    
    if (!error) {
      setAppointment({ ...appointment, payment_status: 'paid' })
    } else {
      alert("Error updating payment status: " + error.message)
    }
    setUpdatingPayment(false)
  }

  const DAYS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

  if (!appointment && doctors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-in fade-in duration-700 space-y-6 text-center">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6 mx-auto text-4xl">👨‍⚕️</div>
        <h3 className="text-2xl font-black">{t('no_appointment')}</h3>
        <p className="text-gray-500 max-w-sm">You haven't added any doctors to your list yet. Start by adding a doctor to book your first appointment.</p>
        <button
          onClick={() => setShowAddDoctor(true)}
          className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl transition-all shadow-md font-bold"
        >
          Add My First Doctor
        </button>
        {showAddDoctor && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
             <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black">Add Doctor</h3>
                 <button onClick={() => setShowAddDoctor(false)} className="text-gray-400 hover:text-gray-600">✕</button>
               </div>
               <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                 {searching ? <p className="text-center py-4">Searching...</p> : allDoctors.map(doc => (
                   <button key={doc.id} onClick={() => handleAddDoctor(doc.id)} className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 hover:border-blue-500 text-left transition-all">
                     <p className="font-bold">Dr. {doc.full_name}</p>
                     <p className="text-xs text-blue-600">{doc.specialization}</p>
                   </button>
                 ))}
               </div>
             </div>
           </div>
        )}
      </div>
    )
  }

  const patientsAhead = appointment ? Math.max(0, appointment.queue_position - currentServing) : 0
  const waitTimeMins = patientsAhead * 20
  const instapayAddress = appointment?.instapay_address || 'placeholder@instapay'
  const qrData = appointment ? `instapay://payment?address=${instapayAddress}&amount=${appointment.fees}` : ''

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
      {/* Tab Nav */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        {[
          { key: 'queue', label: 'My Queue' },
          { key: 'doctors', label: 'My Doctors' },
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
          {!appointment ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
               <div className="text-5xl mb-4">📅</div>
               <h3 className="text-xl font-bold">{t('no_appointment')}</h3>
               <p className="text-gray-500 mt-2 mb-6">Choose one of your doctors to book a visit.</p>
               <button onClick={() => setActiveTab('doctors')} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Go to My Doctors</button>
            </div>
          ) : appointment.payment_status === 'pending' ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-900/50 rounded-3xl p-8 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-300 rounded-full flex items-center justify-center mx-auto mb-4 font-black text-3xl">!</div>
              <h3 className="text-2xl font-black text-amber-900 dark:text-amber-100 mb-2">Payment Required</h3>
              <p className="text-amber-800 dark:text-amber-200 max-w-lg mx-auto mb-8">
                Your appointment is currently <strong className="font-black uppercase tracking-widest">Pending</strong>. You must settle the {appointment.fees} EGP fee to secure your slot and view your live queue status.
              </p>

              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm inline-block mx-auto mb-8 border border-amber-100 dark:border-gray-800">
                <QRCodeSVG value={qrData} size={150} bgColor="#ffffff" fgColor="#000000" />
                <p className="text-sm font-bold text-gray-500 mt-4 break-all">{instapayAddress}</p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold mt-2">InstaPay</div>
              </div>

              <div>
                <button 
                  onClick={handleMarkAsPaid}
                  disabled={updatingPayment}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black py-4 px-10 rounded-2xl shadow-lg shadow-amber-500/30 transition-all disabled:opacity-50"
                >
                  {updatingPayment ? 'Updating...' : 'I Have Paid'}
                </button>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 font-bold">Only click this after you have sent the transfer.</p>
              </div>
            </div>
          ) : (
            <>
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
              <div className="bg-green-50 dark:bg-green-900/20 rounded-3xl p-8 shadow-sm border border-green-200 dark:border-green-900/50 flex items-center gap-6">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-800 text-green-600 dark:text-green-300 rounded-full flex items-center justify-center shrink-0 text-xl font-black">✓</div>
                <div>
                  <h3 className="text-xl font-bold text-green-900 dark:text-green-100">Payment Confirmed</h3>
                  <p className="text-green-700 dark:text-green-300">Your slot is secured. You can track your queue status above.</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* My Doctors Tab */}
      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Linked Clinics</h3>
            <button onClick={() => setShowAddDoctor(true)} className="text-xs font-bold text-blue-600">+ Add New Doctor</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {doctors.map(doc => (
              <div key={doc.id} className="bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 relative group">
                <button 
                  onClick={() => handleRemoveDoctor(doc.id)}
                  className="absolute top-4 right-4 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center text-2xl font-black shrink-0">
                    {doc.full_name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-black">Dr. {doc.full_name}</h2>
                    {doc.specialization && (
                      <span className="text-xs font-bold text-blue-600">{doc.specialization}</span>
                    )}
                    <div className="mt-3 flex gap-2">
                       <button 
                         onClick={() => { setSelectedDoctor(doc); setShowBooking(true); }}
                         className="bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
                       >
                         Book Now
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {showAddDoctor && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl">
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black">Add Doctor</h3>
                   <button onClick={() => setShowAddDoctor(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                 </div>
                 <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                   {searching ? <p className="text-center py-4">Searching...</p> : allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).map(doc => (
                     <button key={doc.id} onClick={() => handleAddDoctor(doc.id)} className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 hover:border-blue-500 text-left transition-all">
                       <p className="font-bold">Dr. {doc.full_name}</p>
                       <p className="text-xs text-blue-600">{doc.specialization}</p>
                     </button>
                   ))}
                   {!searching && allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).length === 0 && (
                     <p className="text-center py-8 text-gray-400 italic text-sm">No new doctors found.</p>
                   )}
                 </div>
               </div>
             </div>
          )}
          {showBooking && selectedDoctor && <BookingModal onClose={() => setShowBooking(false)} onSuccess={() => window.location.reload()} />}
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
