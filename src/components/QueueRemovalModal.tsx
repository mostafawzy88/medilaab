'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

export default function QueueRemovalModal({
  appointmentId,
  patientName,
  ticketNum,
  currentNotes,
  onClose,
  onSuccess,
}: {
  appointmentId: string
  patientName: string
  ticketNum?: number | string
  currentNotes?: string | null
  onClose: () => void
  onSuccess: () => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [reason, setReason] = useState('Patient left in a hurry / اضطر للمغادرة لظرف طارئ')
  const [customNote, setCustomNote] = useState('')
  const [saving, setSaving] = useState(false)

  const REASONS = [
    { key: 'hurry', labelEn: 'Patient left in a hurry', labelAr: 'اضطر المريض للمغادرة على عجل لظرف طارئ' },
    { key: 'no_show', labelEn: 'Did not show up', labelAr: 'لم يحضر المريض للعيادة' },
    { key: 'postpone', labelEn: 'Requested postponement / reschedule', labelAr: 'طلب المريض تأجيل الموعد' },
    { key: 'other', labelEn: 'Other clinical reason', labelAr: 'سبب تنظيمي أو عيادي آخر' },
  ]

  const handleConfirmRemoval = async () => {
    setSaving(true)
    const supabase = createClient()

    const notePart = customNote.trim() ? `Note: ${customNote.trim()}` : ''
    const fullRemovalTag = `[REMOVED_FROM_QUEUE: ${reason}] ${notePart ? `[NURSE_NOTE: ${notePart}]` : ''} [REMOVED_AT: ${new Date().toISOString()}]`

    const existingNotes = currentNotes ? currentNotes + ' ' : ''
    const updatedNotes = `${existingNotes}${fullRemovalTag}`.trim()

    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        notes: updatedNotes,
        queue_position: 0
      })
      .eq('id', appointmentId)

    setSaving(false)
    if (!error) {
      alert(isAr ? '✓ تم إخراج المريض من الطابور وتسجيل الملاحظة للطبيب والمريض.' : '✓ Patient removed from queue. Note logged for doctor, schedule, and patient.')
      onSuccess()
    } else {
      alert('Error updating queue: ' + error.message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-xl shrink-0">
              🏃
            </span>
            <div>
              <h3 className="font-black text-gray-900 dark:text-white text-base">
                {isAr ? 'إخراج مريض من طابور الانتظار' : 'Remove Patient from Queue'}
              </h3>
              <p className="text-xs text-gray-500 font-bold">
                {patientName} {ticketNum ? `(Q${ticketNum})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center text-xs"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {isAr
            ? 'حدد سبب إخراج المريض واكتب ملاحظتك. ستظهر هذه الملاحظة فوراً في جدول العيادة، ولدى الطبيب، وفي حساب المريض.'
            : 'Specify the reason for removing this patient from the queue. This note will be visible to the doctor, clinic schedule, and the patient.'}
        </p>

        {/* Reason Selector */}
        <div className="space-y-2">
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block">
            {isAr ? 'سبب الخروج من الطابور' : 'Reason for Leaving / Removal'}
          </label>
          <div className="space-y-1.5">
            {REASONS.map(r => {
              const text = isAr ? r.labelAr : r.labelEn
              const isSelected = reason === text
              return (
                <div
                  key={r.key}
                  onClick={() => setReason(text)}
                  className={`p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <span>{text}</span>
                  {isSelected && <span className="text-rose-600">✓</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Custom Note */}
        <div>
          <label className="text-xs font-black uppercase tracking-wider text-gray-500 block mb-1">
            {isAr ? 'ملاحظة تفصيلية للطبيب والمريض (اختياري)' : 'Detailed Note for Doctor & Patient (Optional)'}
          </label>
          <textarea
            rows={3}
            value={customNote}
            onChange={e => setCustomNote(e.target.value)}
            placeholder={isAr ? 'مثال: المريض اضطر للمغادرة بسبب حالة طوارئ بالعمل وسيطلب إعادة الجدولة غداً...' : 'e.g. Patient had an emergency at work and had to leave, requested to reschedule for tomorrow...'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          <button
            type="button"
            onClick={handleConfirmRemoval}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'تأكيد الخروج من الطابور' : 'Confirm Removal')}
          </button>
        </div>
      </div>
    </div>
  )
}
