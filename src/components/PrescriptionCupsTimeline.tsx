'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLocale } from 'next-intl'

// ─── TYPES ──────────────────────────────────────────────────────────────────
export type CupSlot = 'morning' | 'midday' | 'evening' | 'night' | 'bedtime'

export type PillItem = {
  id: string
  name: string
  dosage: string
  instructions?: string
  slot: CupSlot
  colorType: 'red_white' | 'cyan_white' | 'amber_gold' | 'emerald' | 'purple' | 'orange'
  shape: 'capsule' | 'tablet' | 'softgel' | 'caplet'
  sourceRxId?: string
  doctorName?: string
  takenToday?: boolean
  isDemo?: boolean
}

const CUP_DEFINITIONS: {
  slot: CupSlot
  titleEn: string
  titleAr: string
  timeStr: string
  hourRange: [number, number]
  icon: string
  gradient: string
  glowColor: string
  liquidColor: string
}[] = [
  {
    slot: 'morning',
    titleEn: 'Morning Cup',
    titleAr: 'كوب الصباح',
    timeStr: '08:00 AM',
    hourRange: [6, 11],
    icon: '🌅',
    gradient: 'from-amber-400 via-orange-400 to-rose-400',
    glowColor: 'rgba(251, 146, 60, 0.35)',
    liquidColor: 'rgba(251, 146, 60, 0.15)',
  },
  {
    slot: 'midday',
    titleEn: 'Midday Cup',
    titleAr: 'كوب الظهيرة',
    timeStr: '01:00 PM',
    hourRange: [11, 15],
    icon: '☀️',
    gradient: 'from-cyan-400 via-teal-400 to-emerald-400',
    glowColor: 'rgba(45, 212, 191, 0.35)',
    liquidColor: 'rgba(45, 212, 191, 0.15)',
  },
  {
    slot: 'evening',
    titleEn: 'Evening Cup',
    titleAr: 'كوب المساء',
    timeStr: '05:30 PM',
    hourRange: [15, 19],
    icon: '🌇',
    gradient: 'from-orange-500 via-amber-500 to-yellow-400',
    glowColor: 'rgba(249, 115, 22, 0.35)',
    liquidColor: 'rgba(249, 115, 22, 0.15)',
  },
  {
    slot: 'night',
    titleEn: 'Night Cup',
    titleAr: 'كوب الليل',
    timeStr: '09:00 PM',
    hourRange: [19, 23],
    icon: '🌙',
    gradient: 'from-indigo-400 via-purple-500 to-pink-500',
    glowColor: 'rgba(168, 85, 247, 0.35)',
    liquidColor: 'rgba(168, 85, 247, 0.15)',
  },
  {
    slot: 'bedtime',
    titleEn: 'Bedtime Cup',
    titleAr: 'كوب قبل النوم',
    timeStr: '11:30 PM',
    hourRange: [23, 6],
    icon: '🌌',
    gradient: 'from-violet-500 via-purple-600 to-indigo-700',
    glowColor: 'rgba(139, 92, 246, 0.4)',
    liquidColor: 'rgba(139, 92, 246, 0.18)',
  },
]

