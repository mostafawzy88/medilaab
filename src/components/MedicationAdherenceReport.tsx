'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

type AdherenceLog = {
  id: string
  medication_name: string
  slot: string
  taken_at: string
  scheduled_date: string
}

type MedicationAdherenceReportProps = {
  patientId: string
  patientName: string
  onClose: () => void
}

const SLOTS = ['morning', 'midday', 'evening', 'night', 'bedtime']

const SLOT_ICONS: Record<string, string> = {
  morning: '🌅',
  midday: '☀️',
  evening: '🌇',
  night: '🌙',
  bedtime: '🌌',
}

function formatTime(isoStr: string) {
  try {
    return new Date(isoStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return isoStr
  }
}

function getScoreColor(score: number) {
  if (score >= 80) return { ring: '#10b981', text: 'text-emerald-600', label: 'Excellent / ممتاز' }
  if (score >= 50) return { ring: '#f59e0b', text: 'text-amber-500', label: 'Moderate / متوسط' }
  return { ring: '#ef4444', text: 'text-red-500', label: 'Needs Improvement / يحتاج تحسين' }
}

function AdherenceRing({ score }: { score: number }) {
  const { ring, text, label } = getScoreColor(score)
  const r = 44
  const circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-28 h-28">
        <svg width="112" height="112" viewBox="0 0 112 112" className="rotate-[-90deg]">
          <circle cx="56" cy="56" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke={ring}
            strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - dash}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-black ${text}`}>{Math.round(score)}%</span>
        </div>
      </div>
      <span className={`text-xs font-bold ${text}`}>{label}</span>
    </div>
  )
}

export default function MedicationAdherenceReport({
  patientId,
  patientName,
  onClose,
}: MedicationAdherenceReportProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [logs, setLogs] = useState<AdherenceLog[]>([])
  const [loading, setLoading] = useState(true)
  const [prescriptionMedCount, setPrescriptionMedCount] = useState(0)

  // Last 7 days (today included)
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const supabase = createClient()

      // Fetch adherence logs for last 7 days
      const { data: logsData } = await supabase
        .from('medication_adherence_logs')
        .select('id, medication_name, slot, taken_at, scheduled_date')
        .eq('patient_id', patientId)
        .gte('scheduled_date', days[0])
        .lte('scheduled_date', days[6])
        .order('taken_at', { ascending: true })

      let combinedLogs: AdherenceLog[] = logsData ? [...logsData] : []

      // Also check local storage logs for fallback & offline testing
      try {
        const localRaw = localStorage.getItem(`medilab_adherence_logs_${patientId}`) || localStorage.getItem('medilab_adherence_logs_patient')
        if (localRaw) {
          const localParsed = JSON.parse(localRaw)
          localParsed.forEach((item: any) => {
            if (!combinedLogs.some(c => c.slot === item.slot && c.scheduled_date === item.scheduled_date)) {
              combinedLogs.push({
                id: item.id || `local-${Math.random()}`,
                medication_name: item.medication_name || 'Medication',
                slot: item.slot || 'morning',
                taken_at: item.taken_at || new Date().toISOString(),
                scheduled_date: item.scheduled_date || new Date().toISOString().slice(0, 10),
              })
            }
          })
        }
      } catch {}

      setLogs(combinedLogs)

      // Get latest prescription to know expected daily doses
      const { data: rxData } = await supabase
        .from('prescriptions')
        .select('id, medications')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (rxData?.medications && Array.isArray(rxData.medications)) {
        // Count unique pill/slot combinations (rough approximation)
        setPrescriptionMedCount(rxData.medications.length)
      }

      setLoading(false)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  // Adherence score: logs taken / expected (meds * 7 days)
  const medCount = prescriptionMedCount > 0 ? prescriptionMedCount : Math.max(1, Math.ceil(logs.length / 5))
  const expectedDoses = medCount * 7
  const adherenceScore = expectedDoses > 0 ? Math.min(100, Math.round((logs.length / expectedDoses) * 100)) : (logs.length > 0 ? 100 : 0)

  // Best adherent slot
  const slotCounts: Record<string, number> = {}
  for (const slot of SLOTS) {
    slotCounts[slot] = logs.filter(l => l.slot === slot).length
  }
  const bestSlot = SLOTS.reduce((a, b) => (slotCounts[a] >= slotCounts[b] ? a : b), SLOTS[0])

  // Build 7-day × slot grid
  const getLog = (day: string, slot: string) =>
    logs.find(l => l.scheduled_date === day && l.slot === slot)

  const formatDay = (d: string) => {
    const date = new Date(d + 'T00:00:00')
    return date.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-3xl border border-gray-100 dark:border-gray-800 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10 rounded-t-3xl">
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              💊 {isAr ? 'تقرير الالتزام بالأدوية' : 'Medication Adherence Report'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {isAr ? 'المريض:' : 'Patient:'}{' '}
              <span className="font-bold text-purple-600 dark:text-purple-400">{patientName}</span>
              {' · '}{isAr ? 'آخر 7 أيام' : 'Last 7 Days'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="hidden md:inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold px-3 py-2 rounded-xl text-xs border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
            >
              🖨️ {isAr ? 'طباعة PDF' : 'Download PDF'}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">💊</div>
            <p>{isAr ? 'جاري تحميل التقرير...' : 'Loading report...'}</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Score + stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
                <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                  {isAr ? 'نسبة الالتزام' : 'Adherence Score'}
                </p>
                <AdherenceRing score={adherenceScore} />
              </div>

              <div className="sm:col-span-2 grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
                  <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isAr ? 'جرعات مسجلة' : 'Doses Logged'}
                  </p>
                  <p className="text-3xl font-black text-gray-900 dark:text-white mt-1">
                    {logs.length}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    / {expectedDoses > 0 ? expectedDoses : '?'} {isAr ? 'متوقع' : 'expected'}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4">
                  <p className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {isAr ? 'أفضل وقت التزام' : 'Most Adherent Time'}
                  </p>
                  <p className="text-2xl mt-1">{SLOT_ICONS[bestSlot] || '💊'}</p>
                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300 capitalize mt-0.5">
                    {bestSlot} ({slotCounts[bestSlot]} {isAr ? 'مرة' : 'times'})
                  </p>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl p-4 col-span-2">
                  <p className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    {isAr ? 'توزيع الجرعات حسب الوقت' : 'Doses by Time Slot'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {SLOTS.map(slot => (
                      <span
                        key={slot}
                        className="inline-flex items-center gap-1 bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-900/50 px-2 py-1 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300"
                      >
                        {SLOT_ICONS[slot]} {slot}:{' '}
                        <span className="text-emerald-600 dark:text-emerald-400">{slotCounts[slot]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 7-day timeline table */}
            <div>
              <h3 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                📅 {isAr ? 'جدول الأيام السبعة الماضية' : '7-Day Adherence Timeline'}
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50">
                      <th className="text-left p-3 font-black text-gray-500 dark:text-gray-400">
                        {isAr ? 'التاريخ' : 'Date'}
                      </th>
                      {SLOTS.map(slot => (
                        <th key={slot} className="text-center p-3 font-black text-gray-500 dark:text-gray-400 capitalize">
                          {SLOT_ICONS[slot]} {slot}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, idx) => (
                      <tr
                        key={day}
                        className={`border-t border-gray-100 dark:border-gray-800 ${
                          idx % 2 === 0 ? '' : 'bg-gray-50/30 dark:bg-gray-800/20'
                        }`}
                      >
                        <td className="p-3 font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatDay(day)}
                        </td>
                        {SLOTS.map(slot => {
                          const log = getLog(day, slot)
                          return (
                            <td key={slot} className="p-3 text-center">
                              {log ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <span className="text-emerald-500 text-base">✅</span>
                                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
                                    {formatTime(log.taken_at)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600 text-base">❌</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {logs.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">📭</div>
                <p className="font-medium">
                  {isAr
                    ? 'لا توجد بيانات التزام مسجلة في الأسبوع الماضي'
                    : 'No adherence data recorded in the last 7 days'}
                </p>
                <p className="text-sm mt-1">
                  {isAr
                    ? 'يمكن للمريض تسجيل تناول الأدوية من صفحة الوصفات'
                    : 'Patient can log medication intake from their Prescriptions tab'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
