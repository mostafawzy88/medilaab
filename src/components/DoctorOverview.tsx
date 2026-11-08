'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'

type Appointment = {
  id: string
  patient_id: string | null
  manual_patient_id?: string | null
  scheduled_time: string
  status: 'scheduled' | 'waiting' | 'in_progress' | 'completed' | 'cancelled' | 'proposed'
  queue_position: number
  appointment_type?: string
  fees?: number
  payment_status?: string
  notes?: string | null
  patient: { full_name: string; phone_number?: string | null } | null
  manual_patient?: { full_name: string; phone_number?: string | null } | null
}

export default function DoctorOverview({
  doctorId,
  doctorName,
  activeQueue,
  homeVisits,
  requests,
  todayAppointments,
  onCallNext,
  onApprove,
  onReject,
  onComplete,
  onSwitchTab,
  autoConfirm,
  onToggleAutoConfirm
}: {
  doctorId: string
  doctorName?: string
  activeQueue: Appointment[]
  homeVisits: Appointment[]
  requests: Appointment[]
  todayAppointments: Appointment[]
  onCallNext: (appointmentId: string, patientName: string) => void
  onApprove: (appointmentId: string) => void
  onReject: (appointmentId: string) => void
  onComplete: (appointmentId: string) => void
  onSwitchTab: (tab: string) => void
  autoConfirm: boolean
  onToggleAutoConfirm: () => void
}) {
  const t = useTranslations('Dashboard')
  const locale = useLocale()

  const todayStr = new Date().toISOString().split('T')[0]

  // Filter today's specific subsets
  const todayClinicVisits = activeQueue.filter(a => a.scheduled_time?.startsWith(todayStr))
  const todayHomeVisits = homeVisits.filter(a => a.scheduled_time?.startsWith(todayStr))
  
  // Find currently active consultation
  const activeConsultation = activeQueue.find(a => a.status === 'in_progress')
  
  // Count arrived patients in waiting room
  const arrivedPatients = todayClinicVisits.filter(a => a.notes?.includes('[ARRIVED:'))
  
  // Calculate today's expected and collected earnings
  const todayExpectedRevenue = todayAppointments.reduce((acc, a) => acc + (Number(a.fees) || 0), 0)
  const todayPaidRevenue = todayAppointments
    .filter(a => a.payment_status === 'paid')
    .reduce((acc, a) => acc + (Number(a.fees) || 0), 0)

  const parseArrivalTime = (notes?: string | null) => {
    if (!notes) return null
    const match = notes.match(/\[ARRIVED:\s*([^\]]+)\]/)
    if (match && match[1]) {
      try {
        return new Date(match[1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      } catch {
        return null
      }
    }
    return null
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 1. Hero & Live Status Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[var(--color-ml-navy)] via-[#1E163B] to-[var(--color-ml-navy)] p-6 sm:p-8 text-white border border-[var(--color-ml-navy-light)] shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="px-3 py-1 bg-white/10 text-white/90 rounded-full text-xs font-black tracking-wider uppercase backdrop-blur-md border border-white/10">
                👨‍⚕️ {locale === 'ar' ? 'لوحة قيادة الطبيب اليومية' : "Doctor's Daily Hub"}
              </span>
              <span className="text-xs text-gray-300 font-medium">
                📅 {new Date().toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              {locale === 'ar' ? `مرحباً د. ${doctorName || ''}` : `Welcome back, Dr. ${doctorName || ''}`}
            </h1>
            <p className="text-gray-300 text-sm mt-1 max-w-xl">
              {locale === 'ar' 
                ? 'إليك ملخص مهامك وجدولك اليوم: العيادة الخارجية والزيارات المنزلية والطلبات المعلقة.'
                : "Here is your operational snapshot for today: clinic waiting room, house call tasks, and pending requests."}
            </p>
          </div>

          {/* Quick Auto-Confirm & Live Indicator */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
            <div className="text-right sm:text-left">
              <p className="text-xs font-black text-gray-300 uppercase tracking-wider">
                {locale === 'ar' ? 'الموافقة التلقائية' : 'Auto-Confirm'}
              </p>
              <p className="text-[11px] text-gray-400">
                {autoConfirm 
                  ? (locale === 'ar' ? 'مفعلة للحجوزات' : 'Auto-approving slots') 
                  : (locale === 'ar' ? 'يدوية عبر الطلبات' : 'Manual approval mode')}
              </p>
            </div>
            <button 
              onClick={onToggleAutoConfirm}
              className={`relative w-12 h-7 rounded-full transition-colors ${autoConfirm ? 'bg-emerald-500' : 'bg-gray-600'}`}
              title="Toggle Auto-Confirmation of Appointments"
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${autoConfirm ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Clinic Operational Status Pill */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${activeConsultation ? 'bg-emerald-400' : 'bg-blue-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${activeConsultation ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-200">
              {activeConsultation ? (
                <>
                  <span className="text-emerald-400 font-black">{locale === 'ar' ? 'جلسة كشف جارية الآن:' : 'Currently Consulting:'}</span>{' '}
                  <span className="underline decoration-emerald-500/50">{activeConsultation.patient?.full_name || activeConsultation.manual_patient?.full_name}</span>{' '}
                  <span className="text-xs text-gray-400">(Q{activeConsultation.queue_position})</span>
                </>
              ) : todayClinicVisits.length > 0 ? (
                <>
                  <span className="text-blue-400 font-black">{locale === 'ar' ? 'العيادة جاهزة للمريض التالي:' : 'Clinic Ready:'}</span>{' '}
                  <span>{todayClinicVisits.length} {locale === 'ar' ? 'مرضى في طابور اليوم' : 'clinic patients scheduled'}</span>
                  {arrivedPatients.length > 0 && (
                    <span className="text-emerald-400 font-bold ml-2">({arrivedPatients.length} {locale === 'ar' ? 'وصلوا للعيادة' : 'in waiting room'})</span>
                  )}
                </>
              ) : (
                <span className="text-gray-400">{locale === 'ar' ? 'لا توجد كشوفات جارية حالياً في العيادة' : 'No active clinic consultation at this moment'}</span>
              )}
            </span>
          </div>

          {todayClinicVisits.length > 0 && !activeConsultation && (
            <button
              onClick={() => {
                const next = todayClinicVisits[0]
                if (next) onCallNext(next.id, next.patient?.full_name || next.manual_patient?.full_name || 'Patient')
              }}
              className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-95 text-white font-black text-xs px-4 py-2 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <span>🔔</span>
              <span>{locale === 'ar' ? 'مناداة المريض التالي' : 'Call Next Patient'} (Q{todayClinicVisits[0]?.queue_position || 1})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Interactive Metric Cards (All Clickable to Direct Tabs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Clinic Queue */}
        <div 
          onClick={() => onSwitchTab('queue')}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                👥
              </span>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                {locale === 'ar' ? 'الطابور' : 'Queue'} →
              </span>
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              {locale === 'ar' ? 'طابور العيادة بالخارج' : "Today's Waiting Room"}
            </p>
            <h3 className="text-3xl font-black mt-1 text-gray-900 dark:text-white">
              {todayClinicVisits.length}
            </h3>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500">
              <span className="text-emerald-600 font-bold">📍 {arrivedPatients.length} {locale === 'ar' ? 'بالانتظار' : 'arrived'}</span>
              <span>•</span>
              <span>{todayClinicVisits.length - arrivedPatients.length} {locale === 'ar' ? 'في الطريق' : 'scheduled'}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-blue-600 flex items-center justify-between">
            <span>{activeConsultation ? 'Active visit in progress' : 'Next: Q' + (todayClinicVisits[0]?.queue_position || '1')}</span>
            <span>Manage Queue ↗</span>
          </div>
        </div>

        {/* Card 2: Home Visits Task Hub (CRITICAL FOCUS) */}
        <div 
          onClick={() => onSwitchTab('schedule')}
          className={`rounded-3xl p-6 border shadow-sm hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between ${
            todayHomeVisits.length > 0 
              ? 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-200 dark:border-amber-800/60' 
              : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'
          }`}
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                🏠
              </span>
              <span className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                {locale === 'ar' ? 'الجدول' : 'Schedule'} →
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-gray-400">
                {locale === 'ar' ? 'زيارات منزلية اليوم' : 'Home Visits Today'}
              </p>
              {todayHomeVisits.length > 0 && (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-md animate-pulse">
                  Task
                </span>
              )}
            </div>
            <h3 className="text-3xl font-black mt-1 text-gray-900 dark:text-white">
              {todayHomeVisits.length}
            </h3>
            <p className="mt-2 text-xs font-bold text-gray-500">
              {todayHomeVisits.length > 0 
                ? (locale === 'ar' ? `${todayHomeVisits.length} مهام زيارة بالخارج` : `${todayHomeVisits.length} house calls to complete`) 
                : (locale === 'ar' ? 'لا توجد زيارات منزلية اليوم' : 'No house calls today')}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-amber-600 flex items-center justify-between">
            <span>{todayHomeVisits.length > 0 ? `${todayHomeVisits[0]?.patient?.full_name || 'Patient'} scheduled` : 'Clinic only day'}</span>
            <span>View Tasks ↗</span>
          </div>
        </div>

        {/* Card 3: Pending Booking Requests */}
        <div 
          onClick={() => onSwitchTab('requests')}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-purple-500/30 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                📥
              </span>
              <span className="text-xs font-black text-purple-600 dark:text-purple-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                {locale === 'ar' ? 'الطلبات' : 'Requests'} →
              </span>
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              {locale === 'ar' ? 'طلبات بحاجة لموافقة' : 'Pending Requests'}
            </p>
            <h3 className="text-3xl font-black mt-1 text-gray-900 dark:text-white">
              {requests.length}
            </h3>
            <p className="mt-2 text-xs font-bold text-gray-500">
              {requests.length > 0 
                ? (locale === 'ar' ? `${requests.length} طلبات جديدة تنتظر قرارك` : `${requests.length} bookings waiting for review`) 
                : (locale === 'ar' ? 'كل الطلبات تمت مراجعتها' : 'All requests reviewed')}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-purple-600 flex items-center justify-between">
            <span>{requests.length > 0 ? 'Requires action' : 'Zero backlog'}</span>
            <span>Review Now ↗</span>
          </div>
        </div>

        {/* Card 4: Financial Summary */}
        <div 
          onClick={() => onSwitchTab('stats')}
          className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-emerald-500/30 transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                💰
              </span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                {locale === 'ar' ? 'التقارير' : 'Reports'} →
              </span>
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              {locale === 'ar' ? 'إجمالي دخل اليوم المتوقع' : "Today's Revenue Snapshot"}
            </p>
            <h3 className="text-3xl font-black mt-1 text-gray-900 dark:text-white">
              {todayExpectedRevenue} <span className="text-sm font-bold text-gray-400">EGP</span>
            </h3>
            <div className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500">
              <span className="text-emerald-600 font-bold">{todayPaidRevenue} EGP Paid</span>
              <span>•</span>
              <span className="text-amber-600">{todayExpectedRevenue - todayPaidRevenue} EGP Pending</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 text-[11px] font-bold text-emerald-600 flex items-center justify-between">
            <span>Detailed Breakdown</span>
            <span>View Reports ↗</span>
          </div>
        </div>

      </div>

      {/* 3. Section: Tasks for the Day Ahead */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Column A: Home Visits Action Center (KEY REQUIREMENT) */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-7 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center text-xl">
                🏠
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 dark:text-white">
                  {locale === 'ar' ? 'مهام الزيارات المنزلية اليوم' : 'Home Visit Tasks Ahead'}
                </h3>
                <p className="text-xs text-gray-400">
                  {locale === 'ar' ? 'قائمة الزيارات المنزلية المجدولة مع عناوين المرضى وهواتفهم' : 'House calls scheduled with patient phone and details'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => onSwitchTab('schedule')}
              className="text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800"
            >
              {locale === 'ar' ? 'عرض بالجدول' : 'In Schedule →'}
            </button>
          </div>

          {todayHomeVisits.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-4xl">🏡</div>
              <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">
                {locale === 'ar' ? 'لا توجد زيارات منزلية لليوم' : 'No Home Visits Scheduled for Today'}
              </p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                {locale === 'ar' 
                  ? 'جميع مواعيدك اليوم داخل العيادة فقط. عندما يطلب مريض زيارة منزلية ويتم اعتمادها ستظهر هنا كمهام خارجية.'
                  : 'All your appointments today are clinic-based. When patients book home visits, they will appear here as external tasks.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayHomeVisits.map((visit) => {
                const phone = visit.patient?.phone_number || visit.manual_patient?.phone_number
                return (
                  <div 
                    key={visit.id}
                    className="p-4 rounded-2xl border-2 border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col gap-3 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-base text-gray-900 dark:text-white">
                            {visit.patient?.full_name || visit.manual_patient?.full_name}
                          </span>
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                            Home Visit
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                          <span>🕒 {new Date(visit.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span>💰 {visit.fees} EGP</span>
                          <span className={`font-bold ${visit.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                            ({visit.payment_status === 'paid' ? 'Paid' : 'Unpaid'})
                          </span>
                        </p>
                      </div>

                      <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                        visit.status === 'completed' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {visit.status === 'completed' ? 'Completed' : 'Scheduled'}
                      </span>
                    </div>

                    {/* Patient Phone & Contact Bar */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                      {phone ? (
                        <a 
                          href={`tel:${phone}`}
                          className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1.5"
                        >
                          <span>📞</span>
                          <span>{phone}</span>
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No phone provided</span>
                      )}

                      <div className="flex items-center gap-2">
                        {visit.status !== 'completed' && (
                          <button
                            onClick={() => onComplete(visit.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-1.5 rounded-xl shadow-sm transition-all"
                          >
                            ✓ Mark Done
                          </button>
                        )}
                        <button
                          onClick={() => onSwitchTab('schedule')}
                          className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-bold px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700"
                        >
                          Schedule View
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Column B: Live Clinic Waiting Room Stream (Excludes Home Visits) */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-7 border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 flex items-center justify-center text-xl">
                📋
              </div>
              <div>
                <h3 className="font-black text-base text-gray-900 dark:text-white">
                  {locale === 'ar' ? 'غرفة انتظار العيادة المباشرة' : 'Physical Clinic Waiting Room'}
                </h3>
                <p className="text-xs text-gray-400">
                  {locale === 'ar' ? 'المرضى المنتظرون بالخارج (الزيارات المنزلية مستثناة)' : 'Patients waiting outside (house calls excluded)'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => onSwitchTab('queue')}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800"
            >
              {locale === 'ar' ? 'فتح الطابور الكامل' : 'Full Queue →'}
            </button>
          </div>

          {todayClinicVisits.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-4xl">🛋️</div>
              <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">
                {locale === 'ar' ? 'صالة الانتظار فارغة حالياً' : 'Waiting Room is Currently Empty'}
              </p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                {locale === 'ar' 
                  ? 'لا يوجد مرضى عيادة في طابور اليوم حتى الآن.'
                  : 'No patients in the physical waiting room for today yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayClinicVisits.slice(0, 4).map((apt, idx) => {
                const arrivalTime = parseArrivalTime(apt.notes)
                const isArrived = !!arrivalTime
                const isInProgress = apt.status === 'in_progress'

                return (
                  <div 
                    key={apt.id}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                      isInProgress 
                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' 
                        : isArrived 
                          ? 'border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20' 
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${
                        isInProgress 
                          ? 'bg-emerald-600 text-white' 
                          : isArrived 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        Q{apt.queue_position || (idx + 1)}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-gray-900 dark:text-white">
                            {apt.patient?.full_name || apt.manual_patient?.full_name}
                          </p>
                          {isArrived && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Arrived at {arrivalTime}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          🕒 {new Date(apt.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {(apt.appointment_type || 'clinic_normal').replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isInProgress ? (
                        <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs font-black rounded-xl">
                          In Room
                        </span>
                      ) : (
                        <button
                          onClick={() => onCallNext(apt.id, apt.patient?.full_name || apt.manual_patient?.full_name || 'Patient')}
                          className="bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] hover:opacity-90 text-white text-xs font-black px-3.5 py-2 rounded-xl shadow-sm transition-all"
                        >
                          Call Next
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {todayClinicVisits.length > 4 && (
                <button
                  onClick={() => onSwitchTab('queue')}
                  className="w-full py-2.5 text-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  +{todayClinicVisits.length - 4} more patients waiting in queue →
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      {/* 4. Pending Booking Requests Stream (Quick Decisions) */}
      {requests.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 sm:p-7 border border-purple-100 dark:border-purple-900/40 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800 mb-5">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center text-xl">
                📥
              </span>
              <div>
                <h3 className="font-black text-base text-gray-900 dark:text-white">
                  {locale === 'ar' ? 'طلبات حجز معلقة بحاجة لموافقة سريعة' : 'Pending Requests Awaiting Decision'}
                </h3>
                <p className="text-xs text-gray-400">
                  {locale === 'ar' ? 'يمكنك الموافقة أو الرفض فوراً من هذه البطاقة' : 'Approve or reject bookings directly from your home overview'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => onSwitchTab('requests')}
              className="text-xs font-bold text-purple-600 hover:text-purple-700 bg-purple-50 dark:bg-purple-900/30 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800"
            >
              {locale === 'ar' ? 'عرض كل الطلبات' : 'All Requests →'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.slice(0, 4).map((req) => (
              <div 
                key={req.id}
                className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">
                      {req.patient?.full_name || req.manual_patient?.full_name}
                    </p>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                      req.appointment_type === 'home_visit' 
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' 
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                    }`}>
                      {req.appointment_type === 'home_visit' ? '🏠 Home Visit' : '🏥 Clinic'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    📅 {new Date(req.scheduled_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • 💰 {req.fees || 350} EGP
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onApprove(req.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3 py-2 rounded-xl transition-all shadow-sm"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => onReject(req.id)}
                    className="bg-white dark:bg-gray-800 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-2 rounded-xl border border-red-200 dark:border-red-900 transition-all"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Quick Doctor Action Bar */}
      <div className="flex items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 to-teal-50/80 dark:from-blue-950/20 dark:to-teal-950/20 border border-blue-100 dark:border-blue-900/30 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <p className="font-black text-sm text-gray-900 dark:text-white">
              {locale === 'ar' ? 'روابط سريعة لأدوات العيادة' : 'Quick Actions & Clinic Controls'}
            </p>
            <p className="text-xs text-gray-500">
              {locale === 'ar' ? 'الوصول بنقرة واحدة لكافة أقسام إدارة العيادة' : 'One-click shortcuts to clinic tools and patient management'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onSwitchTab('schedule')}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-all shadow-sm"
          >
            📅 Schedule Timeline
          </button>
          <button
            onClick={() => onSwitchTab('patients')}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-all shadow-sm"
          >
            👥 Patient Directory
          </button>
          <button
            onClick={() => onSwitchTab('meds')}
            className="px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-all shadow-sm"
          >
            💊 Medication Presets
          </button>
          <button
            onClick={() => onSwitchTab('stats')}
            className="px-4 py-2 bg-gradient-to-r from-[var(--color-ml-blue)] to-[var(--color-ml-green)] text-white text-xs font-black rounded-xl shadow-md transition-all hover:opacity-95"
          >
            📈 Performance & Financials
          </button>
        </div>
      </div>

    </div>
  )
}
