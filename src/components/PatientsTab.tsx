'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'

// ─── Types ──────────────────────────────────────────────────────────────────
type Patient = {
  id: string
  full_name: string
  phone_number?: string
  email?: string
  is_manual: boolean
  last_visit?: string
  visit_count?: number
  total_fees?: number
}

type PatientDetail = Patient & {
  appointments: any[]
  prescriptions: any[]
  doctor_note?: string
}

type SortKey = 'full_name' | 'last_visit' | 'visit_count' | 'total_fees'
type SortDir = 'asc' | 'desc'

// ─── Excel Export ─────────────────────────────────────────────────────────
function exportToExcel(patients: Patient[], detailMap: Record<string, PatientDetail>) {
  const rows = patients.map(p => {
    const detail = detailMap[p.id]
    const lastPx = detail?.prescriptions?.[0]
    return {
      'Full Name': p.full_name,
      'Type': p.is_manual ? 'Offline' : 'Registered',
      'Phone': p.phone_number || '',
      'Email': p.email || '',
      'Last Visit': p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '',
      'Total Visits': p.visit_count || 0,
      'Total Fees (EGP)': p.total_fees || 0,
      'Last Diagnosis': lastPx?.diagnosis || '',
      'Last Medications': lastPx?.medications?.map((m: any) => m.name).join(', ') || '',
      'Doctor Notes': detail?.doctor_note || '',
    }
  })

  // Build CSV (no external lib needed)
  const headers = Object.keys(rows[0] || {})
  const csv = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `patients_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Patient Detail Modal ─────────────────────────────────────────────────
function PatientDetailModal({
  patient,
  doctorId,
  onClose,
}: {
  patient: PatientDetail
  doctorId: string
  onClose: (updatedNote?: string) => void
}) {
  const [doctorNote, setDoctorNote] = useState(patient.doctor_note || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'visits' | 'prescriptions'>('overview')

  const handleSaveNote = async () => {
    setSaving(true)
    const supabase = createClient()
    if (patient.is_manual) {
      await supabase.from('manual_patients').update({ doctor_note: doctorNote }).eq('id', patient.id)
    } else {
      // Store note in a doctor-private table keyed by (doctor_id, patient_id)
      await supabase.from('doctor_patient_notes').upsert({
        doctor_id: doctorId,
        patient_id: patient.id,
        note: doctorNote,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'doctor_id,patient_id' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalFees = patient.appointments?.reduce((s, a) => s + (Number(a.fees) || 0), 0) || 0
  const initials = patient.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${patient.is_manual ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
              {initials}
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">{patient.full_name}</h2>
              <span className={`text-xs font-black uppercase tracking-widest ${patient.is_manual ? 'text-amber-500' : 'text-blue-500'}`}>
                {patient.is_manual ? '⚡ Offline Patient' : '✓ Registered User'}
              </span>
            </div>
          </div>
          <button onClick={() => onClose(doctorNote)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
          <div className="text-center">
            <p className="text-2xl font-black text-blue-600">{patient.appointments?.length || 0}</p>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Total Visits</p>
          </div>
          <div className="text-center border-x border-gray-200 dark:border-gray-700">
            <p className="text-2xl font-black text-emerald-600">{totalFees.toLocaleString()} <span className="text-sm">EGP</span></p>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Total Fees</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-purple-600">{patient.prescriptions?.length || 0}</p>
            <p className="text-xs font-bold text-gray-500 mt-0.5">Prescriptions</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
          {(['overview', 'visits', 'prescriptions'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl font-bold text-sm capitalize transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-in fade-in">
              {/* Contact Info */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 space-y-3">
                <h3 className="font-black text-sm uppercase tracking-widest text-gray-400">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📞</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Phone</p>
                      <p className="font-bold text-gray-900 dark:text-white">{patient.phone_number || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📧</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Email</p>
                      <p className="font-bold text-gray-900 dark:text-white break-all">{patient.email || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📅</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">First Seen</p>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {patient.appointments?.[patient.appointments.length - 1]?.scheduled_time
                          ? new Date(patient.appointments[patient.appointments.length - 1].scheduled_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🕐</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Last Visit</p>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {patient.last_visit
                          ? new Date(patient.last_visit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Last Prescription Summary */}
              {patient.prescriptions?.[0] && (
                <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-5 border border-purple-100 dark:border-purple-900/30 space-y-3">
                  <h3 className="font-black text-sm uppercase tracking-widest text-purple-500">Latest Medical Summary</h3>
                  {patient.prescriptions[0].diagnosis && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Diagnosis</p>
                      <p className="font-bold text-gray-900 dark:text-white">{patient.prescriptions[0].diagnosis}</p>
                    </div>
                  )}
                  {patient.prescriptions[0].symptoms && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Symptoms</p>
                      <p className="text-gray-700 dark:text-gray-300">{patient.prescriptions[0].symptoms}</p>
                    </div>
                  )}
                  {patient.prescriptions[0].medications?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Medications</p>
                      <div className="flex flex-wrap gap-2">
                        {patient.prescriptions[0].medications.map((m: any, i: number) => (
                          <span key={i} className="px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-xs font-bold border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300">
                            {m.name} {m.dosage ? `· ${m.dosage}` : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Doctor's Private Note */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm uppercase tracking-widest text-gray-400">🔒 Private Doctor Note</h3>
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-bold">Only visible to you</span>
                </div>
                <textarea
                  value={doctorNote}
                  onChange={e => setDoctorNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl p-4 bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800/50 text-gray-900 dark:text-white outline-none focus:border-amber-400 resize-none text-sm"
                  placeholder="Add private notes about this patient (allergies, preferences, follow-ups)..."
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={saving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Note'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Visits Tab */}
          {activeTab === 'visits' && (
            <div className="space-y-3 animate-in fade-in">
              {patient.appointments?.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic">No visits recorded yet.</div>
              ) : (
                patient.appointments?.map((apt: any) => (
                  <div key={apt.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${apt.status === 'completed' ? 'bg-green-500' : apt.status === 'cancelled' ? 'bg-red-400' : 'bg-blue-500'}`} />
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-sm">
                          {new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-500 capitalize">{apt.appointment_type?.replace('_', ' ')} • {apt.status}</p>
                      </div>
                    </div>
                    <p className="font-black text-gray-900 dark:text-white text-sm flex-shrink-0">{Number(apt.fees || 0).toLocaleString()} EGP</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Prescriptions Tab */}
          {activeTab === 'prescriptions' && (
            <div className="space-y-4 animate-in fade-in">
              {patient.prescriptions?.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic">No prescriptions recorded yet.</div>
              ) : (
                patient.prescriptions?.map((rx: any) => (
                  <div key={rx.id} className="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        {rx.diagnosis && <p className="font-black text-gray-900 dark:text-white">{rx.diagnosis}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(rx.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-full">Rx</span>
                    </div>
                    {rx.symptoms && <p className="text-sm text-gray-600 dark:text-gray-400">{rx.symptoms}</p>}
                    {rx.medications?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {rx.medications.map((m: any, i: number) => (
                          <span key={i} className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-full text-xs font-bold border border-purple-100 dark:border-purple-900/30 text-purple-700 dark:text-purple-300">
                            {m.name}{m.dosage ? ` · ${m.dosage}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {rx.doctor_notes && (
                      <p className="text-sm italic text-gray-500 border-t border-gray-100 dark:border-gray-700 pt-2">"{rx.doctor_notes}"</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main PatientsTab Component ───────────────────────────────────────────
export default function PatientsTab({ doctorId }: { doctorId: string }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('last_visit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filterType, setFilterType] = useState<'all' | 'registered' | 'manual'>('all')
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailCache, setDetailCache] = useState<Record<string, PatientDetail>>({})

  useEffect(() => {
    fetchPatients()
  }, [doctorId])

  const fetchPatients = async () => {
    setLoading(true)
    const supabase = createClient()

    // Fetch manual patients
    const { data: manualData } = await supabase
      .from('manual_patients')
      .select('*')
      .eq('doctor_id', doctorId)

    // Fetch registered patients via appointments
    const { data: apptData } = await supabase
      .from('appointments')
      .select(`
        patient_id, fees, scheduled_time, status,
        patient:profiles!appointments_patient_id_fkey(id, full_name, phone_number, email)
      `)
      .eq('doctor_id', doctorId)
      .not('patient_id', 'is', null)
      .order('scheduled_time', { ascending: false })

    // Aggregate registered patients
    const regMap = new Map<string, Patient>()
    if (apptData) {
      apptData.forEach((a: any) => {
        if (!a.patient) return
        const pid = a.patient.id
        if (!regMap.has(pid)) {
          regMap.set(pid, {
            id: pid, full_name: a.patient.full_name, phone_number: a.patient.phone_number,
            email: a.patient.email, is_manual: false,
            last_visit: a.scheduled_time, visit_count: 1, total_fees: Number(a.fees || 0)
          })
        } else {
          const p = regMap.get(pid)!
          p.visit_count = (p.visit_count || 0) + 1
          p.total_fees = (p.total_fees || 0) + Number(a.fees || 0)
          if (!p.last_visit || a.scheduled_time > p.last_visit) p.last_visit = a.scheduled_time
        }
      })
    }

    // Fetch appointment stats for manual patients
    const manualIds = (manualData || []).map(m => m.id)
    let manualApptMap: Record<string, { last_visit: string; visit_count: number; total_fees: number }> = {}
    if (manualIds.length > 0) {
      const { data: manualApts } = await supabase
        .from('appointments')
        .select('manual_patient_id, fees, scheduled_time')
        .in('manual_patient_id', manualIds)
        .order('scheduled_time', { ascending: false })
      
      if (manualApts) {
        manualApts.forEach((a: any) => {
          const mid = a.manual_patient_id
          if (!manualApptMap[mid]) manualApptMap[mid] = { last_visit: a.scheduled_time, visit_count: 1, total_fees: Number(a.fees || 0) }
          else {
            manualApptMap[mid].visit_count++
            manualApptMap[mid].total_fees += Number(a.fees || 0)
            if (a.scheduled_time > manualApptMap[mid].last_visit) manualApptMap[mid].last_visit = a.scheduled_time
          }
        })
      }
    }

    const manualMapped: Patient[] = (manualData || []).map(m => ({
      id: m.id, full_name: m.full_name, phone_number: m.phone_number, email: m.email,
      is_manual: true, doctor_note: m.doctor_note,
      ...manualApptMap[m.id]
    }))

    setPatients([...manualMapped, ...Array.from(regMap.values())])
    setLoading(false)
  }

  const openPatientDetail = async (patient: Patient) => {
    if (detailCache[patient.id]) {
      setSelectedPatient(detailCache[patient.id])
      return
    }
    setLoadingDetail(true)
    const supabase = createClient()

    // Fetch appointments
    let apptQuery = supabase.from('appointments')
      .select('id, scheduled_time, status, appointment_type, fees, payment_status')
      .eq('doctor_id', doctorId)
      .order('scheduled_time', { ascending: false })

    if (patient.is_manual) apptQuery = apptQuery.eq('manual_patient_id', patient.id)
    else apptQuery = apptQuery.eq('patient_id', patient.id)
    const { data: apts } = await apptQuery

    // Fetch prescriptions
    let rxQuery = supabase.from('prescriptions')
      .select('id, created_at, diagnosis, symptoms, medications, doctor_notes')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })

    if (patient.is_manual) rxQuery = rxQuery.eq('manual_patient_id', patient.id)
    else rxQuery = rxQuery.eq('patient_id', patient.id)
    const { data: rxs } = await rxQuery

    // Fetch doctor note for registered patients
    let doctorNote = (patient as any).doctor_note || ''
    if (!patient.is_manual) {
      const { data: noteData } = await supabase
        .from('doctor_patient_notes')
        .select('note')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patient.id)
        .single()
      if (noteData) doctorNote = noteData.note
    }

    const detail: PatientDetail = { ...patient, appointments: apts || [], prescriptions: rxs || [], doctor_note: doctorNote }
    setDetailCache(prev => ({ ...prev, [patient.id]: detail }))
    setSelectedPatient(detail)
    setLoadingDetail(false)
  }

  const handleDetailClose = (updatedNote?: string) => {
    if (selectedPatient && updatedNote !== undefined) {
      setDetailCache(prev => ({
        ...prev,
        [selectedPatient.id]: { ...selectedPatient, doctor_note: updatedNote }
      }))
    }
    setSelectedPatient(null)
  }

  // Filter + Search + Sort
  const displayed = useMemo(() => {
    let list = patients
    if (filterType !== 'all') list = list.filter(p => filterType === 'manual' ? p.is_manual : !p.is_manual)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter(p =>
        p.full_name.toLowerCase().includes(q) ||
        (p.phone_number || '').includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    }
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey], bv: any = b[sortKey]
      if (sortKey === 'last_visit') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0 }
      if (av == null) av = sortDir === 'asc' ? Infinity : -Infinity
      if (bv == null) bv = sortDir === 'asc' ? Infinity : -Infinity
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
    return list
  }, [patients, filterType, searchTerm, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1 opacity-50">
      {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div className="space-y-5 animate-in fade-in duration-500">

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="Search by name, phone, or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium placeholder-gray-400"
          />
          <svg className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        {/* Filter Type */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex-shrink-0">
          {(['all', 'registered', 'manual'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${filterType === t ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Stats badge */}
        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold flex-shrink-0">
          {displayed.length} / {patients.length} patients
        </div>

        {/* Export button */}
        <button
          onClick={() => exportToExcel(displayed, detailCache)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition-all flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
          <div className="text-5xl mb-4">👤</div>
          <p className="font-bold text-gray-500">No patients match your search.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">
                    <button onClick={() => toggleSort('full_name')} className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                      Patient <SortIcon k="full_name" />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hidden md:table-cell">Contact</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400">
                    <button onClick={() => toggleSort('last_visit')} className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                      Last Visit <SortIcon k="last_visit" />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hidden sm:table-cell">
                    <button onClick={() => toggleSort('visit_count')} className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                      Visits <SortIcon k="visit_count" />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hidden lg:table-cell">
                    <button onClick={() => toggleSort('total_fees')} className="flex items-center hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                      Total (EGP) <SortIcon k="total_fees" />
                    </button>
                  </th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-gray-400 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {displayed.map(p => (
                  <tr
                    key={p.id}
                    className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors cursor-pointer group"
                    onClick={() => openPatientDetail(p)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0 ${p.is_manual ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                          {p.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{p.full_name}</p>
                          <span className={`text-[10px] font-black uppercase ${p.is_manual ? 'text-amber-500' : 'text-blue-500'}`}>
                            {p.is_manual ? 'Offline' : 'Registered'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="text-sm text-gray-900 dark:text-gray-200">{p.phone_number || <span className="text-gray-400 italic text-xs">No phone</span>}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">{p.email || ''}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {p.last_visit ? new Date(p.last_visit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="text-gray-400 italic text-xs">Never</span>}
                      </p>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-black px-2 py-1 rounded-full">
                        {p.visit_count || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell font-bold text-gray-900 dark:text-white text-sm">
                      {(p.total_fees || 0).toLocaleString()} EGP
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                        {loadingDetail ? '...' : 'View →'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Patient Detail Modal */}
      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          doctorId={doctorId}
          onClose={handleDetailClose}
        />
      )}
    </div>
  )
}
