'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

type MedicationItem = {
  name: string
  dosage: string
  instructions?: string
  status?: 'active' | 'discontinued'
  discontinued_reason?: string
  discontinued_by?: string
  discontinued_at?: string
  slot?: 'morning' | 'midday' | 'evening' | 'night' | 'bedtime'
}

export default function MedicationManagerModal({
  patientId,
  manualPatientId,
  patientName,
  doctorId,
  appointmentId,
  onClose,
  onUpdated,
}: {
  patientId: string | null
  manualPatientId?: string | null
  patientName: string
  doctorId: string
  appointmentId?: string | null
  onClose: () => void
  onUpdated?: () => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activePrescription, setActivePrescription] = useState<any | null>(null)
  const [medications, setMedications] = useState<MedicationItem[]>([])
  const [conditionNote, setConditionNote] = useState('')
  const [diagnosis, setDiagnosis] = useState('')

  // New med form
  const [newName, setNewName] = useState('')
  const [newDosage, setNewDosage] = useState('')
  const [newInstructions, setNewInstructions] = useState('')
  const [newSlot, setNewSlot] = useState<'morning' | 'midday' | 'evening' | 'night' | 'bedtime'>('morning')

  // Cancel med form modal
  const [cancellingIndex, setCancellingIndex] = useState<number | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    fetchLatestPrescription()
  }, [patientId, manualPatientId])

  const fetchLatestPrescription = async () => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('prescriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    if (patientId) {
      query = query.eq('patient_id', patientId)
    } else if (manualPatientId) {
      query = query.eq('manual_patient_id', manualPatientId)
    }

    const { data } = await query

    if (data && data.length > 0) {
      const rx = data[0]
      setActivePrescription(rx)
      setDiagnosis(rx.diagnosis || '')
      setConditionNote(rx.notes || '')
      if (Array.isArray(rx.medications)) {
        setMedications(rx.medications.map((m: any) => ({
          name: m.name || '',
          dosage: m.dosage || '',
          instructions: m.instructions || '',
          status: m.status || 'active',
          discontinued_reason: m.discontinued_reason,
          discontinued_by: m.discontinued_by,
          discontinued_at: m.discontinued_at,
          slot: m.slot || 'morning'
        })))
      }
    }
    setLoading(false)
  }

  // Add new medication to list
  const handleAddNewMed = () => {
    if (!newName.trim()) return

    const newMed: MedicationItem = {
      name: newName.trim(),
      dosage: newDosage.trim() || '1 tablet',
      instructions: newInstructions.trim() || 'Take as directed',
      status: 'active',
      slot: newSlot,
    }

    setMedications(prev => [...prev, newMed])
    setNewName('')
    setNewDosage('')
    setNewInstructions('')
  }

  // Confirm cancellation / discontinuation of a medication
  const handleConfirmDiscontinue = () => {
    if (cancellingIndex === null) return

    setMedications(prev => prev.map((m, idx) => {
      if (idx === cancellingIndex) {
        return {
          ...m,
          status: 'discontinued',
          discontinued_reason: cancelReason.trim() || 'Discontinued upon clinical review',
          discontinued_at: new Date().toISOString()
        }
      }
      return m
    }))

    setCancellingIndex(null)
    setCancelReason('')
  }

  // Reactivate a previously discontinued medication
  const handleReactivateMed = (index: number) => {
    setMedications(prev => prev.map((m, idx) => {
      if (idx === index) {
        const copy = { ...m, status: 'active' as const }
        delete copy.discontinued_reason
        delete copy.discontinued_at
        return copy
      }
      return m
    }))
  }

  // Save changes to database
  const handleSaveAll = async () => {
    setSaving(true)
    const supabase = createClient()

    if (activePrescription) {
      // Update existing prescription
      const { error } = await supabase
        .from('prescriptions')
        .update({
          medications: medications,
          notes: conditionNote,
          diagnosis: diagnosis || activePrescription.diagnosis || 'Clinical Follow-up'
        })
        .eq('id', activePrescription.id)

      if (error) {
        alert('Error saving medications: ' + error.message)
      } else {
        alert(isAr ? '✓ تم تحديث الأدوية والتعليمات الطبية بنجاح!' : '✓ Medications and clinical instructions saved successfully!')
        onUpdated?.()
        onClose()
      }
    } else {
      // Create new prescription
      const payload: any = {
        doctor_id: doctorId,
        patient_id: patientId || null,
        manual_patient_id: manualPatientId || null,
        appointment_id: appointmentId || null,
        medications: medications,
        notes: conditionNote,
        diagnosis: diagnosis || 'Medical Treatment Plan'
      }

      const { error } = await supabase.from('prescriptions').insert(payload)

      if (error) {
        alert('Error creating prescription: ' + error.message)
      } else {
        alert(isAr ? '✓ تم إنشاء الروشتة والأدوية بنجاح!' : '✓ Prescription and medications recorded successfully!')
        onUpdated?.()
        onClose()
      }
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center text-2xl shadow-sm">
              💊
            </span>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                {isAr ? 'إدارة أدوية المريض والروشتة' : 'Manage Patient Medications'}
              </h3>
              <p className="text-xs text-teal-600 dark:text-teal-400 font-bold">
                {isAr ? `المريض: ${patientName}` : `Patient: ${patientName}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1">
          {/* Diagnosis & Condition Note */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-1">
                {isAr ? 'التشخيص / سبب الزيارة' : 'Diagnosis / Visit Reason'}
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder={isAr ? 'مثال: نزلة معوية، استشارة متابعة...' : 'e.g. Acute bronchitis, Follow-up...'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-1">
                {isAr ? 'تطور الحالة / ملاحظات المتابعة' : 'Condition Update Note'}
              </label>
              <input
                type="text"
                value={conditionNote}
                onChange={e => setConditionNote(e.target.value)}
                placeholder={isAr ? 'تحسن الأعراض، خفض الجرعة...' : 'Symptoms improving, adjusted dose...'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
              />
            </div>
          </div>

          {/* Current Medications List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                {isAr ? 'قائمة الأدوية الحالية' : 'Current Medications'}
              </h4>
              <span className="text-xs font-bold text-gray-400">
                {medications.filter(m => m.status === 'active').length} {isAr ? 'دواء نشط' : 'active'}
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-teal-600 font-bold animate-pulse">
                {isAr ? 'جاري تحميل الأدوية...' : 'Loading medications...'}
              </div>
            ) : medications.length === 0 ? (
              <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-gray-400 text-xs">
                {isAr ? 'لا توجد أدوية مسجلة حالياً لهذا المريض.' : 'No medications recorded for this patient yet.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {medications.map((med, idx) => {
                  const isDiscontinued = med.status === 'discontinued'
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        isDiscontinued
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40'
                          : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${isDiscontinued ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                            {med.name}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300">
                            {med.dosage}
                          </span>
                          {isDiscontinued ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                              {isAr ? 'ملغي / متوقف' : 'Discontinued'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                              {isAr ? 'ساري' : 'Active'}
                            </span>
                          )}
                        </div>

                        {med.instructions && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {med.instructions}
                          </p>
                        )}

                        {isDiscontinued && med.discontinued_reason && (
                          <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-semibold">
                            ⚠️ {isAr ? `سبب الإيقاف: ${med.discontinued_reason}` : `Discontinued: ${med.discontinued_reason}`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isDiscontinued ? (
                          <button
                            type="button"
                            onClick={() => handleReactivateMed(idx)}
                            className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition-colors"
                          >
                            {isAr ? 'إعادة تفعيل' : 'Reactivate'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setCancellingIndex(idx); setCancelReason(''); }}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100 transition-colors"
                          >
                            {isAr ? 'إيقاف / إلغاء الدواء' : 'Discontinue'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section: Add New Medication */}
          <div className="bg-teal-50/50 dark:bg-teal-950/20 rounded-2xl p-5 border border-teal-100 dark:border-teal-900/40 space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
              <span>+</span>
              <span>{isAr ? 'إضافة دواء جديد للخطة العلاجية' : 'Add New Medication'}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={isAr ? 'اسم الدواء (مثال: Panadol, Concor)' : 'Medication Name (e.g. Panadol, Augmentin)'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-800 text-xs font-bold"
                />
              </div>

              <div>
                <input
                  type="text"
                  value={newDosage}
                  onChange={e => setNewDosage(e.target.value)}
                  placeholder={isAr ? 'الجرعة (مثال: 500 ملجم، قرص واحد)' : 'Dosage (e.g. 500mg, 1 tablet)'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-800 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={newInstructions}
                  onChange={e => setNewInstructions(e.target.value)}
                  placeholder={isAr ? 'التعليمات (مثال: بعد الأكل، مرتين يومياً)' : 'Instructions (e.g. Twice daily after meals)'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-800 text-xs font-bold"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={newSlot}
                  onChange={e => setNewSlot(e.target.value as any)}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-800 text-xs font-bold"
                >
                  <option value="morning">🌅 Morning (الصباح)</option>
                  <option value="midday">☀️ Midday (الظهيرة)</option>
                  <option value="evening">🌇 Evening (المساء)</option>
                  <option value="night">🌙 Night (الليل)</option>
                  <option value="bedtime">🌌 Bedtime (قبل النوم)</option>
                </select>

                <button
                  type="button"
                  onClick={handleAddNewMed}
                  className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 shrink-0"
                >
                  {isAr ? '+ إضافة' : '+ Add'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 hover:opacity-95 text-white text-xs font-black shadow-lg shadow-teal-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الخطة العلاجية والروشتة' : 'Save Prescription & Medications')}
          </button>
        </div>

        {/* MODAL: REASON FOR DISCONTINUING */}
        {cancellingIndex !== null && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 rounded-3xl animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-2xl max-w-sm w-full space-y-4">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                {isAr ? 'سبب إيقاف أو إلغاء الدواء' : 'Reason for Discontinuing Medication'}
              </h4>
              <p className="text-xs text-gray-500">
                {isAr ? 'اختر سبب الإيقاف ليسجل في ملف المريض والروشتة:' : 'Specify why this medication is being discontinued:'}
              </p>

              <div className="space-y-1.5">
                {[
                  'Condition improved / تم الشفاء من العَرَض',
                  'Side effects / ظهور آثار جانبية',
                  'Replaced with alternative / تم استبداله بدواء آخر',
                  'Temporary hold / إيقاف مؤقت للتحاليل',
                ].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancelReason(r)}
                    className={`w-full text-left p-2 rounded-xl text-xs font-semibold border transition-all ${
                      cancelReason === r ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder={isAr ? 'أو اكتب سبب الإيقاف هنا...' : 'Or enter custom reason...'}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellingIndex(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500"
                >
                  {isAr ? 'تراجع' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscontinue}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold shadow-md"
                >
                  {isAr ? 'تأكيد الإيقاف' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
