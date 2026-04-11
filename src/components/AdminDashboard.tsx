'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTranslations } from 'next-intl'
import { useSearchParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'

type StaffMember = {
  id: string
  full_name: string
  email: string | null
  phone_number: string | null
  clinic_location?: string | null
  instapay_address?: string | null
  role: string
  is_authorized: boolean
  subscription_status: string | null
  subscription_expires_at: string | null
  supervisor_id: string | null
  created_at: string
}

type AdminSettings = {
  payment_link: string | null
  bank_details: string | null
  instapay_address: string | null
  subscription_prices: Record<string, number>
}

const DURATION_OPTIONS = [
  { value: '1', label: '1 Month' },
  { value: '3', label: '3 Months' },
  { value: '6', label: '6 Months' },
  { value: '12', label: '1 Year' },
  { value: 'custom', label: 'Custom Date' }
]

export default function AdminDashboard() {
  const t = useTranslations('Dashboard')
  const m = useTranslations('Management')
  const searchParams = useSearchParams()
  const router = useRouter()
  const view = searchParams.get('tab') || 'overview'

  const setView = (newTab: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    router.push(`?${params.toString()}`)
  }

  const [clinicStats, setClinicStats] = useState<any>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [patients, setPatients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<AdminSettings>({
    payment_link: null,
    bank_details: null,
    instapay_address: null,
    subscription_prices: { '1': 500, '3': 1200, '6': 2000, '12': 3500 }
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [selectedDuration, setSelectedDuration] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<string | null>(null)

  // Edit Modal States
  const [editUser, setEditUser] = useState<StaffMember | any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [savingUser, setSavingUser] = useState(false)

  // Stats
  const totalPatients = patients.length
  const activeDoctors = staff.filter(s => s.role === 'doctor' && s.is_authorized).length
  const activeNurses = staff.filter(s => s.role === 'nurse' && s.is_authorized).length
  const pendingApproval = staff.filter(s => !s.is_authorized).length

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, clinic_location, instapay_address, role, is_authorized, subscription_status, subscription_expires_at, supervisor_id, created_at')
      .in('role', ['doctor', 'nurse'])
      .order('created_at', { ascending: false })
    
    if (staffData) setStaff(staffData)

    const { data: pts } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, clinic_location, instapay_address, created_at, role')
      .eq('role', 'patient')
      .order('created_at', { ascending: false })
    
    if (pts) setPatients(pts)

    // Fetch admin settings
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('id', 1)
      .single()
    
    if (settingsData) {
      setSettings({
        payment_link: settingsData.payment_link,
        bank_details: settingsData.bank_details,
        instapay_address: settingsData.instapay_address,
        subscription_prices: settingsData.subscription_prices || { '1': 500, '3': 1200, '6': 2000, '12': 3500 }
      })
    }

    setLoading(false)
  }

  const fetchClinicStats = async () => {
    setLoadingStats(true)
    const supabase = createClient()
    const { data: allAppts } = await supabase
      .from('appointments')
      .select('fees, status, appointment_type, doctor_id')
      .neq('status', 'cancelled')
    
    if (allAppts) {
      const totalRevenue = allAppts.reduce((sum, a) => sum + (Number(a.fees) || 0), 0)
      const totalAppts = allAppts.length
      const byType = {
        clinic_normal: allAppts.filter(a => a.appointment_type === 'clinic_normal').length,
        clinic_urgent: allAppts.filter(a => a.appointment_type === 'clinic_urgent').length,
        home_visit: allAppts.filter(a => a.appointment_type === 'home_visit').length,
      }
      
      // Revenue by doctor
      const revByDoc: Record<string, number> = {}
      allAppts.forEach(a => {
        const docName = staff.find(s => s.id === a.doctor_id)?.full_name || 'Unknown'
        revByDoc[docName] = (revByDoc[docName] || 0) + (Number(a.fees) || 0)
      })

      setClinicStats({ totalRevenue, totalAppts, byType, revByDoc })
    }
    setLoadingStats(false)
  }

  useEffect(() => {
    if (view === 'stats') fetchClinicStats()
  }, [view])

  const handleActivate = async (userId: string) => {
    const durOpt = selectedDuration[userId] || '1'
    let expiresAt = new Date()
    
    if (durOpt === 'custom') {
      const customDateStr = editForm?.subscription_expires_at // Use form if open, else prompt
      if (customDateStr) {
        expiresAt = new Date(customDateStr)
      } else {
         const result = prompt("Enter expiry date (YYYY-MM-DD):")
         if (!result) return
         expiresAt = new Date(result)
      }
    } else {
       const months = parseInt(durOpt)
       expiresAt.setMonth(expiresAt.getMonth() + months)
    }

    setProcessing(userId)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      is_authorized: true,
      subscription_status: 'active',
      subscription_expires_at: expiresAt.toISOString()
    }).eq('id', userId)

    if (!error) {
      setStaff((prev: StaffMember[]) => prev.map(s => s.id === userId ? { ...s, is_authorized: true, subscription_status: 'active', subscription_expires_at: expiresAt.toISOString() } : s))
      if (editUser?.id === userId) {
         setEditForm((prev: any) => ({ ...prev, is_authorized: true, subscription_status: 'active', subscription_expires_at: expiresAt.toISOString().split('T')[0] }))
      }
    } else {
      alert('Error: ' + error.message)
    }
    setProcessing(null)
  }

  const handleDisable = async (userId: string) => {
    setProcessing(userId)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      is_authorized: false,
      subscription_status: 'suspended'
    }).eq('id', userId)

    if (!error) {
      setStaff((prev: StaffMember[]) => prev.map(s => s.id === userId ? { ...s, is_authorized: false, subscription_status: 'suspended' } : s))
      if (editUser?.id === userId) {
         setEditForm((prev: any) => ({ ...prev, is_authorized: false, subscription_status: 'suspended' }))
      }
    }
    setProcessing(null)
  }

  const handleSaveUser = async () => {
    if (!editUser) return
    setSavingUser(true)

    // Build update payload dynamically
    const updatePayload: any = {
      full_name: editForm.full_name,
      email: editForm.email,
      phone_number: editForm.phone_number,
      clinic_location: editForm.clinic_location,
      instapay_address: editForm.instapay_address,
      subscription_expires_at: editForm.subscription_expires_at ? new Date(editForm.subscription_expires_at).toISOString() : null,
      supervisor_id: editForm.supervisor_id || null
    }

    const supabase = createClient()
    const { error } = await supabase.from('profiles').update(updatePayload).eq('id', editUser.id)

    if (!error) {
      if (editUser.role === 'patient') {
         setPatients((prev: any[]) => prev.map(p => p.id === editUser.id ? { ...p, ...updatePayload } : p))
      } else {
         setStaff((prev: StaffMember[]) => prev.map(s => s.id === editUser.id ? { ...s, ...updatePayload } : s))
      }
      setEditUser(null) // Close modal
    } else {
      alert("Error saving user: " + error.message)
    }
    setSavingUser(false)
  }

  const openEditModal = (user: any) => {
    setEditUser(user)
    setEditForm({
       ...user,
       subscription_expires_at: user.subscription_expires_at ? new Date(user.subscription_expires_at).toISOString().split('T')[0] : ''
    })
  }

  const handleSendReminder = (member: StaffMember) => {
    const durOpt = selectedDuration[member.id] || '1'
    const price = durOpt === 'custom' ? 'Custom' : settings.subscription_prices[durOpt] || 500
    const paymentInfo = settings.instapay_address 
      ? `InstaPay: ${settings.instapay_address}` 
      : settings.payment_link 
        ? `Payment Link: ${settings.payment_link}`
        : settings.bank_details || 'Contact admin for payment details.'
    
    alert(
      `Payment Reminder for ${member.full_name}:\n\n` +
      `Amount: ${price} EGP\n` +
      `${paymentInfo}\n\n` +
      `(In a future update, this will send an actual notification to the user.)`
    )
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    const supabase = createClient()
    const { error } = await supabase.from('admin_settings').upsert({
      id: 1,
      payment_link: settings.payment_link,
      bank_details: settings.bank_details,
      instapay_address: settings.instapay_address,
      subscription_prices: settings.subscription_prices,
      updated_at: new Date().toISOString()
    })
    if (error) alert('Error saving: ' + error.message)
    else alert('Settings saved successfully!')
    setSavingSettings(false)
  }

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return
    const keys = Object.keys(data[0])
    const csvContent = [
      keys.join(','),
      ...data.map(item => keys.map(k => {
        const val = item[k] === null ? '' : item[k]
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val
      }).join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const getSubStatus = (member: StaffMember) => {
    if (!member.is_authorized) return { label: 'Disabled', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
    if (!member.subscription_expires_at) return { label: 'Active (No Expiry)', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
    const expires = new Date(member.subscription_expires_at)
    const now = new Date()
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000*60*60*24))
    if (daysLeft < 0) return { label: 'Expired', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' }
    if (daysLeft < 7) return { label: `${daysLeft}d left`, color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' }
    return { label: `${daysLeft}d left`, color: 'bg-green-100 text-green-700', dot: 'bg-green-500' }
  }

  if (loading) return <div className="py-20 text-center animate-pulse text-gray-400 font-medium">Loading admin panel...</div>

  // Filter out doctors for nurse assignment dropdown
  const doctorList = staff.filter(s => s.role === 'doctor')

  return (
    <div className="space-y-6">

      {/* ==================== OVERVIEW ==================== */}
      {view === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <button onClick={() => setView('staff')} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-left hover:scale-[1.02] transition-all group">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Active Doctors</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{activeDoctors}</span>
                <span className="text-xs font-bold text-green-500 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded">View Staff →</span>
              </div>
            </button>
            <button onClick={() => setView('staff')} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-left hover:scale-[1.02] transition-all group">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Active Nurses</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{activeNurses}</span>
                <span className="text-xs font-bold text-teal-500 bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded">View →</span>
              </div>
            </button>
            <button onClick={() => setView('patients')} className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-left hover:scale-[1.02] transition-all group">
              <p className="text-sm font-medium text-gray-500 mb-1 uppercase tracking-wider">Total Patients</p>
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold">{totalPatients}</span>
                <span className="text-xs font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">View →</span>
              </div>
            </button>
            {pendingApproval > 0 && (
              <button onClick={() => setView('staff')} className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-6 shadow-sm border border-amber-200 dark:border-amber-800 text-left hover:scale-[1.02] transition-all">
                <p className="text-sm font-medium text-amber-700 mb-1 uppercase tracking-wider">Pending Approval</p>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold text-amber-700">{pendingApproval}</span>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded animate-pulse">Action Needed</span>
                </div>
              </button>
            )}
          </div>

          {/* Quick payment info */}
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-lg font-bold mb-4">Quick Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">InstaPay</p>
                <p className="font-bold">{settings.instapay_address || 'Not set'}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Payment Link</p>
                <p className="font-bold truncate">{settings.payment_link || 'Not set'}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Base Price</p>
                <p className="font-bold">{settings.subscription_prices['1'] || 500} EGP/month</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ==================== STAFF ==================== */}
      {view === 'staff' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">Doctors & Nurses</h3>
            <button onClick={() => exportToCSV(staff, 'staff_list')} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-xs font-bold rounded-lg flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export
            </button>
          </div>

          {staff.length === 0 ? (
            <div className="py-20 text-center text-gray-400 italic bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">No staff members registered yet.</div>
          ) : (
            <div className="space-y-3">
              {staff.map(member => {
                const sub = getSubStatus(member)
                const supervisorName = member.supervisor_id ? staff.find(s => s.id === member.supervisor_id)?.full_name : null
                return (
                  <div key={member.id} className={`bg-white dark:bg-gray-900 rounded-2xl p-5 border shadow-sm ${!member.is_authorized ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10' : 'border-gray-100 dark:border-gray-800'}`}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Info */}
                      <div className="flex items-center gap-4 flex-1 cursor-pointer group" onClick={() => openEditModal(member)}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${member.role === 'doctor' ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'bg-teal-100 dark:bg-teal-900 text-teal-600'}`}>
                          {member.full_name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm group-hover:text-blue-600 transition-colors">{member.full_name}</p>
                            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${member.role === 'doctor' ? 'bg-blue-600 text-white' : 'bg-teal-600 text-white'}`}>{member.role}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${sub.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${sub.dot}`}></span>
                              {sub.label}
                            </span>
                          </div>
                          <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                            <span>{member.email || 'No email'}</span>
                            <span>{member.phone_number || 'No phone'}</span>
                            {supervisorName && <span className="text-teal-600 font-bold">→ Dr. {supervisorName}</span>}
                          </div>
                          {member.subscription_expires_at && (
                            <p className="text-xs text-gray-400 mt-1">Expires: {new Date(member.subscription_expires_at).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={selectedDuration[member.id] || '1'}
                          onChange={e => setSelectedDuration((prev: Record<string, string>) => ({ ...prev, [member.id]: e.target.value }))}
                          className="rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
                        >
                          {DURATION_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label} {opt.value !== 'custom' ? `— ${settings.subscription_prices[opt.value] || '?'} EGP` : ''}
                            </option>
                          ))}
                        </select>

                        {member.is_authorized ? (
                          <button 
                            onClick={() => handleDisable(member.id)}
                            disabled={processing === member.id}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                          >
                            {processing === member.id ? '...' : 'Disable'}
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleActivate(member.id)}
                            disabled={processing === member.id}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50"
                          >
                            {processing === member.id ? '...' : 'Activate'}
                          </button>
                        )}

                        <button 
                          onClick={() => handleSendReminder(member)}
                          className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-600 hover:bg-amber-100 transition-all"
                          title="Send payment reminder"
                        >
                          🔔 Remind
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== PATIENTS ==================== */}
      {view === 'patients' && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-center">
             <div>
               <h3 className="text-xl font-bold">{m('patients_title')}</h3>
               <p className="text-sm text-gray-500">All registered patients.</p>
             </div>
             <button onClick={() => exportToCSV(patients, 'patients_list')} className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 text-sm font-bold rounded-xl flex items-center gap-2">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               Export CSV
             </button>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase tracking-widest text-gray-500">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {patients.map(pt => (
                  <tr key={pt.id} onClick={() => openEditModal(pt)} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs">{pt.full_name?.charAt(0)}</div>
                         <span className="font-bold text-sm group-hover:text-blue-600 transition-colors">{pt.full_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold">{pt.email || 'No email'}</span>
                        <span className="text-xs text-gray-500">{pt.phone_number || 'No phone'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{new Date(pt.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-20 text-center text-gray-400 italic">No patients registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* ==================== STATISTICS ==================== */}
      {view === 'stats' && (
        <div className="space-y-6">
          {loadingStats ? (
            <div className="py-20 text-center animate-spin text-blue-600 font-black tracking-widest italic">LOADING CLINIC DATA...</div>
          ) : clinicStats ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-8 rounded-[2rem] border border-emerald-100 dark:border-emerald-800 shadow-sm">
                  <p className="text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Clinic Revenue</p>
                  <p className="text-4xl font-black text-emerald-950 dark:text-emerald-50">{clinicStats.totalRevenue.toLocaleString()} <span className="text-sm font-medium">EGP</span></p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-8 rounded-[2rem] border border-blue-100 dark:border-blue-800 shadow-sm">
                  <p className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Total Appointments</p>
                  <p className="text-4xl font-black text-blue-950 dark:text-blue-50">{clinicStats.totalAppts.toLocaleString()}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-8 rounded-[2rem] border border-purple-100 dark:border-purple-800 shadow-sm">
                  <p className="text-purple-600 dark:text-purple-400 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Patient Growth</p>
                  <p className="text-4xl font-black text-purple-950 dark:text-purple-50">+{Math.round(clinicStats.totalAppts / (staff.length || 1))} <span className="text-sm font-medium">avg/dr</span></p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Revenue by Doctor */}
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl">
                   <h4 className="font-black text-lg mb-6">Revenue by Doctor</h4>
                   <div className="space-y-4">
                     {Object.entries(clinicStats.revByDoc).map(([name, rev]: [string, any]) => (
                       <div key={name}>
                          <div className="flex justify-between items-end mb-1 text-sm font-bold">
                            <span>{name}</span>
                            <span className="text-blue-600">{rev.toLocaleString()} EGP</span>
                          </div>
                          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${(rev / (clinicStats.totalRevenue || 1)) * 100}%` }}></div>
                          </div>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Distribution */}
                 <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl">
                   <h4 className="font-black text-lg mb-6">Appointment Distribution</h4>
                   <div className="space-y-4">
                     {Object.entries(clinicStats.byType).map(([type, count]: [string, any]) => (
                        <div key={type} className="flex items-center gap-4">
                          <div className="w-32 text-[10px] font-black uppercase text-gray-500 tracking-wider font-mono">{(type as string).replace('_', ' ')}</div>
                          <div className="flex-1 bg-gray-100 dark:bg-gray-800 h-2 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${(count / (clinicStats.totalAppts || 1)) * 100}%` }}></div>
                          </div>
                          <div className="w-10 text-right font-black text-sm">{count}</div>
                        </div>
                     ))}
                   </div>
                   <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                     <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                       <strong>Note:</strong> Financial data is calculated from confirmed appointment fees. 
                       Subscription revenue from staff is not yet included in this view.
                     </p>
                   </div>
                 </div>
              </div>
            </>
          ) : (
            <div className="p-20 text-center text-gray-400">Failed to aggregate clinic statistics.</div>
          )}
        </div>
      )}

      {/* ==================== SETTINGS ==================== */}
      {view === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-xl font-bold mb-6">Payment Configuration</h3>
            <div className="space-y-5">
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">InstaPay Address</label>
                <input
                  type="text"
                  value={settings.instapay_address || ''}
                  onChange={e => setSettings((prev: AdminSettings) => ({ ...prev, instapay_address: e.target.value }))}
                  placeholder="your-name@instapay"
                  className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-600 outline-none font-medium"
                />
              </div>
              
              {settings.instapay_address && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 text-center border border-blue-100 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-3">Your InstaPay QR Code</p>
                  <div className="bg-white dark:bg-gray-900 rounded-xl p-4 inline-block shadow-sm">
                    <QRCodeSVG value={`instapay://${settings.instapay_address}`} size={150} bgColor="#ffffff" fgColor="#000000" />
                    <p className="text-xs font-bold text-gray-500 mt-3">{settings.instapay_address}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Payment Link (URL)</label>
                <input
                  type="url"
                  value={settings.payment_link || ''}
                  onChange={e => setSettings((prev: AdminSettings) => ({ ...prev, payment_link: e.target.value }))}
                  placeholder="https://payment.example.com/your-link"
                  className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-600 outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">Bank Account Details</label>
                <textarea
                  value={settings.bank_details || ''}
                  onChange={e => setSettings((prev: AdminSettings) => ({ ...prev, bank_details: e.target.value }))}
                  placeholder="Bank Name: ...\nAccount Number: ...\nIBAN: ..."
                  rows={4}
                  className="w-full rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 focus:border-blue-600 outline-none font-medium resize-none"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-xl font-bold mb-6">Subscription Pricing</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DURATION_OPTIONS.slice(0, 4).map(opt => (
                <div key={opt.value} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-2">{opt.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={settings.subscription_prices[opt.value] || 0}
                      onChange={e => setSettings((prev: AdminSettings) => ({
                        ...prev,
                        subscription_prices: { ...prev.subscription_prices, [opt.value]: parseInt(e.target.value) || 0 }
                      }))}
                      className="w-full rounded-lg px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold text-center"
                    />
                    <span className="text-xs font-bold text-gray-400">EGP</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ================= EDIT MODAL ================= */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
             <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
                <div>
                   <h3 className="text-xl font-bold">Edit User Details</h3>
                   <p className="text-sm text-gray-500">ID: {editUser.id.substring(0,8)}... — Role: <span className="font-bold text-blue-600 capitalize">{editUser.role}</span></p>
                </div>
                <button onClick={() => setEditUser(null)} className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-all">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>

             <div className="p-6 space-y-4">
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-1">Full Name</label>
                      <input 
                         type="text" 
                         value={editForm.full_name || ''} 
                         onChange={e => setEditForm((prev: any) => ({...prev, full_name: e.target.value}))}
                         className="w-full rounded-xl px-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-blue-600 outline-none text-sm font-medium"
                      />
                   </div>
                   <div>
                      <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-1">Phone Number</label>
                      <input 
                         type="tel" 
                         value={editForm.phone_number || ''} 
                         onChange={e => setEditForm((prev: any) => ({...prev, phone_number: e.target.value}))}
                         className="w-full rounded-xl px-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-blue-600 outline-none text-sm font-medium"
                      />
                   </div>
                </div>

                <div>
                   <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-1">Email Address</label>
                   <input 
                      type="email" 
                      value={editForm.email || ''} 
                      onChange={e => setEditForm((prev: any) => ({...prev, email: e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-blue-600 outline-none text-sm font-medium"
                   />
                </div>

                <div>
                   <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-1">Address / Clinic Location</label>
                   <input 
                      type="text" 
                      value={editForm.clinic_location || ''} 
                      onChange={e => setEditForm((prev: any) => ({...prev, clinic_location: e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-blue-600 outline-none text-sm font-medium"
                   />
                </div>

                <div>
                   <label className="text-xs font-black uppercase tracking-widest text-gray-500 block mb-1">User's InstaPay / Payment Details</label>
                   <input 
                      type="text" 
                      value={editForm.instapay_address || ''} 
                      onChange={e => setEditForm((prev: any) => ({...prev, instapay_address: e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-blue-600 outline-none text-sm font-medium"
                   />
                </div>

                {/* Sub & Link Info (Staff Only) */}
                {editUser.role !== 'patient' && (
                  <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 p-4 rounded-2xl space-y-4">
                    <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm">Staff Controls</h4>
                    
                    {/* Expiry Calendar */}
                    <div>
                       <label className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 block mb-1">Custom Subscription Expiry</label>
                       <input 
                          type="date" 
                          value={editForm.subscription_expires_at || ''} 
                          onChange={e => setEditForm((prev: any) => ({...prev, subscription_expires_at: e.target.value}))}
                          className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800 focus:border-blue-600 outline-none text-sm font-bold text-gray-700 dark:text-gray-300"
                       />
                       <p className="text-[10px] text-gray-500 mt-1">If you change this date, they will be considered active until it passes.</p>
                    </div>

                    {/* Nurse-Doctor linking */}
                    {editUser.role === 'nurse' && (
                      <div>
                         <label className="text-[10px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 block mb-1">Supervising Doctor</label>
                         <select 
                            value={editForm.supervisor_id || ''} 
                            onChange={e => setEditForm((prev: any) => ({...prev, supervisor_id: e.target.value}))}
                            className="w-full rounded-xl px-3 py-2 bg-white dark:bg-gray-900 border border-teal-200 dark:border-teal-800 focus:border-teal-600 outline-none text-sm font-bold text-gray-700 dark:text-gray-300"
                         >
                            <option value="">-- No Supervisor Assigned --</option>
                            {doctorList.map(doc => (
                               <option key={doc.id} value={doc.id}>Dr. {doc.full_name}</option>
                            ))}
                         </select>
                      </div>
                    )}
                  </div>
                )}
             </div>

             <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-end gap-3">
                <button 
                  onClick={() => setEditUser(null)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveUser}
                  disabled={savingUser}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {savingUser ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving...</>
                  ) : 'Save Changes'}
                </button>
             </div>
           </div>
        </div>
      )}

    </div>
  )
}
