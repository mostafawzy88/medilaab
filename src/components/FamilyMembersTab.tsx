'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

export type PediatricChronicProfile = {
  blood_type?: string
  allergies?: string[]
  chronic_conditions?: string[]
  is_pediatric?: boolean
  weight_kg?: number | null
  notes?: string
}

export type FamilyMember = {
  id: string
  patient_id: string
  full_name: string
  relationship: string
  gender?: string | null
  birth_date?: string | null
  age?: number | null
  medical_history?: string | null
  created_at?: string
}

export function parseFamilyMedicalProfile(raw?: string | null): PediatricChronicProfile {
  if (!raw) return {}
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed)
      return {
        blood_type: obj.blood_type || '',
        allergies: Array.isArray(obj.allergies) ? obj.allergies : [],
        chronic_conditions: Array.isArray(obj.chronic_conditions) ? obj.chronic_conditions : [],
        is_pediatric: !!obj.is_pediatric,
        weight_kg: obj.weight_kg ?? null,
        notes: obj.notes || ''
      }
    } catch {}
  }

  // Parse legacy formatted text
  const bloodMatch = trimmed.match(/\[BLOOD:\s*([A-Za-z+-]+)\]/i)
  const allergiesMatch = trimmed.match(/\[ALLERGIES:\s*([^\]]+)\]/i)
  const chronicMatch = trimmed.match(/\[CHRONIC:\s*([^\]]+)\]/i)

  return {
    blood_type: bloodMatch?.[1] || '',
    allergies: allergiesMatch?.[1]?.split(',').map(s => s.trim()).filter(Boolean) || [],
    chronic_conditions: chronicMatch?.[1]?.split(',').map(s => s.trim()).filter(Boolean) || [],
    notes: trimmed
      .replace(/\[BLOOD:[^\]]+\]/gi, '')
      .replace(/\[ALLERGIES:[^\]]+\]/gi, '')
      .replace(/\[CHRONIC:[^\]]+\]/gi, '')
      .trim()
  }
}

const RELATIONSHIP_OPTIONS = [
  { value: 'Son', labelEn: 'Son', labelAr: 'ابن' },
  { value: 'Daughter', labelEn: 'Daughter', labelAr: 'ابنة' },
  { value: 'Spouse', labelEn: 'Spouse / Partner', labelAr: 'زوج / زوجة' },
  { value: 'Father', labelEn: 'Father', labelAr: 'أب' },
  { value: 'Mother', labelEn: 'Mother', labelAr: 'أم' },
  { value: 'Brother', labelEn: 'Brother', labelAr: 'أخ' },
  { value: 'Sister', labelEn: 'Sister', labelAr: 'أخت' },
  { value: 'Other', labelEn: 'Other Dependent', labelAr: 'آخر' },
]

const BLOOD_TYPE_OPTIONS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-']

const POPULAR_ALLERGIES = [
  { en: 'Penicillin', ar: 'بنسلين' },
  { en: 'Sulfa Drugs', ar: 'سلفا' },
  { en: 'Aspirin / NSAIDs', ar: 'أسبرين' },
  { en: 'Peanuts', ar: 'فول سوداني' },
  { en: 'Favism (G6PD)', ar: 'أنيميا الفول' },
  { en: 'Lactose', ar: 'لاكتوز' },
  { en: 'Dust & Pollen', ar: 'غبار وحبوب لقاح' }
]

const POPULAR_CHRONIC = [
  { en: 'Asthma / Bronchial', ar: 'حساسية صدر / ربو' },
  { en: 'Type 1 Diabetes', ar: 'سكري نوع 1' },
  { en: 'Type 2 Diabetes', ar: 'سكري نوع 2' },
  { en: 'Hypertension', ar: 'ارتفاع ضغط الدم' },
  { en: 'Cardiac Condition', ar: 'أمراض قلب' },
  { en: 'Chronic Kidney', ar: 'أمراض كلى' },
  { en: 'Epilepsy', ar: 'صرع' },
  { en: 'Atopic Eczema', ar: 'إكزيما تحسسية' }
]

