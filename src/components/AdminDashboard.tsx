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

      // 2. Fetch Doctor Roster
      const { data: docs } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone_number')
        .eq('role', 'doctor')
      
      if (docs) setDoctors(docs)
      setLoading(false)
    }

    fetchData()
  }, [])

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      
      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Patients', value: stats.totalPatients, trend: 'Active' },
          { label: 'Active Doctors', value: stats.activeDoctors, trend: 'Verified' },
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
        
        {/* Doctor Management */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold">Clinical Doctor Roster</h3>
            <button className="text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium transition-colors">
              + Invite Doctor
            </button>
          </div>
          <div className="space-y-3">
            {doctors.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                    {doc.full_name?.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{doc.full_name}</p>
                    <p className="text-xs text-gray-500">{doc.email} • {doc.phone_number || 'No Phone'}</p>
                  </div>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                </button>
              </div>
            ))}
            {doctors.length === 0 && <p className="text-gray-500 text-sm italic">No doctors registered yet.</p>}
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
