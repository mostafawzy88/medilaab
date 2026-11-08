'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { SUBSCRIPTION_PLANS } from '@/utils/pricing'

type AppointmentRecord = {
  id: string
  doctor_id: string
  patient_id?: string | null
  manual_patient_id?: string | null
  scheduled_time: string
  status: string
  appointment_type: string
  fees: number
  payment_status: string
  created_at: string
  patient_name?: string
  doctor_name?: string
  doctor_specialization?: string
}

type SubscriptionRecord = {
  id: string
  user_id: string
  plan_id: string
  duration_months: number
  amount: number
  receipt_url: string
  status: string
  admin_notes: string | null
  created_at: string
  user_name?: string
  user_email?: string
  user_role?: string
}

type StaffMember = {
  id: string
  full_name: string
  role: string
  specialization?: string | null
  clinic_location?: string | null
  plan_id?: string | null
  subscription_status?: string | null
}

export default function AdminFinancials() {
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])

  // Filters
  const [dateRangePreset, setDateRangePreset] = useState<'today' | 'week' | 'month' | 'last30' | 'year' | 'all' | 'custom'>('month')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<'all' | 'subscriptions' | 'appointments'>('all')
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'paid' | 'pending' | 'rejected'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSubTab, setActiveSubTab] = useState<'kpi' | 'doctors' | 'ledger'>('kpi')

  // Receipt Modal
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null)

  useEffect(() => {
    fetchFinancialData()
  }, [])

  const fetchFinancialData = async () => {
    setLoading(true)
    const supabase = createClient()

    // 1. Fetch staff
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, full_name, role, specialization, clinic_location, plan_id, subscription_status')
      .in('role', ['doctor', 'nurse'])

    const staffList: StaffMember[] = staffData || []
    setStaff(staffList)

    const staffMap = new Map<string, StaffMember>()
    staffList.forEach(s => staffMap.set(s.id, s))

    // 2. Fetch appointments
    const { data: apptData } = await supabase
      .from('appointments')
      .select(`
        id, doctor_id, patient_id, manual_patient_id, scheduled_time, status, 
        appointment_type, fees, payment_status, created_at,
        patient:profiles!appointments_patient_id_fkey(full_name),
        manual_patient:manual_patients(full_name)
      `)
      .order('scheduled_time', { ascending: false })

    if (apptData) {
      const mappedAppts: AppointmentRecord[] = apptData.map((a: any) => {
        const doc = staffMap.get(a.doctor_id)
        return {
          id: a.id,
          doctor_id: a.doctor_id,
          patient_id: a.patient_id,
          manual_patient_id: a.manual_patient_id,
          scheduled_time: a.scheduled_time,
          status: a.status,
          appointment_type: a.appointment_type || 'clinic_normal',
          fees: Number(a.fees) || 0,
          payment_status: a.payment_status || 'pending',
          created_at: a.created_at,
          patient_name: a.patient?.full_name || a.manual_patient?.full_name || 'Walk-in Patient',
          doctor_name: doc?.full_name || 'Dr. Unknown',
          doctor_specialization: doc?.specialization || 'General'
        }
      })
      setAppointments(mappedAppts)
    }

    // 3. Fetch subscription payments
    const { data: subData } = await supabase
      .from('subscription_payments')
      .select(`
        id, user_id, plan_id, duration_months, amount, receipt_url, status, 
        admin_notes, created_at,
        user:profiles(full_name, email, role)
      `)
      .order('created_at', { ascending: false })

    if (subData) {
      const mappedSubs: SubscriptionRecord[] = subData.map((s: any) => ({
        id: s.id,
        user_id: s.user_id,
        plan_id: s.plan_id,
        duration_months: s.duration_months,
        amount: Number(s.amount) || 0,
        receipt_url: s.receipt_url,
        status: s.status,
        admin_notes: s.admin_notes,
        created_at: s.created_at,
        user_name: s.user?.full_name || 'Staff User',
        user_email: s.user?.email || '',
        user_role: s.user?.role || 'doctor'
      }))
      setSubscriptions(mappedSubs)
    }

    setLoading(false)
  }

  // Calculate Date Bounds
  const dateBounds = useMemo(() => {
    const now = new Date()
    let start: Date
    let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    switch (dateRangePreset) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        break
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        start.setHours(0, 0, 0, 0)
        break
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        break
      case 'last30':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        start.setHours(0, 0, 0, 0)
        break
      case 'year':
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
        break
      case 'custom':
        start = customStart ? new Date(customStart + 'T00:00:00') : new Date(2020, 0, 1)
        end = customEnd ? new Date(customEnd + 'T23:59:59') : end
        break
      case 'all':
      default:
        start = new Date(2020, 0, 1)
        break
    }
    return { start, end }
  }, [dateRangePreset, customStart, customEnd])

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => {
      const aDate = new Date(a.scheduled_time || a.created_at)
      if (aDate < dateBounds.start || aDate > dateBounds.end) return false
      if (selectedDoctorId !== 'all' && a.doctor_id !== selectedDoctorId) return false
      if (selectedType === 'subscriptions') return false

      if (selectedStatus === 'paid' && a.payment_status !== 'paid') return false
      if (selectedStatus === 'pending' && a.payment_status !== 'pending') return false
      if (selectedStatus === 'rejected' && a.status !== 'cancelled') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchPatient = a.patient_name?.toLowerCase().includes(q)
        const matchDoctor = a.doctor_name?.toLowerCase().includes(q)
        const matchType = a.appointment_type.toLowerCase().includes(q)
        if (!matchPatient && !matchDoctor && !matchType) return false
      }

      return true
    })
  }, [appointments, dateBounds, selectedDoctorId, selectedType, selectedStatus, searchQuery])

  // Filtered Subscriptions
  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter(s => {
      const sDate = new Date(s.created_at)
      if (sDate < dateBounds.start || sDate > dateBounds.end) return false
      if (selectedDoctorId !== 'all' && s.user_id !== selectedDoctorId) return false
      if (selectedType === 'appointments') return false

      if (selectedStatus === 'paid' && s.status !== 'approved') return false
      if (selectedStatus === 'pending' && s.status !== 'pending') return false
      if (selectedStatus === 'rejected' && s.status !== 'rejected') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchUser = s.user_name?.toLowerCase().includes(q)
        const matchEmail = s.user_email?.toLowerCase().includes(q)
        const matchPlan = s.plan_id.toLowerCase().includes(q)
        if (!matchUser && !matchEmail && !matchPlan) return false
      }

      return true
    })
  }, [subscriptions, dateBounds, selectedDoctorId, selectedType, selectedStatus, searchQuery])

  // Aggregate Key Performance Indicators
  const kpi = useMemo(() => {
    // 1. Subscription Revenue (Approved)
    const approvedSubs = filteredSubscriptions.filter(s => s.status === 'approved')
    const subRevenue = approvedSubs.reduce((acc, s) => acc + s.amount, 0)

    // 2. Pending Subscriptions
    const pendingSubs = filteredSubscriptions.filter(s => s.status === 'pending')
    const pendingSubRevenue = pendingSubs.reduce((acc, s) => acc + s.amount, 0)

    // 3. Clinic Consultations Fees
    const validAppts = filteredAppointments.filter(a => a.status !== 'cancelled')
    const totalConsultationFees = validAppts.reduce((acc, a) => acc + a.fees, 0)

    // Paid vs Pending Consultation Fees
    const paidAppts = validAppts.filter(a => a.payment_status === 'paid')
    const paidConsultationFees = paidAppts.reduce((acc, a) => acc + a.fees, 0)

    const pendingAppts = validAppts.filter(a => a.payment_status === 'pending')
    const pendingConsultationFees = pendingAppts.reduce((acc, a) => acc + a.fees, 0)

    // Total Platform Gross (SaaS Subscriptions Collected)
    const totalPlatformRevenue = subRevenue

    // Total System Volume (Platform SaaS + Clinic fees processed)
    const totalGrossVolume = subRevenue + totalConsultationFees

    // Total Pending Money in System
    const totalPendingRevenue = pendingSubRevenue + pendingConsultationFees

    // Total Transactions
    const totalTransactions = approvedSubs.length + validAppts.length
    const avgTransaction = totalTransactions > 0 ? Math.round(totalGrossVolume / totalTransactions) : 0

    return {
      subRevenue,
      pendingSubRevenue,
      approvedSubsCount: approvedSubs.length,
      pendingSubsCount: pendingSubs.length,
      totalConsultationFees,
      paidConsultationFees,
      pendingConsultationFees,
      validApptsCount: validAppts.length,
      totalPlatformRevenue,
      totalGrossVolume,
      totalPendingRevenue,
      totalTransactions,
      avgTransaction
    }
  }, [filteredSubscriptions, filteredAppointments])

  // Doctor Breakdown
  const doctorLeaderboard = useMemo(() => {
    const map = new Map<string, {
      id: string
      name: string
      specialization: string
      appointmentsCount: number
      totalRevenue: number
      paidRevenue: number
      pendingRevenue: number
      plan: string
      subPaidTotal: number
    }>()

    // Initialize with all authorized doctors
    staff.filter(s => s.role === 'doctor').forEach(doc => {
      map.set(doc.id, {
        id: doc.id,
        name: doc.full_name,
        specialization: doc.specialization || 'General Practitioner',
        appointmentsCount: 0,
        totalRevenue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
        plan: doc.plan_id || 'basic',
        subPaidTotal: 0
      })
    })

    // Accumulate appointments
    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const entry = map.get(a.doctor_id) || {
        id: a.doctor_id,
        name: a.doctor_name || 'Dr. Unknown',
        specialization: a.doctor_specialization || 'General',
        appointmentsCount: 0,
        totalRevenue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
        plan: 'basic',
        subPaidTotal: 0
      }

      entry.appointmentsCount += 1
      entry.totalRevenue += a.fees
      if (a.payment_status === 'paid') entry.paidRevenue += a.fees
      else entry.pendingRevenue += a.fees

      map.set(a.doctor_id, entry)
    })

    // Accumulate subscriptions
    filteredSubscriptions.forEach(s => {
      if (s.status !== 'approved') return
      const entry = map.get(s.user_id)
      if (entry) {
        entry.subPaidTotal += s.amount
        entry.plan = s.plan_id
      }
    })

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  }, [staff, filteredAppointments, filteredSubscriptions])

  // Breakdown by Appointment Type
  const apptTypeStats = useMemo(() => {
    const stats = {
      clinic_normal: { count: 0, revenue: 0 },
      clinic_urgent: { count: 0, revenue: 0 },
      home_visit: { count: 0, revenue: 0 }
    }
    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const type = a.appointment_type as keyof typeof stats
      if (stats[type]) {
        stats[type].count += 1
        stats[type].revenue += a.fees
      }
    })
    return stats
  }, [filteredAppointments])

  // Subscription Breakdown by Plan
  const planStats = useMemo(() => {
    const counts: Record<string, { count: number, revenue: number }> = {
      basic: { count: 0, revenue: 0 },
      pro: { count: 0, revenue: 0 },
      elite: { count: 0, revenue: 0 }
    }
    filteredSubscriptions.forEach(s => {
      if (s.status === 'approved') {
        const p = s.plan_id.toLowerCase()
        if (!counts[p]) counts[p] = { count: 0, revenue: 0 }
        counts[p].count += 1
        counts[p].revenue += s.amount
      }
    })
    return counts
  }, [filteredSubscriptions])

  // Combined Ledger for table view
  const combinedLedger = useMemo(() => {
    const rows: Array<{
      id: string
      date: string
      type: 'Subscription' | 'Consultation'
      partyName: string
      doctorName?: string
      details: string
      amount: number
      status: string
      paymentStatus: string
      receiptUrl?: string
    }> = []

    filteredSubscriptions.forEach(s => {
      rows.push({
        id: `sub-${s.id}`,
        date: s.created_at,
        type: 'Subscription',
        partyName: s.user_name || 'Staff User',
        details: `${s.plan_id.toUpperCase()} Plan (${s.duration_months} mo)`,
        amount: s.amount,
        status: s.status,
        paymentStatus: s.status === 'approved' ? 'paid' : s.status,
        receiptUrl: s.receipt_url
      })
    })

    filteredAppointments.forEach(a => {
      rows.push({
        id: `apt-${a.id}`,
        date: a.scheduled_time || a.created_at,
        type: 'Consultation',
        partyName: a.patient_name || 'Patient',
        doctorName: a.doctor_name,
        details: a.appointment_type.replace('_', ' ').toUpperCase(),
        amount: a.fees,
        status: a.status,
        paymentStatus: a.payment_status
      })
    })

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [filteredSubscriptions, filteredAppointments])

  // Export CSV
  const handleExportCSV = () => {
    if (combinedLedger.length === 0) {
      alert('No financial data available for the selected filters.')
      return
    }

    const headers = ['Transaction ID', 'Date & Time', 'Type', 'Party / Patient', 'Doctor / Clinic', 'Details', 'Amount (EGP)', 'Lifecycle Status', 'Payment Status']
    const csvRows = [
      headers.join(','),
      ...combinedLedger.map(row => [
        `"${row.id}"`,
        `"${new Date(row.date).toLocaleString()}"`,
        `"${row.type}"`,
        `"${(row.partyName || '').replace(/"/g, '""')}"`,
        `"${(row.doctorName || '-').replace(/"/g, '""')}"`,
        `"${row.details}"`,
        row.amount,
        `"${row.status}"`,
        `"${row.paymentStatus}"`
      ].join(','))
    ]

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `medilab_financial_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Print Report
  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500 font-bold">Aggregating financial ledger and analytics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 text-xl">💰</span>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Financial Intelligence & Earnings</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Real-time platform SaaS revenues, doctor earnings, consultations volume, and accounting reports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchFinancialData}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-all"
            title="Refresh Ledger"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-black text-gray-800 dark:text-gray-200 flex items-center gap-2 transition-all shadow-sm"
          >
            <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-90 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Report
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS TOOLBAR */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4 print:hidden">
        {/* Date presets */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-gray-400 mr-2">Period:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'last30', label: 'Last 30 Days' },
              { id: 'year', label: 'This Year' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDateRangePreset(p.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  dateRangePreset === p.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {dateRangePreset === 'custom' && (
            <div className="flex items-center gap-2 animate-in fade-in">
              <input
                type="date"
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
              />
              <span className="text-gray-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 outline-none"
              />
            </div>
          )}
        </div>

        {/* Secondary Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {/* Doctor filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Filter By Doctor</label>
            <select
              value={selectedDoctorId}
              onChange={e => setSelectedDoctorId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="all">All Doctors & Clinics</option>
              {staff.filter(s => s.role === 'doctor').map(doc => (
                <option key={doc.id} value={doc.id}>Dr. {doc.full_name}</option>
              ))}
            </select>
          </div>

          {/* Type filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Transaction Category</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="all">All Categories (Subs + Appts)</option>
              <option value="subscriptions">Platform SaaS Subscriptions</option>
              <option value="appointments">Clinic Consultation Fees</option>
            </select>
          </div>

          {/* Status filter */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Payment Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid / Approved</option>
              <option value="pending">Pending Collection</option>
              <option value="rejected">Rejected / Cancelled</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Search Ledger</label>
            <input
              type="text"
              placeholder="Search doctor, patient, plan..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: SaaS Earnings */}
        <div className="bg-gradient-to-br from-blue-500/10 via-white to-emerald-500/10 dark:from-blue-900/20 dark:via-gray-900 dark:to-emerald-900/20 p-6 rounded-3xl border border-blue-200 dark:border-blue-800/50 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Admin Platform SaaS</span>
            <span className="text-xl">💎</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {kpi.subRevenue.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-gray-400">EGP</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>{kpi.approvedSubsCount} Approved Payments</span>
            {kpi.pendingSubRevenue > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-black animate-pulse">
                +{kpi.pendingSubRevenue.toLocaleString()} EGP pending
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Clinic Consultations Volume */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Clinic Consultations</span>
            <span className="text-xl">🏥</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {kpi.totalConsultationFees.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-gray-400">EGP</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>{kpi.validApptsCount} Patient Visits</span>
            <span className="text-emerald-600 font-bold">{kpi.paidConsultationFees.toLocaleString()} EGP paid</span>
          </div>
        </div>

        {/* Card 3: Combined Gross Volume */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Total System Gross</span>
            <span className="text-xl">📊</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {kpi.totalGrossVolume.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-gray-400">EGP</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>{kpi.totalTransactions} Total Events</span>
            <span>Avg: {kpi.avgTransaction.toLocaleString()} EGP</span>
          </div>
        </div>

        {/* Card 4: Total Pending Collections */}
        <div className="bg-amber-50/50 dark:bg-amber-950/20 p-6 rounded-3xl border border-amber-200 dark:border-amber-900/40 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">Pending Collections</span>
            <span className="text-xl">⏳</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-900 dark:text-amber-100">
              {kpi.totalPendingRevenue.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-amber-600">EGP</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-amber-700 dark:text-amber-400 pt-3 border-t border-amber-200/50 dark:border-amber-900/50">
            <span>{kpi.pendingSubsCount} Sub Receipts</span>
            <span>{kpi.pendingConsultationFees.toLocaleString()} EGP Appts</span>
          </div>
        </div>
      </div>

      {/* SUB-TABS (Overview Analytics vs Doctor Leaderboard vs Detailed Ledger) */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2 print:hidden">
        <button
          onClick={() => setActiveSubTab('kpi')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'kpi'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Overview & Breakdowns
        </button>
        <button
          onClick={() => setActiveSubTab('doctors')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'doctors'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Doctor Earnings & Clinic Ranking ({doctorLeaderboard.length})
        </button>
        <button
          onClick={() => setActiveSubTab('ledger')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'ledger'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Transaction Ledger & Auditing ({combinedLedger.length})
        </button>
      </div>

      {/* VIEW 1: OVERVIEW & BREAKDOWNS */}
      {(activeSubTab === 'kpi' || typeof window !== 'undefined') && (
        <div className={`space-y-6 ${activeSubTab !== 'kpi' ? 'hidden print:block' : ''}`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Subscription Revenue by Tier */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">SaaS Revenue by Plan</h3>
                  <p className="text-xs text-gray-500">Collected platform subscription revenues</p>
                </div>
                <span className="text-xs font-black px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-full">
                  {kpi.subRevenue.toLocaleString()} EGP Total
                </span>
              </div>

              <div className="space-y-4">
                {SUBSCRIPTION_PLANS.map(plan => {
                  const data = planStats[plan.id.toLowerCase()] || { count: 0, revenue: 0 }
                  const share = kpi.subRevenue > 0 ? Math.round((data.revenue / kpi.subRevenue) * 100) : 0
                  return (
                    <div key={plan.id} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                          <span className="font-black text-sm text-gray-900 dark:text-white">{plan.name}</span>
                          <span className="text-xs text-gray-400">({plan.price} EGP/mo)</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-gray-900 dark:text-white">{data.revenue.toLocaleString()} EGP</span>
                          <span className="text-xs text-gray-400 block">{data.count} Payments ({share}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] h-full rounded-full transition-all duration-700"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Clinic Consultations by Type */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">Consultations by Type</h3>
                  <p className="text-xs text-gray-500">Breakdown of patient clinical visits</p>
                </div>
                <span className="text-xs font-black px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-full">
                  {kpi.totalConsultationFees.toLocaleString()} EGP Total
                </span>
              </div>

              <div className="space-y-4">
                {[
                  { id: 'clinic_normal', label: 'Normal Clinic Visit', color: 'from-blue-500 to-blue-600', dot: 'bg-blue-500' },
                  { id: 'clinic_urgent', label: 'Urgent Examination', color: 'from-amber-500 to-amber-600', dot: 'bg-amber-500' },
                  { id: 'home_visit', label: 'Home Visit', color: 'from-purple-500 to-purple-600', dot: 'bg-purple-500' },
                ].map(type => {
                  const data = apptTypeStats[type.id as keyof typeof apptTypeStats] || { count: 0, revenue: 0 }
                  const share = kpi.totalConsultationFees > 0 ? Math.round((data.revenue / kpi.totalConsultationFees) * 100) : 0
                  return (
                    <div key={type.id} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${type.dot}`}></span>
                          <span className="font-black text-sm text-gray-900 dark:text-white">{type.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-gray-900 dark:text-white">{data.revenue.toLocaleString()} EGP</span>
                          <span className="text-xs text-gray-400 block">{data.count} Visits ({share}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`bg-gradient-to-r ${type.color} h-full rounded-full transition-all duration-700`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: DOCTOR EARNINGS & CLINIC RANKING */}
      {(activeSubTab === 'doctors' || typeof window !== 'undefined') && (
        <div className={`space-y-4 ${activeSubTab !== 'doctors' ? 'hidden print:block' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Doctor Performance & Earnings Table</h3>
                <p className="text-xs text-gray-500">Ranking of doctors by generated patient revenue and SaaS subscription status</p>
              </div>
              <span className="text-xs font-bold text-gray-400">{doctorLeaderboard.length} Doctors</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-6 py-4">Rank / Doctor</th>
                    <th className="px-6 py-4">Specialization</th>
                    <th className="px-6 py-4">Consultations</th>
                    <th className="px-6 py-4">Total Revenue</th>
                    <th className="px-6 py-4">Paid Fees</th>
                    <th className="px-6 py-4">Pending Fees</th>
                    <th className="px-6 py-4">SaaS Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {doctorLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">No doctor activity found for this period.</td>
                    </tr>
                  ) : (
                    doctorLeaderboard.map((doc, idx) => (
                      <tr key={doc.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                              idx === 0 ? 'bg-amber-100 text-amber-700' :
                              idx === 1 ? 'bg-slate-200 text-slate-700' :
                              idx === 2 ? 'bg-amber-700/10 text-amber-800' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <p className="font-black text-gray-900 dark:text-white">Dr. {doc.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">ID: {doc.id.substring(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{doc.specialization}</span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">
                          {doc.appointmentsCount} visits
                        </td>
                        <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400">
                          {doc.totalRevenue.toLocaleString()} EGP
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">
                          {doc.paidRevenue.toLocaleString()} EGP
                        </td>
                        <td className="px-6 py-4">
                          {doc.pendingRevenue > 0 ? (
                            <span className="text-amber-600 font-bold text-xs">
                              {doc.pendingRevenue.toLocaleString()} EGP
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">0 EGP</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                            {doc.plan}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: TRANSACTION LEDGER & AUDITING */}
      {(activeSubTab === 'ledger' || typeof window !== 'undefined') && (
        <div className={`space-y-4 ${activeSubTab !== 'ledger' ? 'hidden print:block' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Financial Ledger</h3>
                <p className="text-xs text-gray-500">Complete itemized record of all SaaS subscription receipts and patient appointments</p>
              </div>
              <div className="text-xs font-bold text-gray-500">
                Showing {combinedLedger.length} Records
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Party / Patient</th>
                    <th className="px-6 py-4">Doctor / Clinic</th>
                    <th className="px-6 py-4">Item Details</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Receipt / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {combinedLedger.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">No transactions found matching your criteria.</td>
                    </tr>
                  ) : (
                    combinedLedger.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          {new Date(tx.date).toLocaleDateString()} {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            tx.type === 'Subscription' 
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          {tx.partyName}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                          {tx.doctorName ? `Dr. ${tx.doctorName}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono font-bold text-gray-500">
                          {tx.details}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-black text-gray-900 dark:text-white">
                          {tx.amount.toLocaleString()} EGP
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            tx.paymentStatus === 'paid' || tx.paymentStatus === 'approved'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : tx.paymentStatus === 'pending'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {tx.paymentStatus}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {tx.receiptUrl ? (
                            <button
                              onClick={() => setViewReceiptUrl(tx.receiptUrl!)}
                              className="text-xs font-bold text-blue-600 hover:text-blue-700 underline underline-offset-2"
                            >
                              View Receipt
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RECEIPT VIEWER MODAL */}
      {viewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-black text-lg">Subscription Payment Receipt</h3>
              <button
                onClick={() => setViewReceiptUrl(null)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
              >
                ✕
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden max-h-[60vh] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <img src={viewReceiptUrl} alt="Payment Receipt" className="object-contain w-full h-full max-h-[60vh]" />
            </div>
            <div className="flex justify-between items-center pt-2">
              <a
                href={viewReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Open Original in New Tab ↗
              </a>
              <button
                onClick={() => setViewReceiptUrl(null)}
                className="px-5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