export default function FamilyMembersTab({
  onBookForMember
}: {
  onBookForMember?: (member: FamilyMember) => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [relationship, setRelationship] = useState('Son')
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [age, setAge] = useState<string>('')
  const [bloodType, setBloodType] = useState<string>('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [customAllergy, setCustomAllergy] = useState('')
  const [chronicConditions, setChronicConditions] = useState<string[]>([])
  const [customChronic, setCustomChronic] = useState('')
  const [weightKg, setWeightKg] = useState<string>('')
  const [medicalHistory, setMedicalHistory] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchFamilyMembers()
  }, [])

  const fetchFamilyMembers = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('patient_family_members')
      .select('*')
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setFamilyMembers(data)
    }
    setLoading(false)
  }

  const openAddModal = () => {
    setEditingMember(null)
    setFullName('')
    setRelationship('Son')
    setGender('male')
    setAge('')
    setBloodType('')
    setAllergies([])
    setCustomAllergy('')
    setChronicConditions([])
    setCustomChronic('')
    setWeightKg('')
    setMedicalHistory('')
    setErrorMsg('')
    setShowModal(true)
  }

  const openEditModal = (member: FamilyMember) => {
    setEditingMember(member)
    setFullName(member.full_name)
    setRelationship(member.relationship)
    setGender((member.gender as any) || 'male')
    setAge(member.age ? String(member.age) : '')

    const profile = parseFamilyMedicalProfile(member.medical_history)
    setBloodType(profile.blood_type || '')
    setAllergies(profile.allergies || [])
    setCustomAllergy('')
    setChronicConditions(profile.chronic_conditions || [])
    setCustomChronic('')
    setWeightKg(profile.weight_kg ? String(profile.weight_kg) : '')
    setMedicalHistory(profile.notes || '')
    setErrorMsg('')
    setShowModal(true)
  }

  const toggleAllergy = (name: string) => {
    if (allergies.includes(name)) {
      setAllergies(allergies.filter(a => a !== name))
    } else {
      setAllergies([...allergies, name])
    }
  }

  const addCustomAllergy = () => {
    const val = customAllergy.trim()
    if (val && !allergies.includes(val)) {
      setAllergies([...allergies, val])
      setCustomAllergy('')
    }
  }

  const toggleChronic = (name: string) => {
    if (chronicConditions.includes(name)) {
      setChronicConditions(chronicConditions.filter(c => c !== name))
    } else {
      setChronicConditions([...chronicConditions, name])
    }
  }

  const addCustomChronic = () => {
    const val = customChronic.trim()
    if (val && !chronicConditions.includes(val)) {
      setChronicConditions([...chronicConditions, val])
      setCustomChronic('')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال اسم فرد العائلة' : 'Please enter the family member full name')
      return
    }

    setSaving(true)
    setErrorMsg('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setErrorMsg('User not authenticated')
      setSaving(false)
      return
    }

    const numAge = age ? parseInt(age, 10) : null
    const isPediatric = (numAge !== null && numAge < 18) || ['Son', 'Daughter'].includes(relationship)

    const profileData: PediatricChronicProfile = {
      blood_type: bloodType || undefined,
      allergies: allergies.filter(Boolean),
      chronic_conditions: chronicConditions.filter(Boolean),
      is_pediatric: isPediatric,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      notes: medicalHistory.trim()
    }

    const payload = {
      patient_id: user.id,
      full_name: fullName.trim(),
      relationship,
      gender,
      age: numAge,
      medical_history: JSON.stringify(profileData)
    }

    try {
      if (editingMember?.id) {
        const { error } = await supabase
          .from('patient_family_members')
          .update(payload)
          .eq('id', editingMember.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('patient_family_members')
          .insert(payload)
        if (error) throw error
      }

      await fetchFamilyMembers()
      setShowModal(false)
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving family member')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(isAr ? 'هل أنت متأكد من حذف فرد العائلة؟' : 'Are you sure you want to remove this family member?')) {
      return
    }

    setDeletingId(id)
    const supabase = createClient()
    await supabase.from('patient_family_members').delete().eq('id', id)
    setFamilyMembers(prev => prev.filter(m => m.id !== id))
    setDeletingId(null)
  }

  const getRelationBadge = (rel: string) => {
    switch (rel.toLowerCase()) {
      case 'son':
      case 'daughter':
        return { bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: '👶' }
      case 'spouse':
        return { bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800', icon: '💍' }
      case 'father':
      case 'mother':
        return { bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: '👴' }
      default:
        return { bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', icon: '🫂' }
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-md">
              👨‍👩‍👧 {isAr ? 'ملف عائلتي الطبي ورعاية الأطفال' : 'Family Healthcare & Pediatric Care'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">
            {isAr ? 'أفراد العائلة والملفات المزمنة' : 'Family Members & Care Profiles'}
          </h2>
          <p className="text-sm text-blue-100 mt-1 max-w-xl">
            {isAr
              ? 'سجل بيانات أفراد أسرتك بدقة: فصيلة الدم، حساسية الأدوية، والأمراض المزمنة لضمان أقصى سلامة طبية عند حجز الكشف.'
              : 'Record specialized clinical profiles: blood types, drug allergies, pediatric growth, and chronic conditions.'}
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="self-start sm:self-auto px-6 py-3.5 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl font-black text-sm shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 flex-shrink-0 z-10"
        >
          <span>➕</span>
          <span>{isAr ? 'إضافة فرد عائلة جديد' : '+ Add Family Member'}</span>
        </button>
      </div>

      {/* Members Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : familyMembers.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-3xl mx-auto">
            👨‍👩‍👧
          </div>
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            {isAr ? 'لم تتم إضافة أفراد عائلة بعد' : 'No Family Members Added Yet'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {isAr
              ? 'يمكنك إضافة أبنائك، زوجتك أو والديك مع فصيلة دمهم وأي حساسية دوائية ليراها الطبيب فوراً عند الكشف.'
              : 'Add your children or dependents with their blood type, pediatric tags, and allergies.'}
          </p>
          <button
            onClick={openAddModal}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all inline-flex items-center gap-2"
          >
            <span>+</span>
            <span>{isAr ? 'إضافة فرد العائلة الأول' : 'Add First Family Member'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {familyMembers.map((member) => {
            const badge = getRelationBadge(member.relationship)
            const profile = parseFamilyMedicalProfile(member.medical_history)
            const isChild = profile.is_pediatric || (member.age !== null && member.age !== undefined && member.age < 18)

            return (
              <div
                key={member.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-blue-500/20">
                        {member.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-black text-base text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                          {member.full_name}
                        </h4>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
                            <span>{badge.icon}</span>
                            <span>{member.relationship}</span>
                          </span>
                          {isChild && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                              👶 {isAr ? 'رعاية أطفال' : 'Pediatric'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(member)}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-blue-600 transition-colors"
                        title={isAr ? 'تعديل' : 'Edit'}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDelete(member.id)}
                        disabled={deletingId === member.id}
                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                        title={isAr ? 'حذف' : 'Remove'}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* Vitals & Demographics */}
                  <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50/70 dark:bg-gray-800/40 p-3.5 rounded-2xl">
                    <div className="grid grid-cols-2 gap-2 pb-2 border-b border-gray-200/50 dark:border-gray-700/50">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-black block">{isAr ? 'السن والنوع' : 'Age & Gender'}</span>
                        <span className="font-bold text-gray-800 dark:text-gray-100">
                          {member.age ? `${member.age} ${isAr ? 'سنة' : 'yrs'}` : '—'} • {member.gender || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-black block">{isAr ? 'فصيلة الدم' : 'Blood Type'}</span>
                        <span className={`font-black ${profile.blood_type ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400'}`}>
                          {profile.blood_type ? `🩸 ${profile.blood_type}` : (isAr ? 'غير مسجلة' : 'Unknown')}
                        </span>
                      </div>
                    </div>

                    {profile.weight_kg && (
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-gray-400">{isAr ? 'الوزن (لجرعات الأطفال)' : 'Weight (Pediatric)'}</span>
                        <span className="font-bold text-cyan-600 dark:text-cyan-400">⚖️ {profile.weight_kg} kg</span>
                      </div>
                    )}

                    {/* Allergies Badges */}
                    {profile.allergies && profile.allergies.length > 0 && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1">
                          <span>⚠️</span>
                          <span>{isAr ? 'حساسية الأدوية المفرطة:' : 'Drug Allergies:'}</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {profile.allergies.map((allg, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300/50">
                              {allg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chronic Conditions Badges */}
                    {profile.chronic_conditions && profile.chronic_conditions.length > 0 && (
                      <div className="pt-1.5">
                        <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1 mb-1">
                          <span>🩺</span>
                          <span>{isAr ? 'الأمراض المزمنة:' : 'Chronic Conditions:'}</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {profile.chronic_conditions.map((chr, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 border border-blue-300/50">
                              {chr}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Medical Notes */}
                    {profile.notes && (
                      <div className="pt-1.5 border-t border-gray-200/50 dark:border-gray-700/50">
                        <span className="text-gray-400 block text-[10px] uppercase font-black">{isAr ? 'ملاحظات إضافية' : 'Additional Notes'}</span>
                        <p className="text-gray-700 dark:text-gray-200 font-medium text-[11px] mt-0.5 line-clamp-2">
                          {profile.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Booking Button */}
                {onBookForMember && (
                  <button
                    onClick={() => onBookForMember(member)}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 group-hover:bg-blue-600 group-hover:text-white"
                  >
                    <span>📅</span>
                    <span>{isAr ? `حجز كشف لـ ${member.full_name}` : `Book Visit for ${member.full_name}`}</span>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>👨‍👩‍👧</span>
                <span>{editingMember ? (isAr ? 'تعديل الملف الطبي لفرد العائلة' : 'Edit Family Member Profile') : (isAr ? 'إضافة فرد عائلة وملف طبي' : 'Add Family Member & Clinical Profile')}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              {errorMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-xs font-bold border border-red-200">
                  {errorMsg}
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                  {isAr ? 'الاسم بالكامل' : 'Full Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={isAr ? 'مثال: يوسف مصطفى' : 'e.g. Youssef Mostafa'}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>

              {/* Relationship & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {isAr ? 'صلة القرابة' : 'Relationship'}
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {isAr ? opt.labelAr : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {isAr ? 'النوع' : 'Gender'}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                    <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                  </select>
                </div>
              </div>

              {/* Age & Pediatric Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {isAr ? 'السن (بالسنوات)' : 'Age (years)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 6"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                    {isAr ? 'الوزن بالـ كجم (للأطفال)' : 'Weight (kg)'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="200"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="e.g. 21.5"
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
              </div>

              {/* Blood Type Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center justify-between">
                  <span>{isAr ? '🩸 فصيلة الدم' : '🩸 Blood Type'}</span>
                  <span className="text-[10px] text-gray-400">Essential for clinic records</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {BLOOD_TYPE_OPTIONS.map(bt => (
                    <button
                      key={bt}
                      type="button"
                      onClick={() => setBloodType(bloodType === bt ? '' : bt)}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        bloodType === bt
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-500/30 border border-rose-500'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-rose-400'
                      }`}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Drug Allergies */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>{isAr ? 'حساسية الأدوية المفرطة (Allergies)' : 'Drug & Food Allergies'}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_ALLERGIES.map(item => {
                    const active = allergies.includes(item.en)
                    return (
                      <button
                        key={item.en}
                        type="button"
                        onClick={() => toggleAllergy(item.en)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                          active
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-amber-400'
                        }`}
                      >
                        {isAr ? item.ar : item.en}
                      </button>
                    )
                  })}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customAllergy}
                    onChange={(e) => setCustomAllergy(e.target.value)}
                    placeholder={isAr ? 'حساسية أخرى (مثال: أسبرين، بنسلين...)' : 'Other allergy...'}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={addCustomAllergy}
                    className="px-3 py-1.5 bg-amber-600 text-white font-bold rounded-xl text-xs hover:bg-amber-700 transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* Chronic Conditions */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <span>🩺</span>
                  <span>{isAr ? 'الأمراض المزمنة (Chronic Conditions)' : 'Chronic Conditions'}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_CHRONIC.map(item => {
                    const active = chronicConditions.includes(item.en)
                    return (
                      <button
                        key={item.en}
                        type="button"
                        onClick={() => toggleChronic(item.en)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                          active
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                        }`}
                      >
                        {isAr ? item.ar : item.en}
                      </button>
                    )
                  })}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={customChronic}
                    onChange={(e) => setCustomChronic(e.target.value)}
                    placeholder={isAr ? 'مرض مزمن آخر (مثال: حساسية صدر، سكر...)' : 'Other condition...'}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={addCustomChronic}
                    className="px-3 py-1.5 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-colors"
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* General Medical Notes */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                  {isAr ? 'ملاحظات طبية أو تطعيمات إضافية' : 'Additional Clinical Notes / Vaccinations'}
                </label>
                <textarea
                  rows={2}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder={isAr ? 'أي ملاحظات أو عمليات جراحية سابقة أو تطعيمات...' : 'Past surgeries, regular vitamins, or special notes...'}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الملف الطبي' : 'Save Profile')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
