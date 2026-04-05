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
  status?: string
  scheduled_time?: string
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
}

type Certification = {
  id: string
  title: string
  description: string | null
  issued_at: string
  doctor_name: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  waiting: { label: 'Pending Approval', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '🕐' },
  scheduled: { label: 'Approved', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '✅' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '🔵' },
  completed: { label: 'Completed', color: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', icon: '☑️' },
  cancelled: { label: 'Rejected', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '❌' },
}

export default function PatientDashboard({
  initialAppointments,
  initialDoctors
}: {
  initialAppointments: AppointmentProps[]
  initialDoctors: DoctorInfo[]
}) {
  const t = useTranslations('Dashboard')
  const [appointments, setAppointments] = useState(initialAppointments)
  const [showBooking, setShowBooking] = useState(false)
  const [activeTab, setActiveTab] = useState<'bookings' | 'doctors' | 'certs'>('bookings')
  const [doctors, setDoctors] = useState<DoctorInfo[]>(initialDoctors)
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorInfo | null>(initialDoctors[0] || null)
  const [allDoctors, setAllDoctors] = useState<DoctorInfo[]>([])
  const [showAddDoctor, setShowAddDoctor] = useState(false)
  const [searching, setSearching] = useState(false)
  const [certs, setCerts] = useState<Certification[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)
  const [addingDoctor, setAddingDoctor] = useState<string | null>(null)

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
      console.error('[AddDoctor] Error:', err)
      if (err.message?.includes('schema cache') || err.message?.includes('patient_doctors')) {
        alert("The doctors table hasn't been set up yet. Please ask your admin to run the database setup SQL in Supabase.")
      } else {
        alert("Failed to add doctor: " + (err.message || "Unknown error"))
      }
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

  // Separate active from past
  const activeAppointments = appointments.filter(a => ['waiting', 'scheduled', 'in_progress'].includes(a.status || ''))
  const pastAppointments = appointments.filter(a => ['completed', 'cancelled'].includes(a.status || ''))

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
      {/* Tab Nav */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        {[
          { key: 'bookings', label: `My Bookings (${activeAppointments.length})` },
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

      {/* Bookings Tab */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          {/* Book New Button */}
          <button
            onClick={() => setShowBooking(true)}
            className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Book New Appointment
          </button>

          {/* Active Appointments */}
          {activeAppointments.length === 0 && pastAppointments.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
              <div className="text-5xl mb-4">📅</div>
              <h3 className="text-xl font-bold">{t('no_appointment')}</h3>
              <p className="text-gray-500 mt-2">You don't have any bookings yet. Book your first appointment above!</p>
            </div>
          ) : (
            <>
              {activeAppointments.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Active Bookings</h3>
                  {activeAppointments.map(apt => {
                    const cfg = STATUS_CONFIG[apt.status || 'waiting']
                    const isPending = apt.status === 'waiting'
                    const needsPayment = apt.payment_status === 'pending' && apt.status === 'scheduled'
                    
                    return (
                      <div key={apt.id} className={`bg-white dark:bg-gray-900 rounded-2xl p-5 border ${isPending ? 'border-amber-200 dark:border-amber-800' : needsPayment ? 'border-blue-200 dark:border-blue-800' : 'border-gray-100 dark:border-gray-800'} shadow-sm`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">{cfg.icon}</span>
                              <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{needsPayment ? '💳 Awaiting Payment' : cfg.label}</span>
                            </div>
                            <h4 className="font-bold text-lg">Dr. {apt.doctor_name}</h4>
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                              <span>📅 {apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD'}</span>
                              <span className="capitalize">🏥 {(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                              <span>💰 {apt.fees} EGP</span>
                              {apt.queue_position > 0 && apt.status === 'scheduled' && <span>🔢 Queue #{apt.queue_position}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Payment section for approved appointments */}
                        {needsPayment && apt.instapay_address && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-center">
                              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-3">
                                Pay <strong className="font-black">{apt.fees} EGP</strong> via InstaPay to secure your slot
                              </p>
                              <div className="bg-white dark:bg-gray-900 rounded-lg p-3 inline-block shadow-sm">
                                <QRCodeSVG value={`instapay://payment?address=${apt.instapay_address}&amount=${apt.fees}`} size={100} bgColor="#ffffff" fgColor="#000000" />
                                <p className="text-xs font-bold text-gray-500 mt-2 break-all">{apt.instapay_address}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Past Appointments */}
              {pastAppointments.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mt-8">Past Bookings</h3>
                  {pastAppointments.map(apt => {
                    const cfg = STATUS_CONFIG[apt.status || 'completed']
                    return (
                      <div key={apt.id} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm opacity-75">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">{cfg.icon}</span>
                              <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                            </div>
                            <h4 className="font-bold text-lg">Dr. {apt.doctor_name}</h4>
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                              <span>📅 {apt.scheduled_time ? new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'N/A'}</span>
                              <span className="capitalize">🏥 {(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                              <span>💰 {apt.fees} EGP</span>
                            </div>
                            {/* Rejection reason */}
                            {apt.status === 'cancelled' && apt.rejection_reason && (
                              <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/50">
                                <p className="text-sm text-red-700 dark:text-red-300">
                                  <span className="font-bold">Rejected{apt.reviewer_name ? ` by Dr. ${apt.reviewer_name}` : ''}:</span> {apt.rejection_reason}
                                </p>
                              </div>
                            )}
                            {apt.status === 'cancelled' && !apt.rejection_reason && apt.reviewer_name && (
                              <p className="mt-2 text-sm text-red-600">Rejected by Dr. {apt.reviewer_name}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
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
          
          {doctors.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
              <div className="text-5xl mb-4">👨‍⚕️</div>
              <h3 className="text-xl font-bold">No Doctors Yet</h3>
              <p className="text-gray-500 mt-2 mb-6">Add your first doctor to start booking appointments.</p>
              <button onClick={() => setShowAddDoctor(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">Add My First Doctor</button>
            </div>
          ) : (
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
          )}
          
          {showAddDoctor && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl">
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black">Add Doctor</h3>
                   <button onClick={() => setShowAddDoctor(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                 </div>
                 <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                   {searching ? <p className="text-center py-4">Searching...</p> : allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).map(doc => (
                     <div key={doc.id} className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                       <div>
                         <p className="font-bold">Dr. {doc.full_name}</p>
                         <p className="text-xs text-blue-600 font-medium">{doc.specialization}</p>
                       </div>
                       <button 
                         disabled={addingDoctor !== null}
                         onClick={() => handleAddDoctor(doc.id)}
                         className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                       >
                         {addingDoctor === doc.id ? 'Adding...' : 'Add'}
                       </button>
                     </div>
                   ))}
                   {!searching && allDoctors.filter(d => !doctors.find(myD => myD.id === d.id)).length === 0 && (
                     <p className="text-center py-8 text-gray-400 italic text-sm">No new doctors found.</p>
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
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0 text-lg">📋</div>
                    <div>
                      <p className="font-bold">{cert.title}</p>
                      {cert.description && <p className="text-sm text-gray-500 mt-1">{cert.description}</p>}
                      <p className="text-xs text-gray-400 mt-2">Issued by Dr. {cert.doctor_name} • {new Date(cert.issued_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Booking Modal */}
      {showBooking && <BookingModal onClose={() => setShowBooking(false)} onSuccess={() => window.location.reload()} />}
    </div>
  )
}
