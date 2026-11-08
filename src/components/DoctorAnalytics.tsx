'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'

type AppointmentItem = {
  id: string
  patient_id?: string | null
  manual_patient_id?: string | null
  scheduled_time: string
  status: string
  appointment_type: string
  fees: number
  payment_status: string
  notes?: string | null
  created_at: string
  patient_name: string
  patient_phone?: string | null
  is_manual?: boolean
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function DoctorAnalytics({ doctorId }: { doctorId: string }) {
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])

  // Filters
  const [dateRangePreset, setDateRangePreset] = useState<'today' | 'week' | 'month' | 'last30' | 'year' | 'all' | 'custom'>('month')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'busyTimes' | 'patients' | 'visits'>('overview')

  useEffect(() => {
    fetchAppointments()
  }, [doctorId])

  const fetchAppointments = async () => {
    setLoading(true)
    const supabase = createClient()

    const { data } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, scheduled_time, status, 
        appointment_type, fees, payment_status, notes, created_at,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .eq('doctor_id', doctorId)
      .order('scheduled_time', { ascending: false })

    if (data) {
      const mapped: AppointmentItem[] = data.map((a: any) => ({
        id: a.id,
        patient_id: a.patient_id,
        manual_patient_id: a.manual_patient_id,
        scheduled_time: a.scheduled_time,
        status: a.status,
        appointment_type: a.appointment_type || 'clinic_normal',
        fees: Number(a.fees) || 0,
        payment_status: a.payment_status || 'pending',
        notes: a.notes,
        created_at: a.created_at,
        patient_name: a.patient?.full_name || a.manual_patient?.full_name || 'Walk-in Patient',
        patient_phone: a.patient?.phone_number || a.manual_patient?.phone_number || null,
        is_manual: !a.patient_id && !!a.manual_patient_id
      }))
      setAppointments(mapped)
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

      if (selectedType !== 'all' && a.appointment_type !== selectedType) return false
      if (selectedPaymentStatus === 'paid' && a.payment_status !== 'paid') return false
      if (selectedPaymentStatus === 'pending' && a.payment_status !== 'pending') return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = a.patient_name.toLowerCase().includes(q)
        const matchPhone = a.patient_phone?.toLowerCase().includes(q)
        const matchNotes = a.notes?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchNotes) return false
      }

      return true
    })
  }, [appointments, dateBounds, selectedType, selectedPaymentStatus, searchQuery])

  // Key Financial & Patient KPIs
  const metrics = useMemo(() => {
    const nonCancelled = filteredAppointments.filter(a => a.status !== 'cancelled')
    const completed = filteredAppointments.filter(a => a.status === 'completed')
    const cancelled = filteredAppointments.filter(a => a.status === 'cancelled')

    // Earnings
    const totalMoneyMade = nonCancelled.reduce((sum, a) => sum + a.fees, 0)
    const paidFees = nonCancelled.filter(a => a.payment_status === 'paid').reduce((sum, a) => sum + a.fees, 0)
    const pendingFees = nonCancelled.filter(a => a.payment_status === 'pending').reduce((sum, a) => sum + a.fees, 0)
    const avgFee = nonCancelled.length > 0 ? Math.round(totalMoneyMade / nonCancelled.length) : 0

    // Unique Patients
    const patientIdentifierMap = new Map<string, number>()
    nonCancelled.forEach(a => {
      const key = a.patient_id || a.manual_patient_id || a.patient_name
      patientIdentifierMap.set(key, (patientIdentifierMap.get(key) || 0) + 1)
    })
    const uniquePatientsCount = patientIdentifierMap.size

    // Repeat vs New Patients
    let returningPatientsCount = 0
    patientIdentifierMap.forEach(count => {
      if (count > 1) returningPatientsCount += 1
    })
    const newPatientsCount = uniquePatientsCount - returningPatientsCount
    const retentionRate = uniquePatientsCount > 0 ? Math.round((returningPatientsCount / uniquePatientsCount) * 100) : 0

    // Completion Rate
    const totalBooked = filteredAppointments.length
    const completionRate = totalBooked > 0 ? Math.round((completed.length / totalBooked) * 100) : 0

    return {
      totalMoneyMade,
      paidFees,
      pendingFees,
      avgFee,
      totalVisits: nonCancelled.length,
      completedVisits: completed.length,
      cancelledVisits: cancelled.length,
      totalBooked,
      uniquePatientsCount,
      returningPatientsCount,
      newPatientsCount,
      retentionRate,
      completionRate
    }
  }, [filteredAppointments])

  // Visit Type Breakdown
  const typeBreakdown = useMemo(() => {
    const res: Record<string, { label: string, count: number, revenue: number, color: string, dot: string }> = {
      clinic_normal: { label: 'Normal Examination', count: 0, revenue: 0, color: 'from-blue-500 to-blue-600', dot: 'bg-blue-500' },
      clinic_urgent: { label: 'Urgent Examination', count: 0, revenue: 0, color: 'from-amber-500 to-amber-600', dot: 'bg-amber-500' },
      home_visit: { label: 'Home Visit', count: 0, revenue: 0, color: 'from-purple-500 to-purple-600', dot: 'bg-purple-500' },
    }

    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const t = a.appointment_type
      if (res[t]) {
        res[t].count += 1
        res[t].revenue += a.fees
      }
    })

    return res
  }, [filteredAppointments])

  // BUSY TIMES: Day of Week Analysis
  const busyDays = useMemo(() => {
    const days = [
      { name: 'Sunday', count: 0, revenue: 0 },
      { name: 'Monday', count: 0, revenue: 0 },
      { name: 'Tuesday', count: 0, revenue: 0 },
      { name: 'Wednesday', count: 0, revenue: 0 },
      { name: 'Thursday', count: 0, revenue: 0 },
      { name: 'Friday', count: 0, revenue: 0 },
      { name: 'Saturday', count: 0, revenue: 0 },
    ]

    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const date = new Date(a.scheduled_time || a.created_at)
      const dayIndex = date.getDay() // 0 = Sun
      if (days[dayIndex]) {
        days[dayIndex].count += 1
        days[dayIndex].revenue += a.fees
      }
    })

    const maxDayCount = Math.max(...days.map(d => d.count), 1)
    const peakDay = [...days].sort((a, b) => b.count - a.count)[0]

    return { days, maxDayCount, peakDay }
  }, [filteredAppointments])

  // BUSY TIMES: Hourly Distribution & Clinical Time Slots
  const busyHours = useMemo(() => {
    // 8:00 AM to 10:00 PM (hour 8 to 22)
    const hourSlots: Array<{ hour: number, label: string, count: number }> = []
    for (let h = 8; h <= 22; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM'
      const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
      hourSlots.push({
        hour: h,
        label: `${displayHour}:00 ${ampm}`,
        count: 0
      })
    }

    // Shifts
    const shifts = {
      morning: { label: 'Morning (08:00 - 12:00)', count: 0, icon: '🌅' },
      afternoon: { label: 'Afternoon (12:00 - 16:00)', count: 0, icon: '☀️' },
      evening: { label: 'Evening Peak (16:00 - 20:00)', count: 0, icon: '🌆' },
      night: { label: 'Night (20:00 - 23:00)', count: 0, icon: '🌙' },
    }

    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const date = new Date(a.scheduled_time || a.created_at)
      const h = date.getHours()

      const slot = hourSlots.find(s => s.hour === h)
      if (slot) slot.count += 1

      if (h >= 8 && h < 12) shifts.morning.count += 1
      else if (h >= 12 && h < 16) shifts.afternoon.count += 1
      else if (h >= 16 && h < 20) shifts.evening.count += 1
      else if (h >= 20 && h <= 23) shifts.night.count += 1
    })

    const maxHourCount = Math.max(...hourSlots.map(s => s.count), 1)
    const peakHour = [...hourSlots].sort((a, b) => b.count - a.count)[0]
    const peakShift = Object.entries(shifts).sort((a, b) => b[1].count - a[1].count)[0]

    return { hourSlots, shifts, maxHourCount, peakHour, peakShift: peakShift ? peakShift[1] : null }
  }, [filteredAppointments])

  // TOP / FREQUENT PATIENTS
  const topPatients = useMemo(() => {
    const map = new Map<string, {
      name: string
      phone?: string | null
      is_manual: boolean
      visitsCount: number
      totalSpend: number
      lastVisit: string
    }>()

    filteredAppointments.forEach(a => {
      if (a.status === 'cancelled') return
      const key = a.patient_id || a.manual_patient_id || a.patient_name
      const existing = map.get(key) || {
        name: a.patient_name,
        phone: a.patient_phone,
        is_manual: !!a.is_manual,
        visitsCount: 0,
        totalSpend: 0,
        lastVisit: a.scheduled_time || a.created_at
      }

      existing.visitsCount += 1
      existing.totalSpend += a.fees
      if (new Date(a.scheduled_time || a.created_at) > new Date(existing.lastVisit)) {
        existing.lastVisit = a.scheduled_time || a.created_at
      }

      map.set(key, existing)
    })

    return Array.from(map.values())
      .sort((a, b) => b.visitsCount - a.visitsCount || b.totalSpend - a.totalSpend)
      .slice(0, 15) // Top 15 frequent patients
  }, [filteredAppointments])

  // Export CSV
  const handleExportCSV = () => {
    if (filteredAppointments.length === 0) {
      alert('No appointments found for the selected period.')
      return
    }

    const headers = ['Appointment ID', 'Date & Time', 'Patient Name', 'Phone', 'Type', 'Fee (EGP)', 'Status', 'Payment Status', 'Notes']
    const rows = [
      headers.join(','),
      ...filteredAppointments.map(a => [
        `"${a.id}"`,
        `"${new Date(a.scheduled_time || a.created_at).toLocaleString()}"`,
        `"${a.patient_name.replace(/"/g, '""')}"`,
        `"${a.patient_phone || ''}"`,
        `"${a.appointment_type}"`,
        a.fees,
        `"${a.status}"`,
        `"${a.payment_status}"`,
        `"${(a.notes || '').replace(/"/g, '""')}"`
      ].join(','))
    ]

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `doctor_report_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  // Print Summary
  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-500 font-bold">Computing clinical statistics & earnings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-xl">📈</span>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Doctor Performance, Earnings & Patient Reports</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Analyze your clinic revenue, patient traffic patterns, retention rates, and peak consultation hours.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAppointments}
            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-all"
            title="Refresh"
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

      {/* FILTER TOOLBAR */}
      <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4 print:hidden">
        {/* Date presets */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black uppercase tracking-wider text-gray-400 mr-2">Timeframe:</span>
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

        {/* Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Visit Type</label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="all">All Visit Types</option>
              <option value="clinic_normal">Clinic Normal</option>
              <option value="clinic_urgent">Clinic Urgent</option>
              <option value="home_visit">Home Visit</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Payment Status</label>
            <select
              value={selectedPaymentStatus}
              onChange={e => setSelectedPaymentStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses (Paid + Pending)</option>
              <option value="paid">Paid Only</option>
              <option value="pending">Pending Payment</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">Search Patient / Notes</label>
            <input
              type="text"
              placeholder="Search by patient name, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Money Made */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-white to-teal-500/10 dark:from-emerald-950/20 dark:via-gray-900 dark:to-teal-950/20 p-6 rounded-3xl border border-emerald-200 dark:border-emerald-800/50 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Total Money Made</span>
            <span className="text-xl">💰</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {metrics.totalMoneyMade.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-gray-400">EGP</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-emerald-600">{metrics.paidFees.toLocaleString()} EGP Collected</span>
            {metrics.pendingFees > 0 && (
              <span className="text-amber-600 font-bold">{metrics.pendingFees.toLocaleString()} EGP Pending</span>
            )}
          </div>
        </div>

        {/* Card 2: Patients Seen */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Patient Visits</span>
            <span className="text-xl">👥</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {metrics.totalVisits}
            </span>
            <span className="text-xs font-bold text-gray-400">Consultations</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>{metrics.uniquePatientsCount} Unique Patients</span>
            <span>Avg {metrics.avgFee} EGP / Visit</span>
          </div>
        </div>

        {/* Card 3: Patient Retention */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">Patient Loyalty</span>
            <span className="text-xl">🔄</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {metrics.retentionRate}%
            </span>
            <span className="text-xs font-bold text-purple-600 font-black">Returning</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span>{metrics.returningPatientsCount} Repeat Visitors</span>
            <span>{metrics.newPatientsCount} First-Timers</span>
          </div>
        </div>

        {/* Card 4: Peak Activity Snapshot */}
        <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Peak Congestion</span>
            <span className="text-xl">⚡</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-gray-900 dark:text-white truncate">
              {busyDays.peakDay ? busyDays.peakDay.name : 'N/A'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-amber-600 font-black">
              {busyHours.peakShift ? busyHours.peakShift.label.split(' ')[0] : 'Peak Shift'}
            </span>
            <span>{busyDays.peakDay ? `${busyDays.peakDay.count} visits` : ''}</span>
          </div>
        </div>
      </div>

      {/* SUB-TABS */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2 print:hidden">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'overview'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Earnings & Visit Breakdown
        </button>
        <button
          onClick={() => setActiveSubTab('busyTimes')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'busyTimes'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Peak & Busy Times Analysis ⏰
        </button>
        <button
          onClick={() => setActiveSubTab('patients')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'patients'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Frequent Patients ({topPatients.length})
        </button>
        <button
          onClick={() => setActiveSubTab('visits')}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${
            activeSubTab === 'visits'
              ? 'bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Consultation Visit Log ({filteredAppointments.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & VISIT TYPE BREAKDOWN */}
      {(activeSubTab === 'overview' || typeof window !== 'undefined') && (
        <div className={`space-y-6 ${activeSubTab !== 'overview' ? 'hidden print:block' : ''}`}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visit Types breakdown card */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">Earnings by Visit Type</h3>
                  <p className="text-xs text-gray-500">Distribution of revenue across normal clinic visits, urgent visits, and home visits</p>
                </div>
                <span className="text-xs font-black px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-full">
                  {metrics.totalMoneyMade.toLocaleString()} EGP Total
                </span>
              </div>

              <div className="space-y-4">
                {Object.entries(typeBreakdown).map(([key, item]) => {
                  const share = metrics.totalMoneyMade > 0 ? Math.round((item.revenue / metrics.totalMoneyMade) * 100) : 0
                  return (
                    <div key={key} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${item.dot}`}></span>
                          <span className="font-black text-sm text-gray-900 dark:text-white">{item.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-gray-900 dark:text-white">{item.revenue.toLocaleString()} EGP</span>
                          <span className="text-xs text-gray-400 block">{item.count} Consultations ({share}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`bg-gradient-to-r ${item.color} h-full rounded-full transition-all duration-700`}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Visit Status & Efficiency */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white mb-1">Appointment Efficiency</h3>
                <p className="text-xs text-gray-500 mb-6">Fulfillment and attendance rates</p>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Completed Visits</span>
                    <span className="font-black text-emerald-600">{metrics.completedVisits} ({metrics.completionRate}%)</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Cancelled / Rejected</span>
                    <span className="font-black text-red-600">{metrics.cancelledVisits}</span>
                  </div>
                  <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-2xl">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Paid Fees Ratio</span>
                    <span className="font-black text-blue-600">
                      {metrics.totalMoneyMade > 0 ? Math.round((metrics.paidFees / metrics.totalMoneyMade) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300">
                <strong>Tip:</strong> Enabling Auto-Confirm in your settings speeds up booking approvals during busy clinic shifts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BUSY TIMES & PEAK HOURS ANALYSIS */}
      {(activeSubTab === 'busyTimes' || typeof window !== 'undefined') && (
        <div className={`space-y-6 ${activeSubTab !== 'busyTimes' ? 'hidden print:block' : ''}`}>
          {/* Day of Week Distribution */}
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">Busiest Days of the Week</h3>
                <p className="text-xs text-gray-500">Patient traffic distribution across days to plan your clinic days and staffing</p>
              </div>
              {busyDays.peakDay && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-black">
                  🔥 Peak Day: {busyDays.peakDay.name} ({busyDays.peakDay.count} visits)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {busyDays.days.map(d => {
                const heightPct = Math.round((d.count / busyDays.maxDayCount) * 100)
                const isPeak = busyDays.peakDay && busyDays.peakDay.name === d.name && d.count > 0
                return (
                  <div
                    key={d.name}
                    className={`p-4 rounded-2xl border flex flex-col items-center justify-between text-center transition-all ${
                      isPeak 
                        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 shadow-sm ring-2 ring-amber-400/30' 
                        : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800'
                    }`}
                  >
                    <span className="text-xs font-black text-gray-600 dark:text-gray-300 uppercase mb-2">
                      {d.name.slice(0, 3)}
                    </span>

                    {/* Bar visualization */}
                    <div className="w-8 bg-gray-200 dark:bg-gray-700 h-28 rounded-full overflow-hidden flex flex-col justify-end p-1 my-2">
                      <div
                        className={`w-full rounded-full transition-all duration-700 ${
                          isPeak ? 'bg-gradient-to-t from-amber-500 to-amber-400' : 'bg-gradient-to-t from-[var(--color-ml-blue)] to-[var(--color-ml-green)]'
                        }`}
                        style={{ height: `${Math.max(heightPct, 6)}%` }}
                      />
                    </div>

                    <div className="mt-1">
                      <span className="text-sm font-black text-gray-900 dark:text-white block">{d.count}</span>
                      <span className="text-[10px] font-bold text-gray-400 block">{d.revenue.toLocaleString()} EGP</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hourly Distribution & Clinical Shifts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Clinical Shift breakdown */}
            <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white">Busiest Time Windows</h3>
                <p className="text-xs text-gray-500">Distribution by clinic shifts</p>
              </div>

              <div className="space-y-3">
                {Object.entries(busyHours.shifts).map(([key, shift]) => {
                  const total = metrics.totalVisits || 1
                  const share = Math.round((shift.count / total) * 100)
                  return (
                    <div key={key} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{shift.icon}</span>
                          <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{shift.label}</span>
                        </div>
                        <span className="font-black text-sm text-gray-900 dark:text-white">{shift.count} ({share}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
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

            {/* Hourly breakdown chart */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">Hourly Examination Heatmap</h3>
                  <p className="text-xs text-gray-500">Congestion by hour between 8:00 AM and 10:00 PM</p>
                </div>
                {busyHours.peakHour && busyHours.peakHour.count > 0 && (
                  <span className="text-xs font-black px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                    Peak: {busyHours.peakHour.label} ({busyHours.peakHour.count} visits)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto pb-2">
                <div className="min-w-[600px] h-48 flex items-end gap-2 pt-6">
                  {busyHours.hourSlots.map(slot => {
                    const heightPct = Math.round((slot.count / busyHours.maxHourCount) * 100)
                    const isPeak = busyHours.peakHour && busyHours.peakHour.hour === slot.hour && slot.count > 0
                    return (
                      <div key={slot.hour} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                        {/* Tooltip on hover */}
                        <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow pointer-events-none whitespace-nowrap z-10">
                          {slot.count} visits at {slot.label}
                        </div>

                        <span className="text-[10px] font-black text-gray-700 dark:text-gray-300 mb-1">
                          {slot.count > 0 ? slot.count : ''}
                        </span>

                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-t-lg overflow-hidden flex flex-col justify-end h-32">
                          <div
                            className={`w-full rounded-t-lg transition-all duration-700 ${
                              isPeak ? 'bg-amber-500' : 'bg-gradient-to-t from-[var(--color-ml-blue)] to-[var(--color-ml-green)]'
                            }`}
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                          />
                        </div>

                        <span className="text-[9px] font-bold text-gray-400 mt-2 rotate-45 origin-left whitespace-nowrap">
                          {slot.label.split(' ')[0]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TOP / FREQUENT PATIENTS REPORT */}
      {(activeSubTab === 'patients' || typeof window !== 'undefined') && (
        <div className={`space-y-4 ${activeSubTab !== 'patients' ? 'hidden print:block' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Frequent Patients & Follow-Up Registry</h3>
                <p className="text-xs text-gray-500">Patients who consult with you most often and their lifetime spend</p>
              </div>
              <span className="text-xs font-bold text-gray-400">{topPatients.length} Top Patients</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-6 py-4">Patient Name</th>
                    <th className="px-6 py-4">Contact Phone</th>
                    <th className="px-6 py-4">Total Visits</th>
                    <th className="px-6 py-4">Total Paid (EGP)</th>
                    <th className="px-6 py-4">Last Consultation</th>
                    <th className="px-6 py-4">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {topPatients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">No patients found for this period.</td>
                    </tr>
                  ) : (
                    topPatients.map((p, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-6 py-4 font-black text-gray-900 dark:text-white">
                          {p.name}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-500">
                          {p.phone || 'No phone recorded'}
                        </td>
                        <td className="px-6 py-4 font-black text-blue-600 dark:text-blue-400">
                          {p.visitsCount} visits
                        </td>
                        <td className="px-6 py-4 font-black text-emerald-600">
                          {p.totalSpend.toLocaleString()} EGP
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {new Date(p.lastVisit).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            p.is_manual ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30'
                          }`}>
                            {p.is_manual ? 'Offline Walk-In' : 'Registered App User'}
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

      {/* TAB 4: CONSULTATION VISIT LOG */}
      {(activeSubTab === 'visits' || typeof window !== 'undefined') && (
        <div className={`space-y-4 ${activeSubTab !== 'visits' ? 'hidden print:block' : ''}`}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">Detailed Visit History</h3>
                <p className="text-xs text-gray-500">Individual appointment records, fees, and completion statuses</p>
              </div>
              <span className="text-xs font-bold text-gray-500">{filteredAppointments.length} Appointments</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  <tr>
                    <th className="px-6 py-4">Date & Time</th>
                    <th className="px-6 py-4">Patient Name</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Fee (EGP)</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">No appointments match your filters.</td>
                    </tr>
                  ) : (
                    filteredAppointments.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          {new Date(a.scheduled_time || a.created_at).toLocaleDateString()} {new Date(a.scheduled_time || a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </td>
                        <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                          {a.patient_name}
                          {a.is_manual && <span className="ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Walk-in</span>}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-gray-600 dark:text-gray-300">
                          {a.appointment_type.replace('_', ' ').toUpperCase()}
                        </td>
                        <td className="px-6 py-4 font-black text-gray-900 dark:text-white">
                          {a.fees.toLocaleString()} EGP
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            a.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            a.status === 'scheduled' || a.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            a.status === 'waiting' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {a.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            a.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {a.payment_status}
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
    </div>
  )
}
