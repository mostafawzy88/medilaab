'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

export type MedicationFormType = 'pill' | 'drinking' | 'cream' | 'injection' | 'drops' | 'spray' | 'other'

export type MedicationItem = {
  name: string
  dosage: string
  instructions: string
  form: MedicationFormType
  saveToFavorites?: boolean
}

type PrescriptionModalProps = {
  appointmentId?: string | null
  patientId: string | null
  manualPatientId?: string | null
  patientName: string
  patientNotes?: string | null
  initialSymptoms?: string
  onClose: () => void
  onComplete: () => void
}

export function getFormIcon(form?: string) {
  switch (form) {
    case 'drinking': return '🧴'
    case 'cream': return '🧴'
    case 'injection': return '💉'
    case 'drops': return '💧'
    case 'spray': return '💨'
    case 'other': return '🩺'
    case 'pill':
    default:
      return '💊'
  }
}

export function getFormLabel(form?: string) {
  switch (form) {
    case 'drinking': return 'Syrup / Drinking (شراب)'
    case 'cream': return 'Cream / Ointment (مرهم / دهان)'
    case 'injection': return 'Injection (حقنة / أمبول)'
    case 'drops': return 'Drops (قطرة / نقط)'
    case 'spray': return 'Spray / Inhaler (بخاخ)'
    case 'other': return 'Other (أخرى)'
    case 'pill':
    default:
      return 'Pill / Capsule (أقراص / كبسولة)'
  }
}

export function inferFormFromName(name: string): MedicationFormType {
  const n = (name || '').toLowerCase()
  if (n.includes('syrup') || n.includes('شراب') || n.includes('شرب') || n.includes('solution') || n.includes('suspension')) return 'drinking'
  if (n.includes('cream') || n.includes('ointment') || n.includes('مرهم') || n.includes('كريم') || n.includes('gel') || n.includes('جل') || n.includes('دهان')) return 'cream'
  if (n.includes('injection') || n.includes('حقن') || n.includes('amp') || n.includes('vial') || n.includes('أمبول')) return 'injection'
  if (n.includes('drop') || n.includes('قطرة') || n.includes('نقط') || n.includes('eye drop') || n.includes('ear drop')) return 'drops'
  if (n.includes('spray') || n.includes('بخاخ') || n.includes('inhaler') || n.includes('بف') || n.includes('puff')) return 'spray'
  return 'pill'
}

export function parseMedicationFormAndDosage(
  rawDosage?: string | null,
  rawName?: string | null,
  explicitForm?: string | null
): { cleanDosage: string; form: MedicationFormType } {
  const dosageStr = (rawDosage || '').trim()

  const formTagMatch = dosageStr.match(/\[FORM:([a-zA-Z_]+)\]/i)
  const bracketFormMatch = dosageStr.match(/\[(pill|drinking|cream|injection|drops|spray|other)\]/i)

  const extractedForm = formTagMatch?.[1]?.toLowerCase() || bracketFormMatch?.[1]?.toLowerCase()

  const validForms: MedicationFormType[] = ['pill', 'drinking', 'cream', 'injection', 'drops', 'spray', 'other']

  let finalForm: MedicationFormType = 'pill'
  if (explicitForm && validForms.includes(explicitForm as MedicationFormType)) {
    finalForm = explicitForm as MedicationFormType
  } else if (extractedForm && validForms.includes(extractedForm as MedicationFormType)) {
    finalForm = extractedForm as MedicationFormType
  } else if (rawName) {
    finalForm = inferFormFromName(rawName)
  }

  const cleanDosage = dosageStr
    .replace(/\[FORM:[a-zA-Z_]+\]/gi, '')
    .replace(/\[(pill|drinking|cream|injection|drops|spray|other)\]/gi, '')
    .trim()

  return { cleanDosage, form: finalForm }
}