// Sample demonstration pills when patient has no prescriptions yet
const DEMO_PILLS: PillItem[] = [
  {
    id: 'demo-1',
    name: 'Vitamin D3 + K2',
    dosage: '5000 IU',
    instructions: 'Take with breakfast',
    slot: 'morning',
    colorType: 'amber_gold',
    shape: 'softgel',
    doctorName: 'Dr. Don',
    isDemo: true,
  },
  {
    id: 'demo-2',
    name: 'Augmentin (Amoxicillin)',
    dosage: '1000 mg',
    instructions: '1 tablet after breakfast',
    slot: 'morning',
    colorType: 'red_white',
    shape: 'capsule',
    doctorName: 'Dr. Ahmed Fawzy',
    isDemo: true,
  },
  {
    id: 'demo-3',
    name: 'Omega 3 Fish Oil',
    dosage: '1000 mg',
    instructions: 'Take after lunch with water',
    slot: 'midday',
    colorType: 'amber_gold',
    shape: 'softgel',
    doctorName: 'Dr. Don',
    isDemo: true,
  },
  {
    id: 'demo-4',
    name: 'Zinc & Vitamin C',
    dosage: '50 mg',
    instructions: 'Take with an evening snack',
    slot: 'evening',
    colorType: 'orange',
    shape: 'tablet',
    doctorName: 'Dr. Don',
    isDemo: true,
  },
  {
    id: 'demo-5',
    name: 'Augmentin (Amoxicillin)',
    dosage: '1000 mg',
    instructions: '1 tablet after dinner',
    slot: 'night',
    colorType: 'red_white',
    shape: 'capsule',
    doctorName: 'Dr. Ahmed Fawzy',
    isDemo: true,
  },
  {
    id: 'demo-6',
    name: 'Magnesium Glycinate',
    dosage: '400 mg',
    instructions: '30 mins before sleep',
    slot: 'bedtime',
    colorType: 'purple',
    shape: 'capsule',
    doctorName: 'Dr. Don',
    isDemo: true,
  },
]

