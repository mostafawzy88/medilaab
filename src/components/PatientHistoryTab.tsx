'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'
import PrescriptionViewerModal from './PrescriptionViewerModal'
import DoctorReviewModal from './DoctorReviewModal'
import DoctorProfileModal from './DoctorProfileModal'

type PatientVisit = {
  id: string
  scheduled_time: string
  created_at: string
  status: string
  appointment_type?: string
  fees?: number
  payment_status?: string
  payment_reference?: string | null
  payment_verified_at?: string | null
  notes?: string | null
  doctor_id: string
  family_member_name?: string | null
  doctor?: {
    id: string
    full_name: string
    specialization?: string | null
    clinic_location?: string | null
  } | null
  prescription?: {
    id: string
    diagnosis?: string | null
    symptoms?: string | null
    medications?: any[]
    doctor_notes?: string | null
    created_at?: string
  } | null
  review?: {
    id: string
    rating: number
    review_text?: string | null
    tags?: string[]
    likes_count?: number
    created_at?: string
  } | null
}

function format12HourTime(isoStr?: string | null): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return ''
  }
}

function formatDate(isoStr?: string | null): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

export default function PatientHistoryTab({
  patientName
}: {
  patientName?: string
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [visits, setVisits] = useState<PatientVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewingRx, setViewingRx] = useState<any | null>(null)
  const [reviewingVisit, setReviewingVisit] = useState<PatientVisit | null>(null)
  const [viewingDoctorId, setViewingDoctorId] = useState<string | null>(null)
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null)
  const [paymentRefInput, setPaymentRefInput] = useState('')
  const [submittingPayment, setSubmittingPayment] = useState(false)

  useEffect(() => {
    fetchPatientVisits()
  }, [])

  const fetchPatientVisits = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // 1. Fetch appointments for this patient
    const { data: aptData, error } = await supabase
      .from('appointments')
      .select(`
        id, scheduled_time, created_at, status, appointment_type, fees, payment_status, payment_reference, payment_verified_at, notes,
        doctor_id, family_member_name,
        doctor:profiles!appointments_doctor_id_fkey(id, full_name, specialization, clinic_location)
      `)
      .eq('patient_id', user.id)
      .order('scheduled_time', { ascending: false })

    if (error || !aptData) {
      setLoading(false)
      return
    }

    const aptIds = aptData.map(a => a.id)
    const docIds = Array.from(new Set(aptData.map(a => a.doctor_id).filter(Boolean)))

    // 2. Fetch prescriptions linked to these appointments
    const { data: rxData } = await supabase
      .from('prescriptions')
      .select('id, appointment_id, diagnosis, symptoms, medications, doctor_notes, created_at')
      .in('appointment_id', aptIds.length > 0 ? aptIds : ['00000000-0000-0000-0000-000000000000'])

    const rxMap: Record<string, any> = {}
    if (rxData) {
      rxData.forEach(rx => {
        if (rx.appointment_id) rxMap[rx.appointment_id] = rx
      })
    }

    // 3. Fetch reviews made by this patient
    const { data: reviewData } = await supabase
      .from('doctor_reviews')
      .select('id, appointment_id, doctor_id, rating, review_text, tags, likes_count, created_at')
      .eq('patient_id', user.id)

    const reviewMap: Record<string, any> = {}
    if (reviewData) {
      reviewData.forEach(rev => {
        if (rev.appointment_id) {
          reviewMap[rev.appointment_id] = rev
        } else if (rev.doctor_id && !reviewMap[`doc_${rev.doctor_id}`]) {
          reviewMap[`doc_${rev.doctor_id}`] = rev
        }
      })
    }

    const combined: PatientVisit[] = aptData.map((apt: any) => ({
      ...apt,
      prescription: rxMap[apt.id] || null,
      review: reviewMap[apt.id] || reviewMap[`doc_${apt.doctor_id}`] || null
    }))

    setVisits(combined)
    setLoading(false)
  }

  const handleMarkAsPaid = async (appointmentId: string) => {
    setSubmittingPayment(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('appointments')
      .update({
        payment_status: 'paid_by_patient',
        payment_reference: paymentRefInput.trim() || 'InstaPay Transfer'
      })
      .eq('id', appointmentId)

    if (error) {
      alert('Error updating payment: ' + error.message)
    } else {
      setPayingVisitId(null)
      setPaymentRefInput('')
      await fetchPatientVisits()
    }
    setSubmittingPayment(false)
  }

  // Filter and search
  const filteredVisits = useMemo(() => {
    return visits.filter(v => {
      if (filter === 'completed' && v.status !== 'completed') return false
      if (filter === 'cancelled' && v.status !== 'cancelled') return false
      
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase()
        const docName = v.doctor?.full_name?.toLowerCase() || ''
        const spec = v.doctor?.specialization?.toLowerCase() || ''
        const diag = v.prescription?.diagnosis?.toLowerCase() || ''
        const member = v.family_member_name?.toLowerCase() || ''
        if (!docName.includes(term) && !spec.includes(term) && !diag.includes(term) && !member.includes(term)) {
          return false
        }
      }
      return true
    })
  }, [visits, filter, searchTerm])

  // Summary Metrics
  const metrics = useMemo(() => {
    const completed = visits.filter(v => v.status === 'completed')
    const totalSpent = visits
      .filter(v => v.payment_status === 'paid')
      .reduce((sum, v) => sum + (Number(v.fees) || 0), 0)
    const rxCount = visits.filter(v => !!v.prescription).length
    const uniqueDocs = new Set(visits.map(v => v.doctor_id)).size
    return {
      totalVisits: visits.length,
      completedCount: completed.length,
      totalSpent,
      rxCount,
      uniqueDocs
    }
  }, [visits])

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      {/* Top Banner / Metrics */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📜</span>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                {isAr ? 'سجل الزيارات والحالة الطبية' : 'Patient Visit & Medical History'}
              </h2>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {isAr
                ? 'تتبع كامل لمواعيدك السابقة، المدفوعات، تقارير الحالة، والأدوية الموصوفة مع إمكانية تقييم الأطباء.'
                : 'Complete timeline of past clinic visits, payments, clinical diagnoses, and prescriptions with doctor ratings.'}
            </p>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-center">
            <span className="text-xl mb-1 block">📅</span>
            <span className="text-2xl font-black text-blue-900 dark:text-blue-100 block">
              {metrics.totalVisits}
            </span>
            <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider">
              {isAr ? 'إجمالي المواعيد' : 'Total Visits'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 text-center">
            <span className="text-xl mb-1 block">💰</span>
            <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100 block">
              {metrics.totalSpent} <span className="text-xs font-normal">EGP</span>
            </span>
            <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
              {isAr ? 'إجمالي المدفوعات' : 'Paid Fees'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40 text-center">
            <span className="text-xl mb-1 block">💊</span>
            <span className="text-2xl font-black text-purple-900 dark:text-purple-100 block">
              {metrics.rxCount}
            </span>
            <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider">
              {isAr ? 'روشتات وتقارير' : 'Prescriptions'}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 text-center">
            <span className="text-xl mb-1 block">🩺</span>
            <span className="text-2xl font-black text-amber-900 dark:text-amber-100 block">
              {metrics.uniqueDocs}
            </span>
            <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider">
              {isAr ? 'أطباء معالجون' : 'Doctors Seen'}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl text-xs font-bold">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${filter === 'all' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}
          >
            {isAr ? 'الكل' : 'All Visits'}
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`px-3 py-1.5 rounded-lg transition-all ${filter === 'completed' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}
          >
            {isAr ? 'المكتملة' : 'Completed'}
          </button>
          <button
            onClick={() => setFilter('cancelled')}
            className={`px-3 py-1.5 rounded-lg transition-all ${filter === 'cancelled' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}
          >
            {isAr ? 'الملغاة' : 'Cancelled'}
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none text-xs">
            🔍
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isAr ? 'بحث باسم الطبيب، التشخيص، أو المرافق...' : 'Search doctor, diagnosis, family member...'}
            className="w-full pl-8 pr-4 py-2 text-xs bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Visits List */}
      {loading ? (
        <div className="py-20 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-bold">
            {isAr ? 'جاري تحميل سجل الزيارات الطبية...' : 'Loading medical history & visits...'}
          </p>
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 space-y-3">
          <div className="text-5xl">📜</div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
            {isAr ? 'لا توجد سجلات زيارات سابقة' : 'No Visit Records Found'}
          </h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {isAr
              ? 'عند إتمام زياراتك أو صدور روشتات طبية ستظهر تفاصيلها وتقاريرها هنا تلقائياً.'
              : 'Completed visits, consultation receipts, diagnosis updates, and doctor ratings will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVisits.map((visit) => {
            const isCompleted = visit.status === 'completed'
            const isCancelled = visit.status === 'cancelled'
            const isPaid = visit.payment_status === 'paid'
            const isPaidByPatient = visit.payment_status === 'paid_by_patient'

            return (
              <div
                key={visit.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all space-y-5"
              >
                {/* Header row: Doctor name + Status Badges */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-teal-500 text-white flex items-center justify-center text-xl font-black shrink-0 shadow-md shadow-blue-500/20">
                      {visit.doctor?.full_name?.charAt(0) || 'D'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setViewingDoctorId(visit.doctor_id)}
                          className="text-lg font-black text-gray-900 dark:text-white hover:text-blue-600 transition-colors flex items-center gap-1.5 group"
                        >
                          <span>Dr. {visit.doctor?.full_name || 'Medical Specialist'}</span>
                          <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                            ℹ️ View Profile →
                          </span>
                        </button>

                        {visit.family_member_name && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            👨‍👩‍👦 {isAr ? `لصالح: ${visit.family_member_name}` : `For: ${visit.family_member_name}`}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {visit.doctor?.specialization || 'Clinical Doctor'}
                        {visit.doctor?.clinic_location ? ` • 📍 ${visit.doctor.clinic_location}` : ''}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 font-medium flex-wrap">
                        <span>📅 {formatDate(visit.scheduled_time)}</span>
                        <span>🕒 {format12HourTime(visit.scheduled_time)}</span>
                        <span className="capitalize">
                          🏥 {(visit.appointment_type || 'clinic_normal').replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Badges: Status & Payment */}
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : isCancelled
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {isCompleted ? '✓ Completed' : isCancelled ? '✕ Cancelled' : visit.status}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-gray-900 dark:text-gray-100">
                        {visit.fees || 350} EGP
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-black ${
                          isPaid
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            : isPaidByPatient
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {isPaid
                          ? (isAr ? '✅ مدفوع ومؤكد' : '✅ Paid')
                          : isPaidByPatient
                          ? (isAr ? '⏳ بانتظار تأكيد العيادة' : '⏳ Paid (Verifying)')
                          : (isAr ? '💰 غير مدفوع' : '⏳ Unpaid')}
                      </span>
                    </div>

                    {!isPaid && !isPaidByPatient && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingVisitId(visit.id)
                          setPaymentRefInput('')
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 transition-all shadow-sm"
                      >
                        💳 {isAr ? 'تحديث كمدفوع (انستاباي)' : 'I Have Paid (InstaPay)'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Payment Submission Input */}
                {payingVisitId === visit.id && (
                  <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-3 animate-in fade-in">
                    <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                      {isAr
                        ? 'تأكيد تحويل الرسوم عبر انستاباي / فيزا لإعلام الطبيب والتمريض:'
                        : 'Confirm fee transfer via InstaPay / Bank to notify the clinic staff:'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={paymentRefInput}
                        onChange={(e) => setPaymentRefInput(e.target.value)}
                        placeholder={isAr ? 'رقم الحوالة أو اسم الحساب (اختياري)...' : 'Transaction reference or sender name (optional)...'}
                        className="flex-1 px-3 py-2 text-xs rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        disabled={submittingPayment}
                        onClick={() => handleMarkAsPaid(visit.id)}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs rounded-xl shadow-md transition-all hover:opacity-95 disabled:opacity-50"
                      >
                        {submittingPayment ? '...' : (isAr ? 'تأكيد الإرسال' : 'Submit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayingVisitId(null)}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Clinical Notes & Diagnosis Section */}
                {visit.prescription && (
                  <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🩺</span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-300">
                          {isAr ? 'التشخيص الطبي وتحديث الحالة' : 'Clinical Diagnosis & Condition Update'}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => setViewingRx(visit.prescription)}
                        className="px-3 py-1 bg-white dark:bg-gray-800 text-purple-600 hover:text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
                      >
                        <span>📄</span>
                        <span>{isAr ? 'عرض وطباعة الروشتة PDF' : 'View Prescription PDF'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white/80 dark:bg-gray-900/80 rounded-xl border border-purple-100 dark:border-purple-900/30">
                        <p className="font-bold text-gray-400 text-[10px] uppercase mb-0.5">
                          {isAr ? 'التشخيص الطبي' : 'Medical Diagnosis'}
                        </p>
                        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                          {visit.prescription.diagnosis || 'General Clinical Review'}
                        </p>
                        {visit.prescription.symptoms && (
                          <p className="text-gray-500 text-[11px] mt-1">
                            {isAr ? 'الأعراض: ' : 'Symptoms: '} {visit.prescription.symptoms}
                          </p>
                        )}
                      </div>

                      <div className="p-3 bg-white/80 dark:bg-gray-900/80 rounded-xl border border-purple-100 dark:border-purple-900/30">
                        <p className="font-bold text-gray-400 text-[10px] uppercase mb-0.5">
                          {isAr ? 'تعليمات الطبيب' : "Doctor's Advice & Instructions"}
                        </p>
                        <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                          {visit.prescription.doctor_notes || (isAr ? 'متابعة العلاج حسب الجرعات المقررة ومراجعة العيادة عند الحاجة.' : 'Follow the prescribed dosage and re-evaluate if symptoms persist.')}
                        </p>
                      </div>
                    </div>

                    {/* Prescribed Medications */}
                    {visit.prescription.medications && visit.prescription.medications.length > 0 && (
                      <div className="pt-2">
                        <p className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1.5">
                          💊 {isAr ? 'الأدوية المقررة بالروشتة:' : 'Prescribed Medications:'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {visit.prescription.medications.map((med: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-3 py-1 rounded-xl bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs font-bold shadow-sm"
                            >
                              {med.name} {med.dosage ? `(${med.dosage})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Doctor Review / Star Rating Section (Social Media Style) */}
                <div className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {visit.review ? (
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex text-amber-500 text-base">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i}>{i < visit.review!.rating ? '★' : '☆'}</span>
                          ))}
                        </div>
                        <span className="text-xs font-black text-amber-900 dark:text-amber-200">
                          {visit.review.rating}/5 {isAr ? 'تقييمك للزيارة' : 'Your Visit Rating'}
                        </span>
                        {visit.review.likes_count && visit.review.likes_count > 0 ? (
                          <span className="text-xs font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                            ❤️ {visit.review.likes_count} {isAr ? 'مفيد' : 'Helpful'}
                          </span>
                        ) : null}
                      </div>

                      {visit.review.review_text && (
                        <p className="text-xs text-gray-700 dark:text-gray-300 italic">
                          "{visit.review.review_text}"
                        </p>
                      )}

                      {visit.review.tags && visit.review.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {visit.review.tags.map((t, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/70 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <p className="font-bold text-xs text-gray-900 dark:text-white">
                          {isAr ? 'كيف كانت تجربتك مع الطبيب؟' : 'How was your consultation experience?'}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {isAr
                            ? 'قيم الطبيب وأضف رأيك ليفيد باقي المرضى كمجتمع خبراء طبي.'
                            : 'Rate Dr. ' + (visit.doctor?.full_name || 'Expert') + ' to help patients choose the right specialist.'}
                        </p>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setReviewingVisit(visit)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <span>⭐</span>
                    <span>
                      {visit.review
                        ? (isAr ? 'تعديل التقييم' : 'Edit Review')
                        : (isAr ? 'تقييم الطبيب' : 'Rate & Review Doctor')}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewingVisit && (
        <DoctorReviewModal
          doctorId={reviewingVisit.doctor_id}
          doctorName={reviewingVisit.doctor?.full_name || 'Doctor'}
          appointmentId={reviewingVisit.id}
          existingReview={reviewingVisit.review ? {
            id: reviewingVisit.review.id,
            rating: reviewingVisit.review.rating,
            review_text: reviewingVisit.review.review_text ?? null,
            tags: reviewingVisit.review.tags
          } : null}
          onClose={() => setReviewingVisit(null)}
          onSuccess={() => {
            setReviewingVisit(null)
            fetchPatientVisits()
          }}
        />
      )}

      {/* Prescription PDF Modal */}
      {viewingRx && (
        <PrescriptionViewerModal
          prescription={viewingRx}
          patientName={patientName || 'Patient'}
          onClose={() => setViewingRx(null)}
        />
      )}

      {/* Doctor Profile Modal */}
      {viewingDoctorId && (
        <DoctorProfileModal
          doctorId={viewingDoctorId}
          onClose={() => setViewingDoctorId(null)}
        />
      )}
    </div>
  )
}
