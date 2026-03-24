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
  const [stats, setStats] = useState<AdminStats>({
    totalPatients: 0,
    activeDoctors: 0,
    todayRevenue: 0,
    avgWait: '0 mins'
  })
  const [doctors, setDoctors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      
      // 1. Fetch Stats
      const { count: patientsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient')
      const { count: doctorsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'doctor')
      
      const startOfDay = new Date()
      startOfDay.setHours(0,0,0,0)
      
      const { data: todayApts } = await supabase
        .from('appointments')
        .select('fees')
        .gte('scheduled_time', startOfDay.toISOString())

      const revenue = todayApts?.reduce((acc, curr) => acc + (Number(curr.fees) || 0), 0) || 0
      
      setStats({
        totalPatients: patientsCount || 0,
        activeDoctors: doctorsCount || 0,
        todayRevenue: revenue,
        avgWait: '15 mins' // Mocked avg wait
      })

      // 2. Fetch Clinical Staff (Doctors and Nurses)
      const { data: staff } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone_number, role, is_authorized')
        .in('role', ['doctor', 'nurse'])
        .order('is_authorized', { ascending: true })
      
      if (staff) setDoctors(staff)
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

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Patients', value: stats.totalPatients, trend: 'Active' },
          { label: 'Total CLINIC Staff', value: doctors.length, trend: 'Managed' },
          { label: 'Today\'s Revenue', value: `${stats.todayRevenue} EGP`, trend: '+5%' },
          { label: 'Avg Wait Time', value: stats.avgWait, trend: 'Target' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-500 mb-1">{stat.label}</p>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold">{stat.value}</span>
              <span className="text-sm font-bold text-blue-500">
                {stat.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Staff Management */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold">Clinical Staff Authorization</h3>
            <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-3 py-1 rounded-full uppercase tracking-widest font-bold">
              Verification Center
            </div>
          </div>
          <div className="space-y-3">
            {doctors.map((staff) => (
              <div key={staff.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                staff.is_authorized 
                  ? 'border-gray-100 dark:border-gray-800' 
                  : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/50 shadow-sm shadow-amber-500/5'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                    staff.is_authorized 
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400' 
                      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
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
                    <p className="text-xs text-gray-500">{staff.email} • {staff.phone_number || 'No Phone'}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => toggleAuth(staff.id, staff.is_authorized)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    staff.is_authorized 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-red-50 hover:text-red-600' 
                      : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:scale-105 active:scale-95'
                  }`}
                >
                  {staff.is_authorized ? 'Revoke' : 'Authorize Now'}
                </button>
              </div>
            ))}
            {doctors.length === 0 && <p className="text-gray-500 text-sm italic">No clinical staff awaiting authorization.</p>}
          </div>
        </div>

        {/* System Logs Placeholder (Still relevant in MVP) */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <h3 className="text-lg font-bold mb-6">Recent Activity Logs</h3>
          <div className="space-y-4 text-sm">
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 shrink-0"></div>
              <div>
                <p className="font-medium">New patient registered</p>
                <p className="text-xs text-gray-500">Just now</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"></div>
              <div>
                <p className="font-medium">System Role Migration via SQL</p>
                <p className="text-xs text-gray-500">10 mins ago</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-purple-500 shrink-0"></div>
              <div>
                <p className="font-medium">InstaPay deep-link verified</p>
                <p className="text-xs text-gray-500">1 hour ago</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