export default function PrescriptionModal({ 
  appointmentId, 
  patientId, 
  manualPatientId,
  patientName, 
  patientNotes,
  initialSymptoms,
  onClose,
  onComplete
}: PrescriptionModalProps) {
  const t = useTranslations('Dashboard')
  
  // Extract initial symptoms from notes if available
  const extractedPatientNote = useMemo(() => {
    if (initialSymptoms) return initialSymptoms
    if (!patientNotes) return ''
    const match = patientNotes.match(/\[PATIENT_NOTE:\s*([\s\S]*?)\]/)
    if (match && match[1]) return match[1].trim()
    if (!patientNotes.includes('[') && !patientNotes.includes('{')) return patientNotes.trim()
    return ''
  }, [patientNotes, initialSymptoms])

  const [symptoms, setSymptoms] = useState(extractedPatientNote || '')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [medications, setMedications] = useState<MedicationItem[]>([
    { name: '', dosage: '', instructions: '', form: 'pill', saveToFavorites: false }
  ])
  const [favoriteMeds, setFavoriteMeds] = useState<any[]>([])
  const [loadingFavs, setLoadingFavs] = useState(true)
  const [activeSuggestIndex, setActiveSuggestIndex] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  // Pre-fetch doctor's frequent medications on mount
  useEffect(() => {
    let isMounted = true
    async function loadDoctorFavorites() {
      setLoadingFavs(true)
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('doctor_medications')
          .select('*')
          .eq('doctor_id', user.id)
          .order('name')

        if (!error && data && isMounted) {
          const parsed = data.map(m => {
            const { cleanDosage, form } = parseMedicationFormAndDosage(m.default_dosage, m.name, m.form)
            return {
              ...m,
              default_dosage: cleanDosage,
              form
            }
          })
          setFavoriteMeds(parsed)
        }
      } catch (err) {
        console.error('Failed to load doctor favorite medications:', err)
      } finally {
        if (isMounted) setLoadingFavs(false)
      }
    }
    loadDoctorFavorites()
    return () => { isMounted = false }
  }, [])

  // Smart symptom-to-medication match based on patient notes or current symptoms field
  const smartSymptomSuggestions = useMemo(() => {
    const combinedText = `${extractedPatientNote} ${symptoms}`.toLowerCase()
    if (!combinedText.trim() || favoriteMeds.length === 0) return []

    // Extract hashtags like #برد or words >= 2 chars
    const hashtags = (combinedText.match(/#([\p{L}\p{N}_]+)/gu) || []).map(h => h.replace('#', '').trim())
    const words = combinedText
      .replace(/[#\[\]():,.-]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 2 && !['patient_note', 'for', 'the', 'and', 'with', 'from', 'عندي', 'من', 'في', 'منذ'].includes(w))

    const queryTokens = Array.from(new Set([...hashtags, ...words]))
    if (queryTokens.length === 0) return []

    const matches: any[] = []
    const seen = new Set()

    for (const med of favoriteMeds) {
      const medSym = (med.common_symptoms || '').toLowerCase()
      const medName = (med.name || '').toLowerCase()

      for (const tok of queryTokens) {
        if (tok.length >= 2 && (medSym.includes(tok) || medName.includes(tok))) {
          if (!seen.has(med.id || med.name)) {
            seen.add(med.id || med.name)
            matches.push({
              ...med,
              matchedToken: tok
            })
          }
          break
        }
      }
    }

    return matches
  }, [extractedPatientNote, symptoms, favoriteMeds])

  const handleAddMed = () => {
    setMedications([...medications, { name: '', dosage: '', instructions: '', form: 'pill', saveToFavorites: false }])
  }

  const handleRemoveMed = (index: number) => {
    if (medications.length === 1) {
      setMedications([{ name: '', dosage: '', instructions: '', form: 'pill', saveToFavorites: false }])
      return
    }
    setMedications(medications.filter((_, i) => i !== index))
  }

  const handleMedChange = (index: number, field: keyof MedicationItem, value: any) => {
    const newMeds = [...medications]
    newMeds[index] = { ...newMeds[index], [field]: value }

    // If changing name, also auto-infer form if user hasn't explicitly changed it from default
    if (field === 'name' && value && (!newMeds[index].form || newMeds[index].form === 'pill')) {
      newMeds[index].form = inferFormFromName(value)
    }

    setMedications(newMeds)

    if (field === 'name') {
      if (value.length > 1) {
        setActiveSuggestIndex(index)
        const q = value.toLowerCase()
        const localMatches = favoriteMeds.filter(m => m.name.toLowerCase().includes(q))
        setSuggestions(localMatches)
      } else {
        setSuggestions([])
        setActiveSuggestIndex(null)
      }
    }
  }

  const handleSelectFavoriteMed = (fav: any, targetIndex?: number) => {
    const targetIdx = targetIndex !== undefined 
      ? targetIndex 
      : (medications.length === 1 && !medications[0].name) ? 0 : medications.length

    const newItem: MedicationItem = {
      name: fav.name,
      dosage: fav.default_dosage || '',
      instructions: fav.instructions || '',
      form: fav.form || inferFormFromName(fav.name),
      saveToFavorites: false
    }

    if (targetIdx < medications.length) {
      const copy = [...medications]
      copy[targetIdx] = newItem
      setMedications(copy)
    } else {
      setMedications([...medications, newItem])
    }

    setSuggestions([])
    setActiveSuggestIndex(null)
  }

  const handleSymptomsChange = (val: string) => {
    setSymptoms(val)
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('Authentication error. Please re-login.')
      setSaving(false)
      return
    }

    // Filter out blank medications
    const validMeds = medications.filter(m => m.name.trim().length > 0)
    if (validMeds.length === 0) {
      alert('Please add at least one medication with a valid name.')
      setSaving(false)
      return
    }

    // Insert into prescriptions table
    const { error: rxError } = await supabase.from('prescriptions').insert({
      appointment_id: appointmentId || null,
      patient_id: patientId || null,
      manual_patient_id: manualPatientId || null,
      doctor_id: user.id,
      symptoms,
      diagnosis,
      medications: validMeds.map(m => ({
        name: m.name.trim(),
        dosage: m.dosage.trim(),
        instructions: m.instructions.trim(),
        form: m.form || 'pill'
      })),
      doctor_notes: notes
    })

    if (rxError) {
      alert('Error saving prescription: ' + rxError.message)
      setSaving(false)
      return
    }

    // Save any checked medications to doctor_medications
    const medsToSaveToFavs = validMeds.filter(m => m.saveToFavorites)
    for (const med of medsToSaveToFavs) {
      try {
        const cleanDosage = (med.dosage || '')
          .replace(/\[FORM:[a-zA-Z_]+\]/gi, '')
          .replace(/\[(pill|drinking|cream|injection|drops|spray|other)\]/gi, '')
          .trim()
        const payload: any = {
          doctor_id: user.id,
          name: med.name.trim(),
          default_dosage: cleanDosage ? `${cleanDosage} [FORM:${med.form || 'pill'}]` : `[FORM:${med.form || 'pill'}]`,
          common_symptoms: symptoms || diagnosis || '',
          form: med.form || 'pill'
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
        console.warn('Could not auto-save favorite medication:', err)
      }
    }

    // Update appointment to completed if an appointmentId is linked
    if (appointmentId) {
      await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)
    }

    setSaving(false)
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-gray-100 dark:border-gray-800 flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md z-20">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>💊</span>
              <span>{t('write_prescription')}</span>
              <span className="text-blue-600 dark:text-blue-400">— {patientName}</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Categorized by type (Pills, Syrups, Creams, Injections, Drops) with smart symptoms AI</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          
          {/* Patient Complaint / Symptoms Note */}
          {extractedPatientNote && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3">
              <span className="text-lg flex-shrink-0">📝</span>
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <span className="font-black uppercase tracking-wider block mb-0.5">Patient Complaint / Notes from Booking:</span>
                <span className="font-semibold italic">"{extractedPatientNote}"</span>
              </div>
            </div>
          )}

          {/* Smart AI Suggestions based on Symptoms */}
          {smartSymptomSuggestions.length > 0 && (
            <div className="p-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-teal-500/10 border border-blue-500/30 rounded-2xl animate-in fade-in space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">💡</span>
                  <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                    Smart Suggestions for Symptoms ({Array.from(new Set(smartSymptomSuggestions.map(s => `"${s.matchedToken}"`))).join(', ')})
                  </span>
                </div>
                <span className="text-[10px] text-gray-500 font-bold bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                  Tap to add
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {smartSymptomSuggestions.map((sug) => (
                  <button
                    key={sug.id || sug.name}
                    type="button"
                    onClick={() => handleSelectFavoriteMed(sug)}
                    className="flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 border border-blue-300 dark:border-blue-700 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 shadow-sm transition-all hover:scale-105 active:scale-95"
                  >
                    <span>{getFormIcon(sug.form)}</span>
                    <span>{sug.name}</span>
                    {sug.default_dosage && (
                      <span className="text-[10px] text-gray-400 font-medium">({sug.default_dosage})</span>
                    )}
                    <span className="text-emerald-500 font-black text-sm">+</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick-Select Doctor's Frequently Prescribed Medications */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <span>⭐</span>
                <span>Your Frequent Medications</span>
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">({favoriteMeds.length} saved)</span>
              </label>
              <span className="text-[10px] text-gray-400">1-Click Quick Add</span>
            </div>
            
            {loadingFavs ? (
              <div className="py-2 text-xs text-gray-400 italic">Loading your frequent medications...</div>
            ) : favoriteMeds.length === 0 ? (
              <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-xs text-gray-400 flex items-center justify-between">
                <span>No frequent medications saved yet. Check "⭐ Save to Favorites" below when adding a medicine to remember it!</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                {favoriteMeds.map((fav) => (
                  <button
                    key={fav.id}
                    type="button"
                    onClick={() => handleSelectFavoriteMed(fav)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold whitespace-nowrap transition-all hover:scale-105 active:scale-95 shadow-sm"
                  >
                    <span>{getFormIcon(fav.form)}</span>
                    <span className="font-bold">{fav.name}</span>
                    {fav.default_dosage && (
                      <span className="text-[10px] text-gray-400">({fav.default_dosage})</span>
                    )}
                    <span className="text-blue-600 dark:text-blue-400 font-bold ml-1">+</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Symptoms & Diagnosis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-700 dark:text-gray-300">
                Symptoms / Complaint (الأعراض)
              </label>
              <textarea 
                value={symptoms}
                onChange={(e) => handleSymptomsChange(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 text-sm"
                placeholder="e.g. #برد, cough, fever since 3 days..."
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-700 dark:text-gray-300">
                Diagnosis (التشخيص الطبي)
              </label>
              <textarea 
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24 text-sm"
                placeholder="e.g. Upper Respiratory Tract Infection (URTI)"
              />
            </div>
          </div>

          {/* Medications Builder with Types / Forms */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Prescription Medications ({medications.length})
                </label>
                <p className="text-[10px] text-gray-400">Classify medications by form (Pills, Creams, Drinking syrups, Injections, Drops)</p>
              </div>
              <button 
                type="button" 
                onClick={handleAddMed} 
                className="px-3.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-bold rounded-xl text-xs transition-colors flex items-center gap-1"
              >
                <span>+</span>
                <span>Add Medication</span>
              </button>
            </div>
            
            <div className="space-y-4">
              {medications.map((med, idx) => (
                <div 
                  key={idx} 
                  className="p-4 rounded-2xl bg-gray-50/80 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/80 space-y-3 relative transition-all shadow-sm"
                >
                  {/* Top Row: Index + Form Selector + Save to Favorites + Delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/50 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">
                        {idx + 1}
                      </span>
                      
                      {/* Medication Form Selector */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{getFormIcon(med.form)}</span>
                        <select
                          value={med.form}
                          onChange={(e) => handleMedChange(idx, 'form', e.target.value as MedicationFormType)}
                          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1 text-xs font-bold text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="pill">💊 Pill / Capsule (أقراص / كبسولات)</option>
                          <option value="drinking">🧴 Syrup / Drinking (شراب / سائل شرب)</option>
                          <option value="cream">🧴 Cream / Ointment (مرهم / دهان موضعي)</option>
                          <option value="injection">💉 Injection (حقنة / أمبولات)</option>
                          <option value="drops">💧 Drops (نقط / قطرات)</option>
                          <option value="spray">💨 Spray / Inhaler (بخاخ / استنشاق)</option>
                          <option value="other">🩺 Other (أخرى)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Save to Favorites toggle */}
                      <label className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!med.saveToFavorites}
                          onChange={(e) => handleMedChange(idx, 'saveToFavorites', e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-400"
                        />
                        <span>⭐ Save to Frequent Meds</span>
                      </label>

                      {medications.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMed(idx)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove medication"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mid Row: Name & Dosage */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Medication Name</label>
                      <input 
                        value={med.name}
                        onChange={(e) => handleMedChange(idx, 'name', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 rounded-xl px-3.5 py-2 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 text-sm font-semibold" 
                        placeholder="e.g. Panadol Extra / Amoclan" 
                      />
                      
                      {/* Autocomplete Dropdown */}
                      {activeSuggestIndex === idx && suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100 dark:border-gray-700">
                            Saved Frequent Matches
                          </div>
                          {suggestions.map((sug) => (
                            <button
                              key={sug.id || sug.name}
                              type="button"
                              onClick={() => handleSelectFavoriteMed(sug, idx)}
                              className="w-full text-left px-3.5 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-xs flex items-center justify-between border-b border-gray-50 dark:border-gray-800 last:border-0"
                            >
                              <div className="flex items-center gap-2">
                                <span>{getFormIcon(sug.form)}</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{sug.name}</span>
                                {sug.default_dosage && (
                                  <span className="text-gray-400 text-[10px]">({sug.default_dosage})</span>
                                )}
                              </div>
                              <span className="text-[10px] font-black text-blue-500">Select</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Dosage / Concentration</label>
                      <input 
                        value={med.dosage}
                        onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 rounded-xl px-3.5 py-2 border border-gray-200 dark:border-gray-700 outline-none focus:border-blue-500 text-sm" 
                        placeholder="e.g. 500mg, 1 tablet, 10ml, 1 ampoule" 
                      />
                    </div>
                  </div>

                  {/* Bottom Row: Instructions (Arabic & English support) */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Patient Instructions (تعليمات الاستخدام)</label>
                    <textarea 
                      value={med.instructions}
                      onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                      dir="auto"
                      className="w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 outline-none focus:border-blue-500 text-sm resize-none h-18" 
                      placeholder="e.g. قرص كل 8 ساعات بعد الأكل لمدة 5 أيام / 1 tablet twice daily after meals" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-700 dark:text-gray-300">
              General Doctor Advice & Notes (ملاحظات ونصائح عامة)
            </label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              dir="auto"
              className="w-full min-h-[80px] rounded-2xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
              placeholder="e.g. الراحة التامة وتناول السوائل الدافئة والعودة للمتابعة بعد أسبوع..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/70 flex items-center justify-between sticky bottom-0 z-20">
          <div className="text-xs text-gray-400">
            {medications.filter(m => m.name.trim()).length} medication(s) ready to prescribe
          </div>
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-black text-sm bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Prescription...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Save & Issue Prescription</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
