'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type PrescriptionModalProps = {
  appointmentId: string
  patientId: string
  patientName: string
  onClose: () => void
  onComplete: () => void
}

export default function PrescriptionModal({ 
  appointmentId, 
  patientId, 
  patientName, 
  onClose,
  onComplete
}: PrescriptionModalProps) {
  const t = useTranslations('Dashboard')
  
  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [medications, setMedications] = useState([{ name: '', dosage: '', instructions: '' }])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  const handleAddMed = () => {
    setMedications([...medications, { name: '', dosage: '', instructions: '' }])
  }

  const handleMedChange = async (index: number, field: string, value: string) => {
    const newMeds = [...medications]
    // @ts-ignore
    newMeds[index][field] = value
    setMedications(newMeds)

    if (field === 'name' && value.length > 1) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('doctor_medications')
        .select('*')
        .eq('doctor_id', user.id)
        .ilike('name', `%${value}%`)
        .limit(5)
      setSuggestions(data || [])
    } else if (field === 'name') {
      setSuggestions([])
    }
  }

  const selectSuggestion = (index: number, sug: any) => {
    const newMeds = [...medications]
    newMeds[index].name = sug.name
    newMeds[index].dosage = sug.default_dosage || ''
    setMedications(newMeds)
    setSuggestions([])
  }

  const handleSymptomsChange = async (val: string) => {
    setSymptoms(val)
    if (val.length > 2) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('doctor_medications')
        .select('*')
        .eq('doctor_id', user.id)
        .ilike('common_symptoms', `%${val}%`)
        .limit(5)
      setSuggestions(data || [])
    } else {
      setSuggestions([])
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Insert into prescriptions table
    const { error } = await supabase.from('prescriptions').insert({
      appointment_id: appointmentId,
      patient_id: patientId,
      doctor_id: user.id,
      symptoms,
      diagnosis,
      medications,
      doctor_notes: notes
    })

    if (error) {
      alert('Error saving prescription: ' + error.message)
      setSaving(false)
      return
    }

    // Update appointment to completed
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', appointmentId)

    setSaving(false)
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
          <h2 className="text-xl font-bold">{t('write_prescription')} - {patientName}</h2>
          <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Symptoms</label>
            <div className="relative">
              <textarea 
                value={symptoms}
                onChange={(e) => handleSymptomsChange(e.target.value)}
                className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20"
                placeholder="Describe patient symptoms..."
              />
              {suggestions.length > 0 && symptoms.length > 2 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-20 overflow-hidden">
                  <div className="p-2 border-b border-gray-50 dark:border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Suggested Medications based on Symptoms</div>
                  {suggestions.map((sug) => (
                    <button
                      key={sug.id}
                      onClick={() => selectSuggestion(medications.length - 1, sug)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center justify-between border-b border-gray-50 dark:border-gray-800 last:border-0"
                    >
                      <div>
                        <div className="font-bold text-sm text-blue-600 dark:text-blue-400">{sug.name}</div>
                        <div className="text-xs text-gray-500">{sug.default_dosage}</div>
                      </div>
                      <div className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded-full font-black uppercase">Add</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Diagnosis</label>
            <input 
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Acute Bronchitis"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Medications</label>
              <button type="button" onClick={handleAddMed} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline">
                + Add Medication
              </button>
            </div>
            
            <div className="space-y-4">
              {medications.map((med, idx) => (
                <div key={idx} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-4 relative">
                  <div className="flex-1 relative">
                    <input 
                      value={med.name}
                      onChange={(e) => handleMedChange(idx, 'name', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 dark:border-gray-700 py-2 outline-none focus:border-blue-500 text-sm font-medium" 
                      placeholder="Medication Name (e.g. Panadol)" 
                    />
                    {idx === medications.length - 1 && suggestions.length > 0 && med.name.length > 1 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 rounded-xl shadow-xl z-20 overflow-hidden">
                        {suggestions.map((sug) => (
                          <button
                            key={sug.id}
                            onClick={() => selectSuggestion(idx, sug)}
                            className="w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm border-b border-gray-50 dark:border-gray-800 last:border-0"
                          >
                            <span className="font-bold text-blue-600 dark:text-blue-400">{sug.name}</span>
                            <span className="text-gray-400 text-xs ml-2">({sug.default_dosage})</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <input 
                      value={med.dosage}
                      onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                      className="w-full bg-transparent border-b border-gray-200 dark:border-gray-700 py-2 outline-none focus:border-blue-500 text-sm mt-2" 
                      placeholder="Dosage (e.g. 500mg)" 
                    />
                  </div>
                  <div className="flex-1">
                    {/* RTL SUPPORT FOR ARABIC INSTRUCTIONS */}
                    <textarea 
                      value={med.instructions}
                      onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                      dir="auto"
                      className="w-full h-full min-h-[80px] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3 outline-none focus:border-blue-500 text-sm resize-none" 
                      placeholder="Instructions (e.g. حبة كل 8 ساعات بعد الأكل)" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Additional Notes</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              dir="auto"
              className="w-full min-h-[100px] rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Any additional notes for the patient or file..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex justify-end gap-3 sticky bottom-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Complete'}
          </button>
        </div>
      </div>
    </div>
  )
}
