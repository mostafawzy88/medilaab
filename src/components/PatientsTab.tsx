'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'

type Patient = {
  id: string
  full_name: string
  phone_number?: string
  email?: string
  is_manual?: boolean
  last_visit?: string
}

export default function PatientsTab({ doctorId }: { doctorId: string }) {
  const t = useTranslations('Dashboard')
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    const fetchPatients = async () => {
      setLoading(true)
      const supabase = createClient()
      
      // 1. Fetch Manual Patients
      const { data: manualData } = await supabase
        .from('manual_patients')
        .select('*')
        .eq('doctor_id', doctorId)
      
      const manualMapped = (manualData || []).map(p => ({
        id: p.id,
        full_name: p.full_name,
        phone_number: p.phone_number,
        email: p.email,
        is_manual: true
      }))

      // 2. Fetch Unique Registered Patients (via appointments)
      const { data: apptData } = await supabase
        .from('appointments')
        .select(`
          patient_id, 
          patient:profiles!appointments_patient_id_fkey(id, full_name, phone_number, email)
        `)
        .eq('doctor_id', doctorId)
        .not('patient_id', 'is', null)

      const registeredMappedMap = new Map()
      if (apptData) {
        apptData.forEach((a: any) => {
          if (a.patient && !registeredMappedMap.has(a.patient.id)) {
            registeredMappedMap.set(a.patient.id, {
              id: a.patient.id,
              full_name: a.patient.full_name,
              phone_number: a.patient.phone_number,
              email: a.patient.email,
              is_manual: false
            })
          }
        })
      }

      setPatients([...manualMapped, ...Array.from(registeredMappedMap.values())])
      setLoading(false)
    }

    fetchPatients()
  }, [doctorId])

  const filteredPatients = patients.filter(p => 
    p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.phone_number && p.phone_number.includes(searchTerm))
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative flex-1 w-full max-w-md">
          <input 
            type="text" 
            placeholder="Search by name or phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
          />
          <svg className="w-5 h-5 absolute left-3 top-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/10 px-4 py-2 rounded-xl border border-blue-100 dark:border-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold">
          Total: {filteredPatients.length} Patients
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-44 bg-gray-100 dark:bg-gray-800 rounded-3xl"></div>
          ))}
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
          <div className="text-5xl mb-4">👥</div>
          <p className="text-gray-500">No patients found matches your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPatients.map((p) => (
            <div key={p.id} className="bg-white dark:bg-gray-900 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-xl hover:-translate-y-1 transition-all group overflow-hidden relative">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg shadow-lg ${p.is_manual ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
                    {p.full_name.charAt(0)}
                  </div>
                  <div className="max-w-[150px]">
                    <h4 className="font-black text-gray-900 dark:text-white leading-tight truncate">{p.full_name}</h4>
                    <span className={`text-[10px] uppercase font-black tracking-widest ${p.is_manual ? 'text-amber-600' : 'text-blue-600'}`}>
                      {p.is_manual ? 'Offline Patient' : 'Registered User'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-gray-50 dark:border-gray-800">
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span className="opacity-60 text-lg">📞</span>
                  <span className="truncate">{p.phone_number || 'No phone recorded'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span className="opacity-60 text-lg">📧</span>
                  <span className="truncate">{p.email || 'No email recorded'}</span>
                </div>
              </div>

              {!p.is_manual && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" title="Online User"></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
