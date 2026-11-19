'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

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
    setMedicalHistory(member.medical_history || '')
    setErrorMsg('')
    setShowModal(true)
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

    const payload = {
      patient_id: user.id,
      full_name: fullName.trim(),
      relationship,
      gender,
      age: age ? parseInt(age, 10) : null,
      medical_history: medicalHistory.trim() || null
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
    if (!confirm(isAr ? 'هل أنت متأكد من حذف فرد العائلة هذا؟' : 'Are you sure you want to remove this family member?')) {
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
        return { bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200', icon: '👶' }
      case 'spouse':
        return { bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200', icon: '💍' }
      case 'father':
      case 'mother':
        return { bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200', icon: '👴' }
      default:
        return { bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200', icon: '🫂' }
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-white/10 rounded-full text-xs font-black uppercase tracking-wider backdrop-blur-md">
              👨‍👩‍👧 {isAr ? 'ملف عائلتي الطبي' : 'Family Healthcare'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">
            {isAr ? 'إدارة أفراد العائلة' : 'Family Members & Dependents'}
          </h2>
          <p className="text-sm text-blue-100 mt-1 max-w-xl">
            {isAr
              ? 'أضف أفراد عائلتك (أبناءك، زوجتك، والديك) لحجز المواعيد باسمهم ومتابعة حالتهم الصحية وروشتاتهم بكل سهولة.'
              : 'Add your children, spouse, or parents to easily book appointments on their behalf and track their medical history.'}
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="self-start sm:self-auto px-6 py-3.5 bg-white text-blue-700 hover:bg-blue-50 rounded-2xl font-black text-sm shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2 flex-shrink-0"
        >
          <span>➕</span>
          <span>{isAr ? 'إضافة فرد عائلة جديد' : '+ Add Family Member'}</span>
        </button>
      </div>

      {/* Members Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 animate-pulse" />
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
              ? 'يمكنك إضافة أبنائك أو والديك لحجز مواعيد الأطباء لهم ومتابعة أدويتهم تحت حسابك.'
              : 'Add your children, parents, or spouse so you can book doctor appointments for them directly.'}
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
            return (
              <div
                key={member.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
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
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
                          <span>{badge.icon}</span>
                          <span>{member.relationship}</span>
                        </span>
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

                  {/* Details */}
                  <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-50/70 dark:bg-gray-800/40 p-3.5 rounded-2xl">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">{isAr ? 'السن' : 'Age'}</span>
                      <span className="font-bold">{member.age ? `${member.age} ${isAr ? 'سنة' : 'years'}` : (isAr ? 'غير محدد' : 'Not specified')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">{isAr ? 'النوع' : 'Gender'}</span>
                      <span className="font-bold capitalize">{member.gender || '—'}</span>
                    </div>
                    {member.medical_history && (
                      <div className="pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                        <span className="text-gray-400 block text-[10px] uppercase font-black">{isAr ? 'ملاحظات وحساسية' : 'Medical Notes'}</span>
                        <p className="text-gray-700 dark:text-gray-200 font-medium text-[11px] mt-0.5 line-clamp-2">
                          {member.medical_history}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Booking Button */}
                {onBookForMember && (
                  <button
                    onClick={() => onBookForMember(member)}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
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
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>👨‍👩‍👧</span>
                <span>{editingMember ? (isAr ? 'تعديل بيانات فرد العائلة' : 'Edit Family Member') : (isAr ? 'إضافة فرد عائلة جديد' : 'Add Family Member')}</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
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
                  placeholder={isAr ? 'مثال: عمر مصطفى' : 'e.g. Omar Mostafa'}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full px-3 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                    <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                  </select>
                </div>
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                  {isAr ? 'السن (بالسنوات)' : 'Age (in years)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Medical History / Allergies */}
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-gray-500">
                  {isAr ? 'حساسية الأدوية أو أمراض سابقة (اختياري)' : 'Allergies / Medical Conditions (Optional)'}
                </label>
                <textarea
                  rows={2}
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  placeholder={isAr ? 'مثال: حساسية بنسلين، حساسية ألبان...' : 'e.g. Penicillin allergy, Asthma, Diabetes...'}
                  className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
                  {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ البيانات' : 'Save Member')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
