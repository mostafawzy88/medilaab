'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

interface TriageVitalsModalProps {
  appointmentId: string
  patientName: string
  currentQueuePosition: number
  currentNotes?: string | null
  onClose: () => void
  onSuccess: () => Promise<void> | void
}

export default function TriageVitalsModal({
  appointmentId,
  patientName,
  currentQueuePosition,
  currentNotes,
  onClose,
  onSuccess
}: TriageVitalsModalProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  // Extract existing vitals if present
  const parseExisting = () => {
    const raw = currentNotes || ''
    const bpMatch = raw.match(/BP:([0-9/]+)/)
    const tempMatch = raw.match(/Temp:([0-9.]+)/)
    const pulseMatch = raw.match(/Pulse:([0-9]+)/)
    const weightMatch = raw.match(/Wt:([0-9.]+)/)
    const glucoseMatch = raw.match(/Sugar:([0-9]+)/)
    const priorityMatch = raw.match(/Priority:(Emergency|Urgent|Normal)/)
    const nurseNoteMatch = raw.match(/\[NURSE_NOTE:\s*([^\]]+)\]/)

    return {
      bp: bpMatch ? bpMatch[1] : '',
      temp: tempMatch ? tempMatch[1] : '',
      pulse: pulseMatch ? pulseMatch[1] : '',
      weight: weightMatch ? weightMatch[1] : '',
      glucose: glucoseMatch ? glucoseMatch[1] : '',
      priority: (priorityMatch ? priorityMatch[1] : 'Normal') as 'Normal' | 'Urgent' | 'Emergency',
      note: nurseNoteMatch ? nurseNoteMatch[1] : ''
    }
  }

  const existing = parseExisting()

  const [queuePosition, setQueuePosition] = useState<number>(currentQueuePosition || 1)
  const [bp, setBp] = useState(existing.bp)
  const [temp, setTemp] = useState(existing.temp)
  const [pulse, setPulse] = useState(existing.pulse)
  const [weight, setWeight] = useState(existing.weight)
  const [glucose, setGlucose] = useState(existing.glucose)
  const [priority, setPriority] = useState<'Normal' | 'Urgent' | 'Emergency'>(existing.priority)
  const [nurseNote, setNurseNote] = useState(existing.note)
  const [markArrived, setMarkArrived] = useState(!currentNotes?.includes('[ARRIVED:'))
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const supabase = createClient()

      // Strip existing vitals / nurse note tags from currentNotes
      let cleanNotes = (currentNotes || '')
        .replace(/\[VITALS:[^\]]+\]/g, '')
        .replace(/\[NURSE_NOTE:[^\]]+\]/g, '')
        .trim()

      // Build Vitals tag
      const vitalsParts: string[] = []
      if (bp) vitalsParts.push(`BP:${bp.trim()}`)
      if (temp) vitalsParts.push(`Temp:${temp.trim()}°C`)
      if (pulse) vitalsParts.push(`Pulse:${pulse.trim()}bpm`)
      if (weight) vitalsParts.push(`Wt:${weight.trim()}kg`)
      if (glucose) vitalsParts.push(`Sugar:${glucose.trim()}mg/dL`)
      vitalsParts.push(`Priority:${priority}`)

      const vitalsTag = `[VITALS: ${vitalsParts.join(' | ')}]`
      const nurseTag = nurseNote.trim() ? `[NURSE_NOTE: ${nurseNote.trim()}]` : ''
      const arrivalTag = markArrived && !cleanNotes.includes('[ARRIVED:')
        ? `[ARRIVED: ${new Date().toISOString()}]`
        : ''

      const finalNotes = [cleanNotes, vitalsTag, nurseTag, arrivalTag].filter(Boolean).join(' ').trim()

      const { error } = await supabase
        .from('appointments')
        .update({
          queue_position: Number(queuePosition) || 1,
          notes: finalNotes || null
        })
        .eq('id', appointmentId)

      if (error) {
        alert(isAr ? 'خطأ أثناء حفظ البيانات: ' + error.message : 'Error updating vitals: ' + error.message)
        setSaving(false)
        return
      }

      await onSuccess()
      onClose()
    } catch (err: any) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 border border-gray-100 dark:border-gray-800 shadow-2xl space-y-5">
        
        {/* Header */}
        <div className="flex justify-between items-start pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🩺</span>
              <h3 className="text-xl font-black text-gray-900 dark:text-white">
                {isAr ? 'إدخال العلامات الحيوية وطابور الانتظار' : 'Queue Management & Patient Vitals'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isAr ? `المريض: ${patientName}` : `Patient: ${patientName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          
          {/* Row 1: Queue Position & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-gray-500 flex items-center gap-1">
                <span>🔢</span>
                <span>{isAr ? 'رقم الدور (Q#)' : 'Queue Number (Q#)'}</span>
              </label>
              <input
                type="number"
                min="1"
                max="999"
                value={queuePosition}
                onChange={(e) => setQueuePosition(parseInt(e.target.value) || 1)}
                className="w-full rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 font-black text-base text-gray-900 dark:text-white focus:border-teal-500 outline-none"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-black uppercase text-gray-500 flex items-center gap-1">
                <span>⚡</span>
                <span>{isAr ? 'درجة الأولوية' : 'Triage Priority'}</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 font-bold text-sm text-gray-900 dark:text-white focus:border-teal-500 outline-none"
              >
                <option value="Normal">{isAr ? '🟢 عادية (Normal)' : '🟢 Normal'}</option>
                <option value="Urgent">{isAr ? '🟡 عاجلة (Urgent)' : '🟡 Urgent'}</option>
                <option value="Emergency">{isAr ? '🔴 طارئة (Emergency)' : '🔴 Emergency'}</option>
              </select>
            </div>
          </div>

          {/* Row 2: Vitals Grid (BP, Temp, Pulse, Weight) */}
          <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 space-y-3">
            <p className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
              <span>📊</span>
              <span>{isAr ? 'العلامات الحيوية المقاسة (Vitals):' : 'Measured Vital Signs:'}</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Blood Pressure */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                  {isAr ? 'ضغط الدم (BP)' : 'Blood Pressure (BP)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 120/80"
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 text-xs font-bold outline-none focus:border-teal-500"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                  {isAr ? 'الحرارة (°C)' : 'Temperature (°C)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 37.2"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 text-xs font-bold outline-none focus:border-teal-500"
                />
              </div>

              {/* Heart Rate / Pulse */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                  {isAr ? 'النبض (bpm)' : 'Heart Rate (bpm)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 75"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 text-xs font-bold outline-none focus:border-teal-500"
                />
              </div>

              {/* Weight */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                  {isAr ? 'الوزن (kg)' : 'Weight (kg)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 72"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 text-xs font-bold outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Blood Glucose */}
            <div className="pt-1">
              <label className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                {isAr ? 'السكر العشوائي (mg/dL) - اختياري' : 'Random Blood Glucose (mg/dL) - Optional'}
              </label>
              <input
                type="text"
                placeholder="e.g. 110"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
                className="w-full mt-1 rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 text-xs font-bold outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Nurse Triage Observation Note */}
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-gray-500 flex items-center gap-1">
              <span>📝</span>
              <span>{isAr ? 'ملاحظات التمريض للطبيب المشرف' : 'Nurse Clinical Notes for Doctor'}</span>
            </label>
            <textarea
              rows={2}
              value={nurseNote}
              onChange={(e) => setNurseNote(e.target.value)}
              placeholder={isAr ? 'اكتب شكوى المريض أو حالته الظاهرة للطبيب...' : 'Observations, active complaints, or special triage instructions...'}
              className="w-full rounded-xl px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-teal-500 resize-none"
            />
          </div>

          {/* Checkbox: Mark Arrived in Waiting Room */}
          {!currentNotes?.includes('[ARRIVED:') && (
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-pointer">
              <input
                type="checkbox"
                checked={markArrived}
                onChange={(e) => setMarkArrived(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 rounded"
              />
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {isAr ? '✓ تأكيد حضور المريض الآن في صالة الانتظار' : '✓ Mark patient as arrived in waiting room now'}
              </span>
            </label>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-2xl hover:bg-gray-200"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black py-3 rounded-2xl shadow-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>{isAr ? 'حفظ وتحديث بيانات الطابور' : 'Save & Update Queue Data'}</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
