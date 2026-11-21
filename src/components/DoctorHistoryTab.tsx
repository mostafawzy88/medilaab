'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'
import PrescriptionViewerModal from './PrescriptionViewerModal'

type PastVisit = {
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
  patient_id?: string | null
  manual_patient_id?: string | null
  patient?: { full_name: string; phone_number?: string | null } | null
  manual_patient?: { full_name: string; phone_number?: string | null } | null
  family_member_name?: string | null
  prescription?: {
    id: string
    diagnosis?: string | null
    symptoms?: string | null
    medications?: any[]
    doctor_notes?: string | null
  } | null
  review?: {
    id: string
    rating: number
    review_text?: string | null
    tags?: string[]
    created_at?: string
  } | null
}

export default function DoctorHistoryTab({
  doctorId,
  onOpenPrescription
}: {
  doctorId: string
  onOpenPrescription?: (patient: { id: string; name: string; is_manual: boolean; appointment_id?: string }) => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const router = useRouter()
  const [visits, setVisits] = useState<PastVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPayment, setFilterPayment] = useState<'all' | 'paid' | 'pending' | 'paid_by_patient'>('all')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'last_30' | 'custom'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [viewingRx, setViewingRx] = useState<{ rx: any; patientName: string } | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    fetchHistory()
  }, [doctorId])

  const fetchHistory = async () => {
    setLoading(true)
    const supabase = createClient()

    // 1. Fetch appointments that are completed or past
    const { data: aptData } = await supabase
      .from('appointments')
      .select(`
        id, scheduled_time, created_at, status, appointment_type, fees, payment_status, payment_reference, payment_verified_at, notes,
        patient_id, manual_patient_id, family_member_name,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .eq('doctor_id', doctorId)
      .order('scheduled_time', { ascending: false })

    if (!aptData) {
      setLoading(false)
      return
    }

    const aptIds = aptData.map(a => a.id)

    // 2. Fetch prescriptions linked to these appointments
    const { data: rxData } = await supabase
      .from('prescriptions')
      .select('id, appointment_id, diagnosis, symptoms, medications, doctor_notes')
      .in('appointment_id', aptIds.length > 0 ? aptIds : ['00000000-0000-0000-0000-000000000000'])

    const rxMap: Record<string, any> = {}
    if (rxData) {
      rxData.forEach(rx => {
        if (rx.appointment_id) rxMap[rx.appointment_id] = rx
      })
    }

    // 3. Fetch reviews for these appointments
    const { data: reviewData } = await supabase
      .from('doctor_reviews')
      .select('id, appointment_id, rating, review_text, tags, created_at')
      .in('appointment_id', aptIds.length > 0 ? aptIds : ['00000000-0000-0000-0000-000000000000'])

    const reviewMap: Record<string, any> = {}
    if (reviewData) {
      reviewData.forEach(rev => {
        if (rev.appointment_id) reviewMap[rev.appointment_id] = rev
      })
    }

    const merged: PastVisit[] = (aptData as any[]).map((a: any) => ({
      ...a,
      patient: Array.isArray(a.patient) ? a.patient[0] : a.patient,
      manual_patient: Array.isArray(a.manual_patient) ? a.manual_patient[0] : a.manual_patient,
      prescription: rxMap[a.id] || null,
      review: reviewMap[a.id] || null
    }))

    setVisits(merged)
    setLoading(false)
  }

  const handleConfirmPayment = async (aptId: string) => {
    setConfirmingId(aptId)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('appointments')
      .update({
        payment_status: 'paid',
        payment_verified_by: user?.id || doctorId,
        payment_verified_at: now
      })
      .eq('id', aptId)

    if (!error) {
      setVisits(prev =>
        prev.map(v =>
          v.id === aptId
            ? { ...v, payment_status: 'paid', payment_verified_at: now }
            : v
        )
      )
    } else {
      alert('Error updating payment: ' + error.message)
    }
    setConfirmingId(null)
  }

  // Filter and search with date range
  const filteredVisits = useMemo(() => {
    return visits.filter(v => {
      // Payment filter
      if (filterPayment !== 'all') {
        if (filterPayment === 'paid' && v.payment_status !== 'paid') return false
        if (filterPayment === 'paid_by_patient' && v.payment_status !== 'paid_by_patient') return false
        if (filterPayment === 'pending' && (v.payment_status === 'paid' || v.payment_status === 'paid_by_patient')) return false
      }

      // Date Range filter
      if (datePreset !== 'all') {
        const vDate = new Date(v.scheduled_time || v.created_at)
        const now = new Date()
        if (datePreset === 'today') {
          const isToday = vDate.getDate() === now.getDate() && vDate.getMonth() === now.getMonth() && vDate.getFullYear() === now.getFullYear()
          if (!isToday) return false
        } else if (datePreset === 'this_week') {
          const startOfWeek = new Date(now)
          startOfWeek.setDate(now.getDate() - now.getDay())
          startOfWeek.setHours(0, 0, 0, 0)
          if (vDate < startOfWeek) return false
        } else if (datePreset === 'this_month') {
          if (vDate.getMonth() !== now.getMonth() || vDate.getFullYear() !== now.getFullYear()) return false
        } else if (datePreset === 'last_30') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
          if (vDate < thirtyDaysAgo) return false
        } else if (datePreset === 'custom') {
          if (startDate) {
            const start = new Date(startDate)
            start.setHours(0, 0, 0, 0)
            if (vDate < start) return false
          }
          if (endDate) {
            const end = new Date(endDate)
            end.setHours(23, 59, 59, 999)
            if (vDate > end) return false
          }
        }
      }

      // Search term
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const pName = (v.patient?.full_name || v.manual_patient?.full_name || '').toLowerCase()
        const dx = (v.prescription?.diagnosis || '').toLowerCase()
        const symptoms = (v.prescription?.symptoms || '').toLowerCase()
        const meds = (v.prescription?.medications || []).map((m: any) => m.name || '').join(' ').toLowerCase()
        return pName.includes(q) || dx.includes(q) || symptoms.includes(q) || meds.includes(q)
      }

      return true
    })
  }, [visits, filterPayment, datePreset, startDate, endDate, searchTerm])

  const totalCollectedRevenue = visits
    .filter(v => v.payment_status === 'paid')
    .reduce((sum, v) => sum + (Number(v.fees) || 0), 0)

  // Excel / CSV Export
  const handleExportToExcel = () => {
    if (filteredVisits.length === 0) {
      alert(isAr ? 'لا توجد بيانات لتصديرها وفق الفلتر المحدد.' : 'No records found to export for the selected filters.')
      return
    }

    const rows = filteredVisits.map((v, i) => {
      const pName = v.patient?.full_name || v.manual_patient?.full_name || 'Patient'
      const pPhone = v.patient?.phone_number || v.manual_patient?.phone_number || ''
      const isManual = !v.patient_id
      const dateStr = new Date(v.scheduled_time).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
      const medsStr = (v.prescription?.medications || [])
        .map((m: any) => `${m.name}${m.dosage ? ` (${m.dosage})` : ''}`)
        .join('; ')

      return {
        '#': i + 1,
        'Patient Name': pName,
        'Patient Type': isManual ? 'Offline Patient' : 'Registered User',
        'Phone Number': pPhone,
        'Scheduled Time': dateStr,
        'Visit Type': v.appointment_type || 'Clinic Normal',
        'Fee (EGP)': v.fees || 0,
        'Payment Status': v.payment_status || 'pending',
        'Payment Ref': v.payment_reference || '',
        'Diagnosis': v.prescription?.diagnosis || '',
        'Prescribed Medications': medsStr,
        'Patient Symptoms/Notes': v.prescription?.symptoms || v.notes || '',
        'Doctor Notes': v.prescription?.doctor_notes || '',
        'Review Rating': v.review?.rating ? `${v.review.rating} / 5` : 'No rating',
        'Review Comment': v.review?.review_text || ''
      }
    })

    const headers = Object.keys(rows[0])
    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => `"${String((row as any)[h] || '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `medilab_clinical_records_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Metric Bar (Interactive / Clickable) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Directs to Patients tab */}
        <div 
          onClick={() => router.push(`/${locale}/dashboard?tab=patients`)}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all cursor-pointer group flex items-center justify-between"
          title="Click to view all Patients"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-400 group-hover:text-blue-600 transition-colors">
              <span>{isAr ? 'إجمالي الزيارات المسجلة' : 'Total Recorded Visits'}</span>
              <span>→</span>
            </div>
            <h3 className="text-3xl font-black text-gray-900 dark:text-white mt-1 group-hover:text-blue-600 transition-colors">
              {visits.length}
            </h3>
            <span className="text-[10px] text-blue-500 font-bold">Open Patients Directory ↗</span>
          </div>
          <span className="text-3xl group-hover:scale-110 transition-transform">📋</span>
        </div>

        {/* Card 2: Confirmed payments */}
        <div 
          onClick={() => setFilterPayment('paid')}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all cursor-pointer group flex items-center justify-between"
          title="Click to filter Paid visits"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-400 group-hover:text-emerald-600 transition-colors">
              <span>{isAr ? 'إجمالي المبالغ المستلمة' : 'Confirmed Payments Received'}</span>
              <span>✓</span>
            </div>
            <h3 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {totalCollectedRevenue.toLocaleString()} <span className="text-sm font-bold">EGP</span>
            </h3>
            <span className="text-[10px] text-emerald-600 font-bold">Filter Paid Only ↗</span>
          </div>
          <span className="text-3xl group-hover:scale-110 transition-transform">💰</span>
        </div>

        {/* Card 3: Prescriptions Issued -> Directs to Patients tab */}
        <div 
          onClick={() => router.push(`/${locale}/dashboard?tab=patients`)}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-purple-500/30 transition-all cursor-pointer group flex items-center justify-between"
          title="Click to view Patients & Prescriptions"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-gray-400 group-hover:text-purple-600 transition-colors">
              <span>{isAr ? 'روشتات وعلاجات صادرة' : 'Prescriptions Issued'}</span>
              <span>→</span>
            </div>
            <h3 className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-1 group-hover:text-purple-600 transition-colors">
              {visits.filter(v => !!v.prescription).length}
            </h3>
            <span className="text-[10px] text-purple-500 font-bold">Manage in Patients Tab ↗</span>
          </div>
          <span className="text-3xl group-hover:scale-110 transition-transform">💊</span>
        </div>
      </div>

      {/* Toolbar: Date Range Filters & Export to Excel */}
      <div className="bg-white dark:bg-gray-900 p-4 sm:p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-3.5">
        
        {/* Top Row: Search + Export Button */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isAr ? 'البحث باسم المريض، التشخيص، أو الدواء...' : 'Search by patient name, diagnosis, symptoms, or medications...'}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute left-3.5 top-3 text-gray-400">🔍</span>
          </div>

          {/* Export to Excel / CSV Button */}
          <button
            type="button"
            onClick={handleExportToExcel}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 shrink-0 active:scale-95"
          >
            <span>📊</span>
            <span>{isAr ? 'تصدير إكسيل (Excel .csv)' : 'Export to Excel (.csv)'}</span>
            <span className="text-[11px] opacity-80">({filteredVisits.length})</span>
          </button>
        </div>

        {/* Date Range Selector Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <span className="text-xs font-bold text-gray-400 mr-1 flex items-center gap-1">
              <span>📅</span>
              <span>{isAr ? 'التاريخ:' : 'Date:'}</span>
            </span>
            {[
              { id: 'all', label: isAr ? 'كل الفترات' : 'All Time' },
              { id: 'today', label: isAr ? 'اليوم' : 'Today' },
              { id: 'this_week', label: isAr ? 'هذا الأسبوع' : 'This Week' },
              { id: 'this_month', label: isAr ? 'هذا الشهر' : 'This Month' },
              { id: 'last_30', label: isAr ? 'آخر 30 يوم' : 'Last 30 Days' },
              { id: 'custom', label: isAr ? 'مخصص' : 'Custom Range' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1 text-xs font-bold outline-none"
              />
              <span className="text-xs text-gray-400">→</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2.5 py-1 text-xs font-bold outline-none"
              />
            </div>
          )}

          {/* Payment Status Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(['all', 'paid', 'paid_by_patient', 'pending'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterPayment(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  filterPayment === st
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {st === 'all' && (isAr ? 'الكل' : 'All Payments')}
                {st === 'paid' && (isAr ? '✅ مؤكد' : '✅ Paid')}
                {st === 'paid_by_patient' && (isAr ? '⚠️ بانتظار التأكيد' : '⚠️ Verifying')}
                {st === 'pending' && (isAr ? '⏳ لم يدفع' : '⏳ Pending')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-8">
          <div className="text-5xl mb-3">📜</div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {isAr ? 'لا توجد سجلات مطابقة للبحث' : 'No visits match your criteria'}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {isAr ? 'سجلات الزيارات المكتملة وتاريخ المدفوعات والروشتات ستظهر هنا.' : 'Past consultations, payment verifications, and clinical updates will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVisits.map((visit) => {
            const patientName = visit.patient?.full_name || visit.manual_patient?.full_name || 'Patient'
            const isPaid = visit.payment_status === 'paid'
            const isPaidByPatient = visit.payment_status === 'paid_by_patient'
            const isManual = !visit.patient_id && !!visit.manual_patient_id

            return (
              <div
                key={visit.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                {/* Row Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-blue-500/20">
                      {patientName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-black text-lg text-gray-900 dark:text-white">
                          {patientName}
                        </h4>
                        {visit.family_member_name && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                            👨‍👩‍👧 {visit.family_member_name}
                          </span>
                        )}
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isManual ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {isManual ? 'Offline' : 'Registered'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span>📅 {new Date(visit.scheduled_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span className="capitalize">🏥 {(visit.appointment_type || 'clinic_normal').replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Badge & Confirmation Button */}
                  <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                    <div className="text-right">
                      <span className="text-sm font-black block text-gray-900 dark:text-white">
                        {visit.fees || 0} EGP
                      </span>
                      <span className={`text-[11px] font-black uppercase tracking-wider ${
                        isPaid
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : isPaidByPatient
                            ? 'text-amber-500 animate-pulse'
                            : 'text-gray-400'
                      }`}>
                        {isPaid
                          ? (isAr ? '✅ مؤكد الدفع' : '✅ Paid (Confirmed)')
                          : isPaidByPatient
                            ? (isAr ? '⚠️ حولها المريض (تأكيد؟)' : '⚠️ Paid by Patient')
                            : (isAr ? '⏳ لم يدفع بعد' : '⏳ Unpaid')}
                      </span>
                    </div>

                    {!isPaid && (
                      <button
                        onClick={() => handleConfirmPayment(visit.id)}
                        disabled={confirmingId === visit.id}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span>💰</span>
                        <span>{confirmingId === visit.id ? '...' : (isAr ? 'تأكيد استلام المبلغ' : 'Confirm Received')}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Clinical Updates: Condition, Diagnosis & Prescriptions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Diagnosis & Symptoms */}
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      🩺 {isAr ? 'التشخيص وحالة المريض' : 'Condition & Diagnosis'}
                    </p>
                    {visit.prescription?.diagnosis ? (
                      <div>
                        <p className="font-black text-sm text-gray-900 dark:text-white">
                          {visit.prescription.diagnosis}
                        </p>
                        {visit.prescription.symptoms && (
                          <p className="text-xs text-gray-500 mt-1">
                            <span className="font-bold">{isAr ? 'الأعراض:' : 'Symptoms:'}</span> {visit.prescription.symptoms}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        {isAr ? 'لا يوجد تشخيص مسجل لهذه الزيارة' : 'No clinical diagnosis recorded for this visit'}
                      </p>
                    )}
                  </div>

                  {/* Medications Prescribed */}
                  <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-purple-500">
                        💊 {isAr ? 'الأدوية الموصوفة' : 'Prescribed Medications'}
                      </p>
                      {visit.prescription && (
                        <button
                          onClick={() => setViewingRx({ rx: visit.prescription, patientName })}
                          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <span>📄</span>
                          <span>PDF / Rx</span>
                        </button>
                      )}
                    </div>
                    {visit.prescription?.medications && visit.prescription.medications.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {visit.prescription.medications.map((m: any, idx: number) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 font-bold text-xs rounded-xl border border-purple-100 dark:border-purple-900/30 shadow-sm"
                          >
                            {m.name} {m.dosage ? `· ${m.dosage}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        {isAr ? 'لم يتم صرف أدوية في هذه الزيارة' : 'No medications recorded'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Patient Social Review & Stars */}
                {visit.review && (
                  <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex text-amber-400 text-sm">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i}>{i < visit.review!.rating ? '★' : '☆'}</span>
                          ))}
                        </div>
                        <span className="text-xs font-black text-amber-800 dark:text-amber-200">
                          {isAr ? 'تقييم ورأي المريض' : 'Verified Patient Review'}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {visit.review.created_at ? new Date(visit.review.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    {visit.review.review_text && (
                      <p className="text-xs text-gray-700 dark:text-gray-300 italic">
                        "{visit.review.review_text}"
                      </p>
                    )}
                    {visit.review.tags && visit.review.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {visit.review.tags.map((t, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* PDF Prescription Viewer Modal */}
      {viewingRx && (
        <PrescriptionViewerModal
          prescription={viewingRx.rx}
          patientName={viewingRx.patientName}
          onClose={() => setViewingRx(null)}
        />
      )}
    </div>
  )
}
