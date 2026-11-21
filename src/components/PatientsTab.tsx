'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import PrescriptionViewerModal from './PrescriptionViewerModal'
import PrescriptionModal, { getFormIcon, getFormLabel, inferFormFromName, parseMedicationFormAndDosage, MedicationFormType } from './PrescriptionModal'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'

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
  onWritePrescription,
}: {
  patient: PatientDetail
  doctorId: string
  onClose: (updatedNote?: string) => void
  onWritePrescription: () => void
}) {
  const [doctorNote, setDoctorNote] = useState(patient.doctor_note || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'medications' | 'prescriptions' | 'visits'>('overview')
  const [viewingPrescription, setViewingPrescription] = useState<any | null>(null)
  const [localPrescriptions, setLocalPrescriptions] = useState<any[]>(patient.prescriptions || [])
  const [medCategoryFilter, setMedCategoryFilter] = useState<'all' | MedicationFormType>('all')
  const [showAddMedModal, setShowAddMedModal] = useState(false)

  // Add Medication State
  const [newMedName, setNewMedName] = useState('')
  const [newMedDosage, setNewMedDosage] = useState('')
  const [newMedForm, setNewMedForm] = useState<MedicationFormType>('pill')
  const [newMedInstructions, setNewMedInstructions] = useState('')
  const [newMedDiagnosis, setNewMedDiagnosis] = useState('')
  const [saveToDoctorFavs, setSaveToDoctorFavs] = useState(false)
  const [addingMed, setAddingMed] = useState(false)
  const [medSuccessMsg, setMedSuccessMsg] = useState(false)

  // Doctor's saved medications for autocomplete
  const [doctorFavs, setDoctorFavs] = useState<any[]>([])
  const [matchingFavs, setMatchingFavs] = useState<any[]>([])

  useEffect(() => {
    async function fetchFavs() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('doctor_medications')
          .select('*')
          .eq('doctor_id', doctorId)
          .order('name')
        if (data) {
          setDoctorFavs(data.map(m => {
            const { cleanDosage, form } = parseMedicationFormAndDosage(m.default_dosage, m.name, m.form)
            return {
              ...m,
              default_dosage: cleanDosage,
              form
            }
          }))
        }
      } catch (e) {
        console.warn('Could not fetch doctor favorites:', e)
      }
    }
    fetchFavs()
  }, [doctorId])

  const handleMedNameChange = (val: string) => {
    setNewMedName(val)
    if (newMedForm === 'pill') {
      setNewMedForm(inferFormFromName(val))
    }
    if (val.length > 1) {
      const q = val.toLowerCase()
      setMatchingFavs(doctorFavs.filter(f => f.name.toLowerCase().includes(q)))
    } else {
      setMatchingFavs([])
    }
  }

  const handleSelectFav = (fav: any) => {
    setNewMedName(fav.name)
    setNewMedDosage(fav.default_dosage || '')
    setNewMedForm(fav.form || inferFormFromName(fav.name))
    setMatchingFavs([])
  }

  const handleSaveNote = async () => {
    setSaving(true)
    const supabase = createClient()
    if (patient.is_manual) {
      await supabase.from('manual_patients').update({ doctor_note: doctorNote }).eq('id', patient.id)
    } else {
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

  // Extract all single medication items from all prescriptions
  const allMedications = useMemo(() => {
    const list: any[] = []
    localPrescriptions.forEach(rx => {
      if (!Array.isArray(rx.medications)) return
      rx.medications.forEach((m: any, idx: number) => {
        if (!m.name) return
        const form = (m.form || inferFormFromName(m.name)) as MedicationFormType
        list.push({
          id: `${rx.id}-${idx}`,
          rxId: rx.id,
          name: m.name,
          dosage: m.dosage || '',
          instructions: m.instructions || '',
          form: form,
          date: rx.created_at,
          diagnosis: rx.diagnosis || 'Clinical Prescription',
          doctorNotes: rx.doctor_notes || '',
          doctorName: rx.doctor_name || 'Dr. Attending',
          rawRx: rx
        })
      })
    })
    return list
  }, [localPrescriptions])

  const pillsCount = allMedications.filter(m => m.form === 'pill').length
  const drinkingCount = allMedications.filter(m => m.form === 'drinking').length
  const creamCount = allMedications.filter(m => m.form === 'cream').length
  const injectionCount = allMedications.filter(m => m.form === 'injection').length
  const dropsCount = allMedications.filter(m => m.form === 'drops').length
  const sprayCount = allMedications.filter(m => m.form === 'spray').length

  const filteredMeds = medCategoryFilter === 'all'
    ? allMedications
    : allMedications.filter(m => m.form === medCategoryFilter)

  // Parse Triage Vitals from appointments if present
  const latestVitals = useMemo(() => {
    if (!patient.appointments || patient.appointments.length === 0) return null
    for (const apt of patient.appointments) {
      const notes = apt.notes || ''
      const bpMatch = notes.match(/(?:BP|ضغط|blood pressure)[:\s]*([0-9]{2,3}\/[0-9]{2,3})/i)
      const hrMatch = notes.match(/(?:HR|نبض|pulse|heart rate)[:\s]*([0-9]{2,3})/i)
      const tempMatch = notes.match(/(?:Temp|حرارة|temperature)[:\s]*([0-9]{2}(?:\.[0-9])?)/i)
      const sugarMatch = notes.match(/(?:Sugar|سكر|glucose)[:\s]*([0-9]{2,3})/i)
      const spo2Match = notes.match(/(?:SpO2|أكسجين|oxygen)[:\s]*([0-9]{2,3}%?)/i)

      if (bpMatch || hrMatch || tempMatch || sugarMatch || spo2Match) {
        return {
          bp: bpMatch ? bpMatch[1] : null,
          hr: hrMatch ? `${hrMatch[1]} bpm` : null,
          temp: tempMatch ? `${tempMatch[1]} °C` : null,
          sugar: sugarMatch ? `${sugarMatch[1]} mg/dL` : null,
          spo2: spo2Match ? `${spo2Match[1]}` : null,
          date: apt.scheduled_time
        }
      }
    }
    return null
  }, [patient.appointments])

  const handleDirectAddMedication = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMedName.trim()) return
    setAddingMed(true)
    try {
      const supabase = createClient()
      const medItem = {
        name: newMedName.trim(),
        dosage: newMedDosage.trim(),
        instructions: newMedInstructions.trim(),
        form: newMedForm
      }

      const { data: newRx, error } = await supabase.from('prescriptions').insert({
        patient_id: patient.is_manual ? null : patient.id,
        manual_patient_id: patient.is_manual ? patient.id : null,
        doctor_id: doctorId,
        diagnosis: newMedDiagnosis.trim() || 'Prescribed Medication',
        symptoms: '',
        medications: [medItem],
        doctor_notes: 'Added from Patient Profile'
      }).select().single()

      if (error) {
        alert('Could not save medication: ' + error.message)
        setAddingMed(false)
        return
      }

      if (saveToDoctorFavs) {
        try {
          const cleanDosage = newMedDosage
            .replace(/\[FORM:[a-zA-Z_]+\]/gi, '')
            .replace(/\[(pill|drinking|cream|injection|drops|spray|other)\]/gi, '')
            .trim()
          const payload: any = {
            doctor_id: doctorId,
            name: newMedName.trim(),
            default_dosage: cleanDosage ? `${cleanDosage} [FORM:${newMedForm}]` : `[FORM:${newMedForm}]`,
            common_symptoms: newMedDiagnosis.trim(),
            form: newMedForm
          }
          try {
            const { error: favErr } = await supabase.from('doctor_medications').insert(payload)
            if (favErr) {
              delete payload.form
              await supabase.from('doctor_medications').insert(payload)
            }
          } catch {
            delete payload.form
            await supabase.from('doctor_medications').insert(payload)
          }
        } catch (err) {
          console.warn('Could not save to frequent medications:', err)
        }
      }

      if (newRx) {
        setLocalPrescriptions(prev => [newRx, ...prev])
      }

      setMedSuccessMsg(true)
      setTimeout(() => {
        setMedSuccessMsg(false)
        setShowAddMedModal(false)
        setNewMedName('')
        setNewMedDosage('')
        setNewMedInstructions('')
        setNewMedDiagnosis('')
        setSaveToDoctorFavs(false)
      }, 1000)
    } catch (err) {
      console.error(err)
    } finally {
      setAddingMed(false)
    }
  }

  const totalFees = patient.appointments?.reduce((s, a) => s + (Number(a.fees) || 0), 0) || 0
  const initials = patient.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl border border-gray-100 dark:border-gray-800 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between flex-shrink-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg ${patient.is_manual ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
              {initials}
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>{patient.full_name}</span>
                {patient.phone_number && (
                  <a
                    href={getWhatsAppLink(patient.phone_number, `Hello ${patient.full_name}, this is Dr. from your clinic.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] transition-colors"
                    title="WhatsApp Chat"
                  >
                    <WhatsAppIcon className="w-4 h-4" />
                  </a>
                )}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${patient.is_manual ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                  {patient.is_manual ? '⚡ Offline Patient' : '✓ Registered User'}
                </span>
                <span className="text-xs text-gray-400">• Phone: {patient.phone_number || '—'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onWritePrescription}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs sm:text-sm shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <span>💊</span>
              <span>+ Write Prescription</span>
            </button>
            <button onClick={() => onClose(doctorNote)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Clinical Stats Row */}
        <div className="grid grid-cols-4 gap-2 sm:gap-4 px-6 py-3.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 flex-shrink-0 text-center">
          <div>
            <p className="text-xl sm:text-2xl font-black text-blue-600">{patient.appointments?.length || 0}</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Total Visits</p>
          </div>
          <div className="border-x border-gray-200 dark:border-gray-700">
            <p className="text-xl sm:text-2xl font-black text-emerald-600">{totalFees.toLocaleString()} <span className="text-xs">EGP</span></p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Total Fees</p>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-purple-600">{localPrescriptions.length}</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Prescriptions</p>
          </div>
          <div className="border-l border-gray-200 dark:border-gray-700">
            <p className="text-xl sm:text-2xl font-black text-teal-600">{allMedications.length}</p>
            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Medications</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-gray-900 overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Vitals', icon: '🩺' },
            { id: 'medications', label: `Medications (${allMedications.length})`, icon: '💊' },
            { id: 'prescriptions', label: `Prescriptions (${localPrescriptions.length})`, icon: '📋' },
            { id: 'visits', label: `Visits (${patient.appointments?.length || 0})`, icon: '📅' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all whitespace-nowrap mb-2 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ─────────────────────────────────────────────────────────────
              TAB 1: OVERVIEW & CLINICAL VITALS
             ───────────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in">
              
              {/* Vitals Monitoring Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 via-teal-500/5 to-purple-500/10 border border-blue-500/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💓</span>
                    <h3 className="font-black text-sm uppercase tracking-wider text-blue-900 dark:text-blue-300">
                      Triage Vitals & Clinical Health Matrix
                    </h3>
                  </div>
                  {latestVitals?.date && (
                    <span className="text-[10px] text-gray-500 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-full font-bold">
                      Recorded: {new Date(latestVitals.date).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {latestVitals ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Blood Pressure</p>
                      <p className="text-base font-black text-rose-600 mt-0.5">{latestVitals.bp || '—'}</p>
                      <span className="text-[9px] text-gray-400">mmHg</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Heart Rate</p>
                      <p className="text-base font-black text-emerald-600 mt-0.5">{latestVitals.hr || '—'}</p>
                      <span className="text-[9px] text-gray-400">Pulse</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Body Temp</p>
                      <p className="text-base font-black text-amber-600 mt-0.5">{latestVitals.temp || '—'}</p>
                      <span className="text-[9px] text-gray-400">Celsius</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Blood Sugar</p>
                      <p className="text-base font-black text-indigo-600 mt-0.5">{latestVitals.sugar || '—'}</p>
                      <span className="text-[9px] text-gray-400">Random/Fasting</span>
                    </div>
                    <div className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">SpO2 Oxygen</p>
                      <p className="text-base font-black text-teal-600 mt-0.5">{latestVitals.spo2 || '—'}</p>
                      <span className="text-[9px] text-gray-400">Blood Saturation</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-gray-500 bg-white/60 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                    No recent vitals documented in triage yet. Vitals recorded during queue triage will appear here automatically.
                  </div>
                )}
              </div>

              {/* Patient Contact & Clinical Status */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 space-y-4 border border-gray-100 dark:border-gray-800">
                <h3 className="font-black text-xs uppercase tracking-wider text-gray-400">Patient Details & Communication</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between sm:col-span-2 bg-white dark:bg-gray-800 p-3.5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📞</span>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</p>
                        <p className="font-bold text-gray-900 dark:text-white text-sm">{patient.phone_number || '—'}</p>
                      </div>
                    </div>
                    {patient.phone_number && (
                      <a
                        href={getWhatsAppLink(patient.phone_number, `Hello ${patient.full_name}, this is your clinic following up.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        <WhatsAppIcon className="w-4 h-4 text-white" />
                        <span>WhatsApp Chat</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-xl">📧</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Email Address</p>
                      <p className="font-bold text-gray-900 dark:text-white text-xs break-all">{patient.email || '—'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-xl">📅</span>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Last Visit Date</p>
                      <p className="font-bold text-gray-900 dark:text-white text-xs">
                        {patient.last_visit ? new Date(patient.last_visit).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Latest Medical Summary */}
              {localPrescriptions[0] && (
                <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-5 border border-purple-100 dark:border-purple-900/30 space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-black text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                      <span>📋</span>
                      <span>Latest Prescription & Diagnosis</span>
                    </h3>
                    <button
                      onClick={() => setViewingPrescription(localPrescriptions[0])}
                      className="text-xs font-bold text-purple-600 hover:underline"
                    >
                      View Full Rx →
                    </button>
                  </div>
                  {localPrescriptions[0].diagnosis && (
                    <div className="text-sm font-black text-gray-900 dark:text-white">
                      Diagnosis: {localPrescriptions[0].diagnosis}
                    </div>
                  )}
                  {localPrescriptions[0].medications?.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {localPrescriptions[0].medications.map((m: any, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-xs font-bold border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 shadow-sm">
                          <span>{getFormIcon(m.form)}</span>
                          <span>{m.name}</span>
                          {m.dosage && <span className="text-[10px] text-gray-400 font-normal">({m.dosage})</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Doctor's Private Note */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-xs uppercase tracking-wider text-gray-400">🔒 Doctor's Private Clinical File</h3>
                    <span className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">Confidential</span>
                  </div>
                  <span className="text-[10px] text-gray-400">Allergies, chronic history & personal medical instructions</span>
                </div>
                <textarea
                  value={doctorNote}
                  onChange={e => setDoctorNote(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl p-4 bg-amber-50/50 dark:bg-amber-900/10 border-2 border-amber-200 dark:border-amber-800/40 text-gray-900 dark:text-white outline-none focus:border-amber-400 resize-none text-sm leading-relaxed"
                  placeholder="Document private clinical notes (e.g. Penicillin allergy, diabetic, family history, next check-up schedule)..."
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={saving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-all disabled:opacity-50 shadow-md shadow-amber-500/20"
                  >
                    {saving ? 'Saving Note...' : saved ? '✓ Note Saved!' : 'Save Clinical Note'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 2: MEDICATIONS CABINET (Categorized by Pills, Syrups, Creams, etc.)
             ───────────────────────────────────────────────────────────── */}
          {activeTab === 'medications' && (
            <div className="space-y-5 animate-in fade-in">
              
              {/* Header with + Add Medication Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                    <span>💊</span>
                    <span>Patient Medication Cabinet</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Categorized into Pills, Syrups, Creams, Injections, Drops & Inhalers
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMedModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black rounded-xl text-xs shadow-md shadow-teal-500/20 transition-all flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Add Medication to Patient</span>
                </button>
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                {[
                  { id: 'all', label: `All (${allMedications.length})`, icon: '📋' },
                  { id: 'pill', label: `Pills (${pillsCount})`, icon: '💊' },
                  { id: 'drinking', label: `Syrups (${drinkingCount})`, icon: '🧴' },
                  { id: 'cream', label: `Creams (${creamCount})`, icon: '🧴' },
                  { id: 'injection', label: `Injections (${injectionCount})`, icon: '💉' },
                  { id: 'drops', label: `Drops (${dropsCount})`, icon: '💧' },
                  { id: 'spray', label: `Sprays (${sprayCount})`, icon: '💨' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setMedCategoryFilter(cat.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      medCategoryFilter === cat.id
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Medication Cards List */}
              {filteredMeds.length === 0 ? (
                <div className="text-center py-12 bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 space-y-3">
                  <span className="text-4xl block">💊</span>
                  <p className="text-gray-500 font-bold text-sm">No medications found in this category.</p>
                  <button
                    type="button"
                    onClick={() => setShowAddMedModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all"
                  >
                    + Add First Medication
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredMeds.map((med) => (
                    <div 
                      key={med.id} 
                      className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/80 shadow-sm space-y-3 hover:border-blue-500/40 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex-shrink-0">
                            {getFormIcon(med.form)}
                          </span>
                          <div>
                            <h4 className="font-black text-gray-900 dark:text-white text-sm">{med.name}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {med.dosage && (
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                  {med.dosage}
                                </span>
                              )}
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
                                {med.form}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setViewingPrescription(med.rawRx)}
                          className="px-2.5 py-1 bg-gray-100 hover:bg-blue-50 dark:bg-gray-700 dark:hover:bg-blue-900/40 text-gray-600 dark:text-gray-300 hover:text-blue-600 text-[10px] font-bold rounded-lg transition-colors"
                          title="View Source Prescription"
                        >
                          Rx View
                        </button>
                      </div>

                      {med.instructions && (
                        <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl text-xs text-gray-700 dark:text-gray-300 font-medium" dir="auto">
                          <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Instructions:</span>
                          {med.instructions}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                        <span>Diagnosis: <strong className="text-gray-700 dark:text-gray-300">{med.diagnosis}</strong></span>
                        <span>{new Date(med.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inline Add Medication Modal (Similar to adding a family member) */}
              {showAddMedModal && (
                <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
                  <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-gray-800 p-6 space-y-5">
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                      <div>
                        <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                          <span>💊</span>
                          <span>Add Medication for {patient.full_name}</span>
                        </h3>
                        <p className="text-xs text-gray-400">Add an unlisted or frequent medicine with form & dosage</p>
                      </div>
                      <button 
                        onClick={() => setShowAddMedModal(false)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleDirectAddMedication} className="space-y-4">
                      {/* Name & Form */}
                      <div className="space-y-3">
                        <div className="relative">
                          <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">Medication Name</label>
                          <input
                            required
                            value={newMedName}
                            onChange={e => handleMedNameChange(e.target.value)}
                            placeholder="e.g. Panadol Extra / Augmentin"
                            className="w-full rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                          />
                          {matchingFavs.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-30 max-h-40 overflow-y-auto">
                              {matchingFavs.map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => handleSelectFav(f)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-between border-b border-gray-50 dark:border-gray-800 last:border-0"
                                >
                                  <span className="font-bold text-blue-600 dark:text-blue-400">{f.name}</span>
                                  <span className="text-[10px] text-gray-400">{f.default_dosage}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">Form / Type</label>
                            <select
                              value={newMedForm}
                              onChange={e => setNewMedForm(e.target.value as any)}
                              className="w-full rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold"
                            >
                              <option value="pill">💊 Pill / Capsule</option>
                              <option value="drinking">🧴 Syrup / Drinking</option>
                              <option value="cream">🧴 Cream / Ointment</option>
                              <option value="injection">💉 Injection</option>
                              <option value="drops">💧 Drops</option>
                              <option value="spray">💨 Spray / Inhaler</option>
                              <option value="other">🩺 Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">Dosage</label>
                            <input
                              value={newMedDosage}
                              onChange={e => setNewMedDosage(e.target.value)}
                              placeholder="e.g. 500mg, 10ml"
                              className="w-full rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">Intake Instructions</label>
                          <textarea
                            value={newMedInstructions}
                            onChange={e => setNewMedInstructions(e.target.value)}
                            dir="auto"
                            placeholder="e.g. قرص كل 8 ساعات بعد الأكل"
                            className="w-full rounded-xl p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none h-18"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1">Diagnosis / Indication</label>
                          <input
                            value={newMedDiagnosis}
                            onChange={e => setNewMedDiagnosis(e.target.value)}
                            placeholder="e.g. #برد, Headache, Follow-up relief"
                            className="w-full rounded-xl px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                          />
                        </div>

                        <label className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400 cursor-pointer pt-1">
                          <input
                            type="checkbox"
                            checked={saveToDoctorFavs}
                            onChange={e => setSaveToDoctorFavs(e.target.checked)}
                            className="w-4 h-4 rounded text-amber-500"
                          />
                          <span>⭐ Save unlisted medication to My Frequent Medications list</span>
                        </label>
                      </div>

                      {medSuccessMsg && (
                        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold text-center animate-in fade-in">
                          ✓ Medication successfully saved and added to patient cabinet!
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <button
                          type="button"
                          onClick={() => setShowAddMedModal(false)}
                          className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addingMed}
                          className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
                        >
                          {addingMed ? 'Adding...' : 'Save Medication'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 3: PRESCRIPTIONS (Interactive & Clickable Cards)
             ───────────────────────────────────────────────────────────── */}
          {activeTab === 'prescriptions' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-gray-400">Prescription Archives & Records</p>
                  <p className="text-[10px] text-gray-500">Tap on any prescription card to preview, download PDF, or print</p>
                </div>
                <button
                  onClick={onWritePrescription}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-500/20"
                >
                  <span>💊</span>
                  <span>+ New Prescription</span>
                </button>
              </div>

              {localPrescriptions.length === 0 ? (
                <div className="text-center py-12 bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 space-y-3">
                  <p className="text-3xl">💊</p>
                  <p className="text-gray-500 font-bold text-sm">No prescriptions recorded yet.</p>
                  <button
                    onClick={onWritePrescription}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20"
                  >
                    + Write First Prescription
                  </button>
                </div>
              ) : (
                localPrescriptions.map((rx: any) => (
                  <div 
                    key={rx.id} 
                    onClick={() => setViewingPrescription(rx)}
                    className="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700/80 shadow-sm space-y-3.5 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                            {rx.diagnosis || 'Clinical Prescription'}
                          </span>
                          <span className="px-2.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-black rounded-full uppercase">
                            Rx Official
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(rx.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>

                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setViewingPrescription(rx)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>View & PDF</span>
                        </button>
                      </div>
                    </div>

                    {rx.symptoms && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/40 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                        <strong className="text-gray-400 uppercase text-[9px] block mb-0.5">Symptoms:</strong>
                        {rx.symptoms}
                      </p>
                    )}

                    {rx.medications?.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">Medications ({rx.medications.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {rx.medications.map((m: any, i: number) => (
                            <span 
                              key={i} 
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 dark:bg-purple-900/20 rounded-full text-xs font-bold border border-purple-100 dark:border-purple-900/30 text-purple-700 dark:text-purple-300"
                            >
                              <span>{getFormIcon(m.form)}</span>
                              <span>{m.name}</span>
                              {m.dosage && <span className="text-[10px] text-gray-500 font-normal">({m.dosage})</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {rx.doctor_notes && (
                      <p className="text-xs italic text-gray-500 border-t border-gray-100 dark:border-gray-700/60 pt-2">
                        "{rx.doctor_notes}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              TAB 4: VISITS TIMELINE
             ───────────────────────────────────────────────────────────── */}
          {activeTab === 'visits' && (
            <div className="space-y-3 animate-in fade-in">
              {patient.appointments?.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic">No visits recorded yet.</div>
              ) : (
                patient.appointments?.map((apt: any) => {
                  const patientNote = apt.notes ? (apt.notes.match(/\[PATIENT_NOTE:\s*([\s\S]*?)\]/)?.[1] || (apt.notes.includes('[FOR:') ? '' : apt.notes)) : ''
                  const forDependent = apt.family_member_name || apt.notes?.match(/\[FOR:\s*([^\]]+)\]/)?.[1]
                  return (
                    <div key={apt.id} className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${apt.status === 'completed' ? 'bg-green-500' : apt.status === 'cancelled' ? 'bg-red-400' : 'bg-blue-500'}`} />
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-sm">
                              {new Date(apt.scheduled_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p className="text-xs text-gray-500 capitalize">
                              {apt.appointment_type?.replace('_', ' ')} • {apt.status}
                              {forDependent && <span className="ml-2 text-blue-600 dark:text-blue-400 font-semibold">(For: {forDependent})</span>}
                            </p>
                          </div>
                        </div>
                        <p className="font-black text-gray-900 dark:text-white text-sm flex-shrink-0">{Number(apt.fees || 0).toLocaleString()} EGP</p>
                      </div>
                      {patientNote && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                          <span className="font-bold">📝 Patient Note / Symptoms: </span>
                          <span>{patientNote}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {viewingPrescription && (
        <PrescriptionViewerModal
          prescription={viewingPrescription}
          patientName={patient.full_name}
          onClose={() => setViewingPrescription(null)}
        />
      )}
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
  const [prescriptionPatient, setPrescriptionPatient] = useState<{ id: string; name: string; is_manual: boolean } | null>(null)

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
      .select('id, scheduled_time, status, appointment_type, fees, payment_status, notes')
      .eq('doctor_id', doctorId)
      .order('scheduled_time', { ascending: false })

    if (patient.is_manual) apptQuery = apptQuery.eq('manual_patient_id', patient.id)
    else apptQuery = apptQuery.eq('patient_id', patient.id)
    const { data: apts } = await apptQuery

    // Fetch prescriptions
    let rxQuery = supabase.from('prescriptions')
      .select('id, doctor_id, created_at, diagnosis, symptoms, medications, doctor_notes')
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

  const handlePrescriptionComplete = async () => {
    if (prescriptionPatient) {
      const targetId = prescriptionPatient.id
      const isManual = prescriptionPatient.is_manual
      const supabase = createClient()
      
      let rxQuery = supabase.from('prescriptions')
        .select('id, doctor_id, created_at, diagnosis, symptoms, medications, doctor_notes')
        .eq('doctor_id', doctorId)
        .order('created_at', { ascending: false })

      if (isManual) rxQuery = rxQuery.eq('manual_patient_id', targetId)
      else rxQuery = rxQuery.eq('patient_id', targetId)
      const { data: rxs } = await rxQuery

      if (rxs) {
        setDetailCache(prev => {
          const existing = prev[targetId]
          if (!existing) return prev
          return {
            ...prev,
            [targetId]: { ...existing, prescriptions: rxs }
          }
        })
        if (selectedPatient && selectedPatient.id === targetId) {
          setSelectedPatient(prev => prev ? { ...prev, prescriptions: rxs } : null)
        }
      }
    }
    setPrescriptionPatient(null)
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-900 dark:text-gray-200">{p.phone_number || <span className="text-gray-400 italic text-xs">No phone</span>}</p>
                        {p.phone_number && (
                          <a
                            href={getWhatsAppLink(p.phone_number, `Hello ${p.full_name}, this is your clinic.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center text-xs p-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-bold transition-colors"
                            title="Chat on WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                          </a>
                        )}
                      </div>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrescriptionPatient({ id: p.id, name: p.full_name, is_manual: p.is_manual });
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-300 rounded-xl font-bold text-xs transition-colors flex items-center gap-1 shadow-sm"
                          title="Write prescription for patient"
                        >
                          <span>💊</span>
                          <span>+ Rx</span>
                        </button>
                        <button className="text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                          {loadingDetail ? '...' : 'View →'}
                        </button>
                      </div>
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
          onWritePrescription={() => setPrescriptionPatient({ id: selectedPatient.id, name: selectedPatient.full_name, is_manual: selectedPatient.is_manual })}
        />
      )}

      {/* Standalone / Direct Prescription Modal */}
      {prescriptionPatient && (
        <PrescriptionModal
          patientName={prescriptionPatient.name}
          patientId={prescriptionPatient.is_manual ? null : prescriptionPatient.id}
          manualPatientId={prescriptionPatient.is_manual ? prescriptionPatient.id : null}
          appointmentId={null}
          onClose={() => setPrescriptionPatient(null)}
          onComplete={handlePrescriptionComplete}
        />
      )}
    </div>
  )
}
