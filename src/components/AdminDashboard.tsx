'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type AdminStats = {
  totalPatients: number
  activeDoctors: number
  todayRevenue: number
  avgWait: string
}

export default function AdminDashboard() {
  const t = useTranslations('Dashboard')
  const m = useTranslations('Management')
  const [view, setView] = useState<'overview' | 'patients'>('overview')
  const [stats, setStats] = useState<AdminStats>({
    totalPatients: 0,
    activeDoctors: 0,
    todayRevenue: 0,
    avgWait: '0 mins'
  })
  const [doctors, setDoctors] = useState<any[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      
      const { count: patientsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient')
      
      const startOfDay = new Date()
      startOfDay.setHours(0,0,0,0)
      
      const { data: todayApts } = await supabase
        .from('appointments')
        .select('fees')
        .gte('scheduled_time', startOfDay.toISOString())

      const revenue = todayApts?.reduce((acc, curr) => acc + (Number(curr.fees) || 0), 0) || 0
      
      const { data: staff } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, role, is_authorized')
        .in('role', ['doctor', 'nurse'])
        .order('is_authorized', { ascending: true })
      
      if (staff) {
        setDoctors(staff)
        setStats({
          totalPatients: patientsCount || 0,
          activeDoctors: staff.filter(s => s.role === 'doctor' && s.is_authorized).length,
          todayRevenue: revenue,
          avgWait: '12 mins'
        })
      }

      const { data: pts } = await supabase
        .from('profiles')
        .select('id, full_name, phone_number, created_at')
        .eq('role', 'patient')
        .order('created_at', { ascending: false })
      
      if (pts) setPatients(pts)
      setLoading(false)
    }

    fetchData()
  }, [])

  const toggleAuth = async (userId: string, currentStatus: boolean) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ is_authorized: !currentStatus })
      .eq('id', userId)
    
    if (!error) {
      setDoctors(prev => prev.map(staff => staff.id === userId ? { ...staff, is_authorized: !currentStatus } : staff))
    }
  }

  if (loading) return <div className="py-20 text-center animate-pulse text-gray-400 font-medium">Loading medical data...</div>

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      
      {/* Navigation Tabs for Admin */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        <button 
          onClick={() => setView('overview')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${view === 'overview' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
        >
          {m('doctors_title')}
        </button>
        <button 
          onClick={() => setView('patients')}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${view === 'patients' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}
        >
          {m('patients_title')}
        </button>
      </div>

      {view === 'overview' ? (
        <>
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button 
              onClick={() => setView('patients')}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-left hover:scale-[1.02] transition-all group"
            >
              <p className="text-sm font-medium text-gray-500 mb-1 group-hover:text-blue-500 transition-colors uppercase tracking-wider">{m('total_patients')}</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{stats.totalPatients}</span>
                <span className="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">View List</span>
              </div>
            </button>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Active Doctors</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{stats.activeDoctors}</span>
                <span className="text-xs font-bold text-green-500 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">Verified</span>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Today's Revenue</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{stats.todayRevenue} <small className="text-xs">EGP</small></span>
                <span className="text-xs font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded">Live</span>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Avg Wait Time</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{stats.avgWait}</span>
                <span className="text-xs font-bold text-purple-500 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">Stable</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">{m('doctors_title')}</h3>
                <div className="text-[10px] bg-blue-600 text-white px-3 py-1 rounded-full uppercase tracking-tighter font-black">
                  Staff Hub
                </div>
              </div>
              <div className="space-y-3">
                {doctors.map((staff) => (
                  <div key={staff.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    staff.is_authorized 
                      ? 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50' 
                      : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50'
                  }`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                        staff.is_authorized ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {staff.full_name?.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm">{staff.full_name}</p>
                          <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                            staff.role === 'doctor' ? 'bg-blue-600 text-white' : 'bg-teal-600 text-white'
                          }`}>
                            {staff.role}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{staff.phone_number || 'No Phone'}</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => toggleAuth(staff.id, staff.is_authorized)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        staff.is_authorized 
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-red-50 hover:text-red-600' 
                          : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      }`}
                    >
                      {staff.is_authorized ? m('revoke') : m('authorize')}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
              <h3 className="text-lg font-bold mb-6">Clinic Activity</h3>
              <div className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 shrink-0"></div>
                  <div>
                    <p className="font-medium">System Role Migration</p>
                    <p className="text-xs text-gray-500 text-balance">Database schema expanded for clinic locations.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
             <h3 className="text-xl font-bold">{m('patients_title')}</h3>
             <p className="text-sm text-gray-500">Managing all clinic visitors and their registration dates.</p>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-widest text-gray-500">
                  <th className="px-6 py-4">{t('patient_name')}</th>
                  <th className="px-6 py-4">{m('email')}</th>
                  <th className="px-6 py-4">{m('phone')}</th>
                  <th className="px-6 py-4">{m('patient_since')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {patients.map((pt) => (
                  <tr key={pt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs">
                           {pt.full_name?.charAt(0)}
                         </div>
                         <span className="font-bold text-sm tracking-tight">{pt.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">{pt.phone_number || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{pt.phone_number || 'N/A'}</td>
                    <td className="px-6 py-4 text-xs text-gray-400">{new Date(pt.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-gray-400 italic">{m('no_patients')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