// ─── 3D PILL RENDERING COMPONENT ────────────────────────────────────────────
function PillVisual({
  pill,
  isTaken,
  onToggleTaken,
}: {
  pill: PillItem
  isTaken: boolean
  onToggleTaken: () => void
}) {
  const getPillGraphic = () => {
    switch (pill.colorType) {
      case 'red_white':
        return (
          <div className="relative w-7 h-12 rounded-full overflow-hidden shadow-lg border border-white/20 transform -rotate-12 group-hover:rotate-0 transition-transform">
            {/* Top red half */}
            <div className="h-1/2 w-full bg-gradient-to-br from-rose-500 to-red-600 relative">
              <span className="absolute top-1 left-1.5 w-1.5 h-3 bg-white/40 rounded-full blur-[0.5px]" />
            </div>
            {/* Bottom white half */}
            <div className="h-1/2 w-full bg-gradient-to-br from-white to-gray-200 relative">
              <span className="absolute bottom-1 right-1.5 w-1 h-2 bg-white/60 rounded-full blur-[0.5px]" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-black/20 pointer-events-none" />
          </div>
        )
      case 'cyan_white':
        return (
          <div className="relative w-7 h-12 rounded-full overflow-hidden shadow-lg border border-white/20 transform rotate-12 group-hover:rotate-0 transition-transform">
            <div className="h-1/2 w-full bg-gradient-to-br from-cyan-400 to-teal-500 relative">
              <span className="absolute top-1 left-1.5 w-1.5 h-3 bg-white/40 rounded-full blur-[0.5px]" />
            </div>
            <div className="h-1/2 w-full bg-gradient-to-br from-slate-100 to-gray-200 relative">
              <span className="absolute bottom-1 right-1.5 w-1 h-2 bg-white/60 rounded-full blur-[0.5px]" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-black/20 pointer-events-none" />
          </div>
        )
      case 'amber_gold':
        return (
          <div className="relative w-6 h-11 rounded-full overflow-hidden shadow-lg border border-amber-300/40 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 transform -rotate-6 group-hover:rotate-0 transition-transform">
            <span className="absolute top-1.5 left-1 w-1.5 h-4 bg-white/60 rounded-full blur-[0.5px]" />
            <span className="absolute bottom-1.5 right-1 w-1 h-2 bg-amber-100/50 rounded-full blur-[0.5px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/30" />
          </div>
        )
      case 'emerald':
        return (
          <div className="relative w-8 h-8 rounded-full overflow-hidden shadow-lg border border-emerald-400/40 bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center transform group-hover:scale-105 transition-transform">
            <div className="w-full h-0.5 bg-black/20 shadow-sm" />
            <span className="absolute top-1 left-1.5 w-2 h-2 bg-white/40 rounded-full blur-[0.5px]" />
          </div>
        )
      case 'purple':
        return (
          <div className="relative w-7 h-12 rounded-full overflow-hidden shadow-lg border border-purple-400/30 transform -rotate-15 group-hover:rotate-0 transition-transform">
            <div className="h-1/2 w-full bg-gradient-to-br from-purple-500 to-indigo-600 relative">
              <span className="absolute top-1 left-1.5 w-1.5 h-3 bg-white/40 rounded-full blur-[0.5px]" />
            </div>
            <div className="h-1/2 w-full bg-gradient-to-br from-pink-400 to-rose-400 relative">
              <span className="absolute bottom-1 right-1.5 w-1 h-2 bg-white/50 rounded-full blur-[0.5px]" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-black/20 pointer-events-none" />
          </div>
        )
      case 'orange':
      default:
        return (
          <div className="relative w-8 h-8 rounded-full overflow-hidden shadow-lg border border-orange-400/30 bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center transform group-hover:scale-105 transition-transform">
            <div className="w-full h-0.5 bg-black/20" />
            <span className="absolute top-1 left-1.5 w-2 h-2 bg-white/50 rounded-full blur-[0.5px]" />
          </div>
        )
    }
  }

  return (
    <div
      onClick={onToggleTaken}
      className={`group relative p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
        isTaken
          ? 'bg-emerald-950/30 border-emerald-500/40 opacity-75'
          : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 hover:border-white/20 hover:scale-[1.02]'
      }`}
    >
      <div className="shrink-0">{getPillGraphic()}</div>

      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <p className={`font-bold text-sm truncate ${isTaken ? 'line-through text-gray-400' : 'text-white'}`}>
            {pill.name}
          </p>
          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-white/10 text-cyan-300 shrink-0">
            {pill.dosage}
          </span>
        </div>
        {pill.instructions && (
          <p className="text-[11px] text-gray-400 truncate mt-0.5">
            {pill.instructions}
          </p>
        )}
      </div>

      {/* Taken check indicator */}
      <button
        type="button"
        className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all shrink-0 ${
          isTaken
            ? 'bg-emerald-500 border-emerald-400 text-white shadow-md shadow-emerald-500/40'
            : 'border-white/30 text-transparent hover:border-white/60'
        }`}
        title={isTaken ? 'Mark as not taken' : 'Mark as taken'}
      >
        <span className="text-xs font-black">✓</span>
      </button>
    </div>
  )
}

// ─── MAIN PRESCRIPTION CUPS TIMELINE COMPONENT ──────────────────────────────
export default function PrescriptionCupsTimeline({
  prescriptions = [],
  loading = false,
  patientName = 'Patient',
  onViewPrescription,
}: {
  prescriptions?: any[]
  loading?: boolean
  patientName?: string
  onViewPrescription?: (rx: any) => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [activeSlot, setActiveSlot] = useState<CupSlot>('morning')
  const [takenPills, setTakenPills] = useState<Record<string, boolean>>({})
  const [useSampleRoutine, setUseSampleRoutine] = useState(false)
  const [showAddCustomModal, setShowAddCustomModal] = useState(false)
  const [customPills, setCustomPills] = useState<PillItem[]>([])

  // Form for custom pill
  const [customName, setCustomName] = useState('')
  const [customDosage, setCustomDosage] = useState('')
  const [customSlot, setCustomSlot] = useState<CupSlot>('morning')
  const [customInstructions, setCustomInstructions] = useState('')

  // Determine current time and auto-select active cup
  useEffect(() => {
    const currentHour = new Date().getHours()
    if (currentHour >= 6 && currentHour < 11) setActiveSlot('morning')
    else if (currentHour >= 11 && currentHour < 15) setActiveSlot('midday')
    else if (currentHour >= 15 && currentHour < 19) setActiveSlot('evening')
    else if (currentHour >= 19 && currentHour < 23) setActiveSlot('night')
    else setActiveSlot('bedtime')
  }, [])

  // Load saved adherence from localStorage
  useEffect(() => {
    try {
      const todayKey = `medilab_taken_${new Date().toISOString().slice(0, 10)}`
      const saved = localStorage.getItem(todayKey)
      if (saved) {
        setTakenPills(JSON.parse(saved))
      }
    } catch {
      // ignore
    }
  }, [])

  const toggleTaken = (pillId: string) => {
    setTakenPills(prev => {
      const next = { ...prev, [pillId]: !prev[pillId] }
      try {
        const todayKey = `medilab_taken_${new Date().toISOString().slice(0, 10)}`
        localStorage.setItem(todayKey, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  // Parse pills from official doctor prescriptions
  const parsedDoctorPills = useMemo<PillItem[]>(() => {
    const pills: PillItem[] = []
    const colorCycle: PillItem['colorType'][] = [
      'red_white',
      'cyan_white',
      'amber_gold',
      'purple',
      'emerald',
      'orange',
    ]

    let colorIdx = 0

    prescriptions.forEach(rx => {
      if (!Array.isArray(rx.medications)) return

      rx.medications.forEach((med: any, mIdx: number) => {
        if (!med.name) return
        const instLower = (med.instructions || '').toLowerCase()
        const doseLower = (med.dosage || '').toLowerCase()

        // Determine which slot or slots this medication belongs to
        const slots: CupSlot[] = []

        if (instLower.includes('bed') || instLower.includes('نوم') || instLower.includes('night')) {
          slots.push('bedtime')
        } else if (instLower.includes('twice') || instLower.includes('مرتين')) {
          slots.push('morning', 'night')
        } else if (instLower.includes('three') || instLower.includes('3 مرات')) {
          slots.push('morning', 'midday', 'night')
        } else if (instLower.includes('four') || instLower.includes('4 مرات')) {
          slots.push('morning', 'midday', 'evening', 'night')
        } else if (instLower.includes('morning') || instLower.includes('صباح') || instLower.includes('إفطار')) {
          slots.push('morning')
        } else if (instLower.includes('lunch') || instLower.includes('غداء') || instLower.includes('noon')) {
          slots.push('midday')
        } else if (instLower.includes('dinner') || instLower.includes('عشاء') || instLower.includes('مساء')) {
          slots.push('night')
        } else {
          // Default distribution based on index
          const fallbackSlots: CupSlot[] = ['morning', 'midday', 'evening', 'night', 'bedtime']
          slots.push(fallbackSlots[mIdx % fallbackSlots.length])
        }

        const color = colorCycle[colorIdx % colorCycle.length]
        colorIdx++

        slots.forEach((s, sIdx) => {
          pills.push({
            id: `rx-${rx.id}-${mIdx}-${sIdx}`,
            name: med.name,
            dosage: med.dosage || '1 tab',
            instructions: med.instructions,
            slot: s,
            colorType: color,
            shape: color === 'amber_gold' ? 'softgel' : color === 'emerald' ? 'tablet' : 'capsule',
            sourceRxId: rx.id,
            doctorName: rx.doctor_name || 'Clinic Doctor',
          })
        })
      })
    })

    return pills
  }, [prescriptions])

  // Combined pills: parsed from prescriptions + user custom + demo (if enabled or if no rx)
  const hasRealPills = parsedDoctorPills.length > 0
  const showDemo = useSampleRoutine || (!hasRealPills && customPills.length === 0)

  const allActivePills = useMemo<PillItem[]>(() => {
    let list: PillItem[] = []
    if (hasRealPills) {
      list = [...parsedDoctorPills, ...customPills]
    } else if (showDemo) {
      list = [...DEMO_PILLS, ...customPills]
    } else {
      list = [...customPills]
    }
    return list
  }, [hasRealPills, parsedDoctorPills, customPills, showDemo])

  // Count adherence
  const totalPillsCount = allActivePills.length
  const takenCount = allActivePills.filter(p => takenPills[p.id]).length
  const adherencePercent = totalPillsCount > 0 ? Math.round((takenCount / totalPillsCount) * 100) : 0

  const handleAddCustomPill = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customName.trim()) return

    const newPill: PillItem = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      dosage: customDosage.trim() || '1 tab',
      instructions: customInstructions.trim(),
      slot: customSlot,
      colorType: 'cyan_white',
      shape: 'capsule',
    }

    setCustomPills(prev => [...prev, newPill])
    setCustomName('')
    setCustomDosage('')
    setCustomInstructions('')
    setShowAddCustomModal(false)
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-700 font-[family-name:var(--font-geist-sans)]">
      {/* ── TOP HERO HEADER (Google Antigravity Style) ── */}
      <div className="relative overflow-hidden rounded-[32px] bg-[#07050E] border border-white/10 shadow-2xl p-6 sm:p-10 text-white">
        {/* Glow Spheres */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-cyan-500/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-600/25 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black bg-white/[0.08] border border-white/15 text-cyan-300 backdrop-blur-md uppercase tracking-widest shadow-inner">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{isAr ? 'الجدول الزمني الذكي للجرعات' : 'Daily Medication Timeline'}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
              {isAr ? 'كؤوس الأدوية اليومية' : 'Daily Prescription Cups'}
            </h1>

            <p className="text-gray-300 text-sm sm:text-base leading-relaxed">
              {isAr
                ? 'نظام مرئي مبتكر ينظم أدويتك وجرعاتك على مدار اليوم في خمسة كؤوس مخصصة وفق أوقاتها المحددة، لمتابعة تناول أقراصك بسهولة ودقة.'
                : 'An intuitive visual medicine organizer distributing your daily pills into five dedicated cups across the daytime spectrum for seamless tracking.'}
            </p>
          </div>

          {/* Adherence Widget & Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
            {/* Progress Card */}
            <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shadow-xl">
              <div className="relative w-14 h-14 rounded-full flex items-center justify-center border-4 border-cyan-500/30 bg-black/40">
                <span className="font-black text-sm text-cyan-300">{adherencePercent}%</span>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {isAr ? 'نسبة الالتزام اليوم' : "Today's Adherence"}
                </p>
                <p className="text-sm font-bold text-white mt-0.5">
                  {takenCount} of {totalPillsCount} {isAr ? 'جرعة تم تناولها' : 'doses taken'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAddCustomModal(true)}
              className="px-5 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-400 hover:opacity-95 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/25 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 shrink-0"
            >
              <span className="text-lg leading-none">+</span>
              <span>{isAr ? 'إضافة دواء للجدول' : 'Add Medication'}</span>
            </button>
          </div>
        </div>

        {/* Preview Mode Notification Banner if demo is active */}
        {showDemo && !hasRealPills && (
          <div className="mt-8 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-300">
              <span className="text-base">✨</span>
              <span className="font-bold">
                {isAr
                  ? 'نمط الاستعراض: لم يُصدر لك الطبيب روشتة بعد. يمكنك استكشاف الكؤوس الخمسة والتجربة، أو إضافة أدويتك الخاصة.'
                  : 'Interactive Preview Mode: No official doctor prescriptions yet. Explore the 5 daily cups demo or add your custom supplements.'}
              </span>
            </div>
            <button
              onClick={() => setUseSampleRoutine(prev => !prev)}
              className="text-cyan-300 hover:text-white font-bold underline transition-colors"
            >
              {useSampleRoutine ? (isAr ? 'إخفاء العينات' : 'Hide Demo Pills') : (isAr ? 'عرض عينات الأدوية' : 'Show Demo Pills')}
            </button>
          </div>
        )}
      </div>

      {/* ── THE 5 CUPS HORIZONTAL TIMELINE ── */}
      <div className="relative bg-[#07050E] rounded-[32px] p-6 sm:p-10 border border-white/10 shadow-2xl overflow-hidden">
        {/* Glowing Day Timeline Track */}
        <div className="hidden lg:block absolute top-[110px] left-12 right-12 h-1 bg-gradient-to-r from-amber-400 via-cyan-400 via-orange-500 via-purple-500 to-indigo-600 rounded-full opacity-40 blur-[0.5px]" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 relative z-10">
          {CUP_DEFINITIONS.map((def) => {
            const isSelected = activeSlot === def.slot
            const slotPills = allActivePills.filter(p => p.slot === def.slot)
            const takenSlotPills = slotPills.filter(p => takenPills[p.id])

            return (
              <div
                key={def.slot}
                onClick={() => setActiveSlot(def.slot)}
                className={`relative rounded-3xl p-5 transition-all cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-white/[0.08] border-2 border-cyan-400 shadow-2xl shadow-cyan-500/15 scale-[1.03]'
                    : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20'
                }`}
                style={{
                  boxShadow: isSelected ? `0 10px 40px -10px ${def.glowColor}` : undefined,
                }}
              >
                {/* Top Slot Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{def.icon}</span>
                    <div>
                      <h3 className="font-black text-white text-sm">
                        {isAr ? def.titleAr : def.titleEn}
                      </h3>
                      <p className="text-[11px] text-gray-400 font-mono font-semibold">
                        {def.timeStr}
                      </p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    slotPills.length > 0 
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'bg-white/5 text-gray-500'
                  }`}>
                    {slotPills.length} {isAr ? 'حبوب' : 'pills'}
                  </span>
                </div>

                {/* ── THE 3D GLASS MEDICINE CUP VISUAL ── */}
                <div className="my-6 relative flex flex-col items-center justify-center">
                  {/* Glowing Ambient Light Beneath Cup */}
                  <div
                    className="absolute w-24 h-24 rounded-full blur-2xl opacity-50 pointer-events-none transition-opacity"
                    style={{ backgroundColor: def.glowColor }}
                  />

                  {/* Glass Cup Graphic */}
                  <div className="relative w-28 h-32 rounded-b-[28px] rounded-t-[10px] border-2 border-white/30 backdrop-blur-xl shadow-inner flex flex-col justify-end p-2 overflow-hidden"
                    style={{
                      background: `linear-gradient(180deg, rgba(255,255,255,0.08) 0%, ${def.liquidColor} 100%)`,
                    }}
                  >
                    {/* Glass measurement markings */}
                    <div className="absolute top-4 left-2 flex flex-col gap-2.5 opacity-30 pointer-events-none">
                      <div className="w-3 h-0.5 bg-white" />
                      <div className="w-2 h-0.5 bg-white" />
                      <div className="w-4 h-0.5 bg-white" />
                      <div className="w-2 h-0.5 bg-white" />
                    </div>

                    {/* Top glass refraction rim */}
                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-b from-white/40 to-transparent" />

                    {/* PILLS "THROWN" INSIDE CUP */}
                    <div className="relative z-10 flex flex-wrap items-center justify-center gap-1.5 min-h-[50px]">
                      {slotPills.length === 0 ? (
                        <div className="text-[10px] font-medium text-gray-500 italic text-center px-1">
                          {isAr ? 'كوب فارغ' : 'Empty cup'}
                        </div>
                      ) : (
                        slotPills.map((pill, idx) => (
                          <div
                            key={pill.id}
                            className={`transform transition-transform duration-300 ${
                              idx % 2 === 0 ? '-rotate-12 translate-y-1' : 'rotate-12 -translate-y-1'
                            }`}
                            title={`${pill.name} (${pill.dosage})`}
                          >
                            {pill.colorType === 'red_white' ? (
                              <div className="w-4 h-8 rounded-full overflow-hidden shadow-md border border-white/30">
                                <div className="h-1/2 bg-red-500" />
                                <div className="h-1/2 bg-white" />
                              </div>
                            ) : pill.colorType === 'cyan_white' ? (
                              <div className="w-4 h-8 rounded-full overflow-hidden shadow-md border border-white/30">
                                <div className="h-1/2 bg-cyan-400" />
                                <div className="h-1/2 bg-white" />
                              </div>
                            ) : pill.colorType === 'amber_gold' ? (
                              <div className="w-4 h-7 rounded-full bg-gradient-to-b from-amber-300 to-yellow-500 shadow-md border border-amber-200/50" />
                            ) : pill.colorType === 'emerald' ? (
                              <div className="w-5 h-5 rounded-full bg-emerald-400 shadow-md border border-emerald-300/40" />
                            ) : pill.colorType === 'purple' ? (
                              <div className="w-4 h-8 rounded-full overflow-hidden shadow-md border border-purple-300/40">
                                <div className="h-1/2 bg-purple-500" />
                                <div className="h-1/2 bg-pink-400" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-orange-400 shadow-md border border-orange-300/40" />
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Bottom cup base refraction */}
                    <div className="w-full h-1 bg-white/20 rounded-full mt-1" />
                  </div>
                </div>

                {/* Bottom Cup Status Indicator */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                  <span className={`font-bold ${isSelected ? 'text-cyan-300' : 'text-gray-400'}`}>
                    {isSelected ? (isAr ? 'الكوب المحدد' : 'Selected') : (isAr ? 'عرض الكوب' : 'Inspect')}
                  </span>
                  {slotPills.length > 0 && (
                    <span className="text-[11px] font-mono font-bold text-gray-400">
                      {takenSlotPills.length}/{slotPills.length} ✓
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── ACTIVE CUP DETAIL DRAWER (Pills & Instructions) ── */}
        <div className="mt-8 pt-8 border-t border-white/10">
          {(() => {
            const currentDef = CUP_DEFINITIONS.find(d => d.slot === activeSlot)!
            const activeSlotPills = allActivePills.filter(p => p.slot === activeSlot)

            return (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{currentDef.icon}</span>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white">
                        {isAr ? currentDef.titleAr : currentDef.titleEn} — {currentDef.timeStr}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isAr
                          ? `تحتوي هذه الجرعة على ${activeSlotPills.length} أقراص / كبسولات مقررة لتناولها في هذا التوقيت.`
                          : `Contains ${activeSlotPills.length} prescribed medication(s) scheduled for this time.`}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-black uppercase tracking-wider text-cyan-300 bg-cyan-950/40 px-3 py-1.5 rounded-xl border border-cyan-500/30">
                    {activeSlotPills.filter(p => takenPills[p.id]).length} / {activeSlotPills.length} {isAr ? 'تم تناولها' : 'taken'}
                  </span>
                </div>

                {activeSlotPills.length === 0 ? (
                  <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-10 text-center text-gray-400 space-y-2">
                    <p className="font-bold text-sm">
                      {isAr ? 'لا توجد أدوية مقررة في هذا الكوب حالياً.' : 'No medications scheduled in this cup.'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isAr
                        ? 'يمكنك إضافة جرعاتك الشخصية عبر زر "+ إضافة دواء للجدول".'
                        : 'You can add your vitamins or custom doses using the Add Medication button.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeSlotPills.map(pill => {
                      const isTaken = !!takenPills[pill.id]
                      return (
                        <PillVisual
                          key={pill.id}
                          pill={pill}
                          isTaken={isTaken}
                          onToggleTaken={() => toggleTaken(pill.id)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── OFFICIAL DOCTOR PRESCRIPTION ARCHIVES ── */}
      <div className="bg-white dark:bg-gray-900 rounded-[32px] shadow-xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8">
        <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800 flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>📜</span>
              <span>{isAr ? 'روشتات الطبيب الرسمية' : 'Official Doctor Prescriptions'}</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isAr ? 'سجل الروشتات والتشخيصات الصادرة من أطبائك المعتمدين' : 'Official medical prescriptions issued by your attending physicians.'}
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            {prescriptions.length} {isAr ? 'روشتة' : 'Prescriptions'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-purple-600 font-bold animate-pulse">
            {isAr ? 'جاري تحميل الروشتات...' : 'Loading prescriptions...'}
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <div className="text-4xl">💊</div>
            <p className="text-sm font-bold text-gray-600 dark:text-gray-300">
              {isAr ? 'لم يصدر لك الطبيب أي روشتة طبية بعد.' : 'No official doctor prescriptions issued yet.'}
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              {isAr
                ? 'عند إتمام كشفك مع الطبيب، سيقوم بإصدار الروشتة الرسمية وستظهر الأدوية تلقائياً في الكؤوس الخمسة أعلاه.'
                : 'When your doctor writes a prescription during or after your visit, it will be saved here and dynamically populated into your daily cups.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {prescriptions.map(rx => (
              <div key={rx.id} className="py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 rounded-2xl px-4 transition-colors">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center text-xl shrink-0 shadow-md">
                    💊
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">
                        {rx.diagnosis || (isAr ? 'كشف طبي عام' : 'Medical Prescription')}
                      </h4>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                        Rx
                      </span>
                    </div>

                    {rx.symptoms && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        <span className="font-bold">{isAr ? 'الأعراض:' : 'Symptoms:'}</span> {rx.symptoms}
                      </p>
                    )}

                    {Array.isArray(rx.medications) && rx.medications.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {rx.medications.map((m: any, idx: number) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold border border-gray-200 dark:border-gray-700"
                          >
                            {m.name} {m.dosage ? `· ${m.dosage}` : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-400 pt-1 flex-wrap">
                      <span>👨‍⚕️ Dr. {rx.doctor_name || 'Doctor'}</span>
                      <span>•</span>
                      <span>📅 {rx.created_at ? new Date(rx.created_at).toLocaleDateString() : ''}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onViewPrescription?.(rx)}
                  className="px-5 py-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                >
                  <span>📄</span>
                  <span>{isAr ? 'عرض وتحميل الروشتة PDF' : 'View & Download PDF'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL: ADD CUSTOM MEDICATION TO CUPS ── */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-[#0B0914] text-white rounded-[32px] shadow-2xl w-full max-w-lg border border-white/10 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <span>💊</span>
                <span>{isAr ? 'إضافة دواء إلى الكؤوس' : 'Add Medication to Daily Cups'}</span>
              </h3>
              <button
                onClick={() => setShowAddCustomModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomPill} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                  {isAr ? 'اسم الدواء أو المكمل' : 'Medication / Supplement Name'}
                </label>
                <input
                  type="text"
                  required
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g. Omega 3, Vitamin D, Panadol"
                  className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-white placeholder-gray-500 font-bold text-sm outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                    {isAr ? 'الجرعة' : 'Dosage'}
                  </label>
                  <input
                    type="text"
                    value={customDosage}
                    onChange={e => setCustomDosage(e.target.value)}
                    placeholder="e.g. 500mg, 1 tablet"
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-white placeholder-gray-500 font-bold text-sm outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                    {isAr ? 'الكوب المستهدف' : 'Target Daily Cup'}
                  </label>
                  <select
                    value={customSlot}
                    onChange={e => setCustomSlot(e.target.value as CupSlot)}
                    className="w-full px-4 py-3 rounded-2xl bg-[#120F24] border border-white/10 text-white font-bold text-sm outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    <option value="morning">🌅 Morning (08:00 AM)</option>
                    <option value="midday">☀️ Midday (01:00 PM)</option>
                    <option value="evening">🌇 Evening (05:30 PM)</option>
                    <option value="night">🌙 Night (09:00 PM)</option>
                    <option value="bedtime">🌌 Bedtime (11:30 PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                  {isAr ? 'تعليمات الاستخدام' : 'Instructions (Optional)'}
                </label>
                <input
                  type="text"
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="e.g. After breakfast with water"
                  className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10 text-white placeholder-gray-500 font-bold text-sm outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddCustomModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-white/10 text-gray-300 font-bold text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all"
                >
                  {isAr ? 'إضافة إلى الكوب' : 'Add to Cup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
