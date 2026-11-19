'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'

type Nurse = {
  id: string
  full_name: string
  email?: string | null
  phone_number?: string | null
  avatar_url?: string | null
  is_authorized: boolean
  supervisor_id?: string | null
  assigned_doctor_id?: string | null
  created_at?: string
}

export default function DoctorStaffTab({ doctorId }: { doctorId: string }) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [assignedNurses, setAssignedNurses] = useState<Nurse[]>([])
  const [availableNurses, setAvailableNurses] = useState<Nurse[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchNurses = async () => {
    setLoading(true)
    const supabase = createClient()

    // 1. Fetch nurses assigned to this doctor
    const { data: assigned } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, avatar_url, is_authorized, supervisor_id, assigned_doctor_id, created_at')
      .eq('role', 'nurse')
      .or(`supervisor_id.eq.${doctorId},assigned_doctor_id.eq.${doctorId}`)
      .order('created_at', { ascending: false })

    if (assigned) {
      setAssignedNurses(assigned)
    }

    // 2. Fetch unassigned nurses or nurses seeking a clinic
    const { data: unassigned } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone_number, avatar_url, is_authorized, supervisor_id, assigned_doctor_id, created_at')
      .eq('role', 'nurse')
      .not('id', 'in', `(${(assigned || []).map(a => a.id).concat(['00000000-0000-0000-0000-000000000000']).join(',')})`)
      .order('created_at', { ascending: false })

    if (unassigned) {
      setAvailableNurses(unassigned)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchNurses()

    // Realtime listener for nurse requests or changes
    const supabase = createClient()
    const channel = supabase
      .channel(`doctor-staff-${doctorId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => { fetchNurses() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [doctorId])

  // Approve nurse access
  const handleApprove = async (nurseId: string) => {
    setProcessingId(nurseId)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        supervisor_id: doctorId,
        assigned_doctor_id: doctorId,
        is_authorized: true
      })
      .eq('id', nurseId)

    setProcessingId(null)
    if (!error) {
      setAssignedNurses(prev => prev.map(n => n.id === nurseId ? { ...n, is_authorized: true } : n))
      triggerSuccess(isAr ? 'تم منح الممرض صلاحية الوصول للعيادة بنجاح.' : 'Nurse access approved successfully.')
    } else {
      alert(`Error: ${error.message}`)
    }
  }

  // Suspend nurse access
  const handleSuspend = async (nurseId: string) => {
    if (!confirm(isAr ? 'هل أنت متأكد من تعليق صلاحية هذا الممرض مؤقتاً؟' : 'Are you sure you want to suspend this nurse access?')) return
    setProcessingId(nurseId)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ is_authorized: false })
      .eq('id', nurseId)

    setProcessingId(null)
    if (!error) {
      setAssignedNurses(prev => prev.map(n => n.id === nurseId ? { ...n, is_authorized: false } : n))
      triggerSuccess(isAr ? 'تم تعليق صلاحية الممرض.' : 'Nurse access suspended.')
    } else {
      alert(`Error: ${error.message}`)
    }
  }

  // Remove / Unlink nurse from clinic
  const handleRemove = async (nurseId: string) => {
    if (!confirm(isAr ? 'هل أنت متأكد من إزالة هذا الممرض من طاقم عيادتك؟' : 'Are you sure you want to remove this nurse from your clinic staff?')) return
    setProcessingId(nurseId)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        supervisor_id: null,
        assigned_doctor_id: null,
        is_authorized: false
      })
      .eq('id', nurseId)

    setProcessingId(null)
    if (!error) {
      fetchNurses()
      triggerSuccess(isAr ? 'تمت إزالة الممرض من طاقم العيادة.' : 'Nurse removed from clinic staff.')
    } else {
      alert(`Error: ${error.message}`)
    }
  }

  // Assign and immediately authorize an unassigned nurse
  const handleAssignNurse = async (nurseId: string) => {
    setProcessingId(nurseId)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        supervisor_id: doctorId,
        assigned_doctor_id: doctorId,
        is_authorized: true
      })
      .eq('id', nurseId)

    setProcessingId(null)
    if (!error) {
      setShowAddModal(false)
      fetchNurses()
      triggerSuccess(isAr ? 'تم ضم الممرض واعتماده بنجاح في عيادتك.' : 'Nurse added and authorized for your clinic.')
    } else {
      alert(`Error: ${error.message}`)
    }
  }

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3500)
  }

  const pendingNurses = assignedNurses.filter(n => !n.is_authorized)
  const activeNurses = assignedNurses.filter(n => n.is_authorized)

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-teal-600 via-teal-700 to-emerald-600 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-white/10 border border-white/20 uppercase tracking-widest mb-2">
            <span>🩺</span>
            <span>{isAr ? 'إدارة الفريق الطبي' : 'Clinic Medical Staff'}</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black">
            {isAr ? 'طاقم التمريض والمساعدين' : 'Clinic Nurses & Assistants'}
          </h2>
          <p className="text-teal-100 text-sm mt-1 max-w-xl">
            {isAr
              ? 'تحكم بالصلاحيات الممنوحة للممرضين للوصول إلى قائمة انتظار المرضى وسجلات الكشوفات في عيادتك. لن يتمكن أي ممرض من الاطلاع على بيانات مرضاك إلا بعد اعتمادك.'
              : 'Control which nurses are authorized to manage your waiting queue and view patient visit records. Nurses cannot access your patients without your explicit approval.'}
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-3 rounded-2xl bg-white text-teal-800 hover:bg-teal-50 font-black text-sm shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shrink-0"
        >
          <span className="text-lg leading-none">+</span>
          <span>{isAr ? 'إضافة / ربط ممرض للعيادة' : 'Assign / Add Nurse'}</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 font-bold text-sm flex items-center gap-2">
          <span>✓</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* PENDING APPROVAL SECTION */}
      {pendingNurses.length > 0 && (
        <div className="bg-amber-500/10 dark:bg-amber-500/5 rounded-3xl p-6 border-2 border-amber-300 dark:border-amber-800 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-black text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
              </span>
              <span>{isAr ? 'طلبات انضمام بانتظار موافقتك' : 'Pending Authorization Requests'}</span>
              <span className="bg-amber-200 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs px-2.5 py-0.5 rounded-full font-black">
                {pendingNurses.length}
              </span>
            </h3>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {isAr ? 'هؤلاء الممرضون بانتظار موافقتك لبدء إدارة العيادة' : 'These nurses require your approval before they can view patient records'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingNurses.map(nurse => (
              <div
                key={nurse.id}
                className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-amber-200 dark:border-amber-800/80 shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-black flex items-center justify-center text-lg shrink-0 overflow-hidden">
                    {nurse.avatar_url ? (
                      <img src={nurse.avatar_url} alt={nurse.full_name} className="w-full h-full object-cover" />
                    ) : (
                      nurse.full_name?.charAt(0) || 'N'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{nurse.full_name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{nurse.email || 'No email'}</p>
                    {nurse.phone_number && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 font-medium">{nurse.phone_number}</span>
                        <a
                          href={getWhatsAppLink(nurse.phone_number, `Hello ${nurse.full_name}, this is your supervising doctor.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded font-bold border border-emerald-200 flex items-center gap-1"
                          title="WhatsApp"
                        >
                          <WhatsAppIcon className="w-3 h-3 text-[#25D366]" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleRemove(nurse.id)}
                    disabled={processingId === nurse.id}
                    className="text-xs font-bold text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    {isAr ? 'رفض الطلب' : 'Decline'}
                  </button>
                  <button
                    onClick={() => handleApprove(nurse.id)}
                    disabled={processingId === nurse.id}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span>✓</span>
                    <span>{processingId === nurse.id ? (isAr ? 'جاري الاعتماد...' : 'Approving...') : (isAr ? 'موافقة ومنح الصلاحية' : 'Approve Access')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ACTIVE CLINIC STAFF */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900 dark:text-white">
              {isAr ? 'طاقم التمريض المعتمد للعيادة' : 'Authorized Clinic Staff'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isAr ? 'الممرضون المصرح لهم بإدارة قائمة الانتظار واستدعاء المرضى' : 'Nurses currently permitted to manage your waiting room and assist consultations'}
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            {activeNurses.length} {isAr ? 'ممرض معتمد' : 'Authorized'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-teal-600 font-bold animate-pulse">
            {isAr ? 'جاري تحميل الطاقم...' : 'Loading clinic staff...'}
          </div>
        ) : activeNurses.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <div className="text-4xl">🩺</div>
            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
              {isAr ? 'لم يتم ربط أي ممرض معتمد بعيادتك بعد.' : 'No authorized nurses linked to your clinic yet.'}
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              {isAr
                ? 'يمكنك إضافة ممرض مسجل في المنصة أو دعوة ممرضك الخاص لإنشاء حساب وتحديدك كطبيب مشرف.'
                : 'You can link an existing registered nurse to your clinic by clicking the Assign Nurse button above.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {activeNurses.map(nurse => (
              <div
                key={nurse.id}
                className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white font-black flex items-center justify-center text-lg shrink-0 overflow-hidden shadow-md">
                    {nurse.avatar_url ? (
                      <img src={nurse.avatar_url} alt={nurse.full_name} className="w-full h-full object-cover" />
                    ) : (
                      nurse.full_name?.charAt(0) || 'N'
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 dark:text-white text-base">{nurse.full_name}</h4>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {isAr ? 'معتمد ونشط' : 'Authorized & Active'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
                      <span>{nurse.email || 'No email'}</span>
                      {nurse.phone_number && (
                        <>
                          <span>•</span>
                          <span>{nurse.phone_number}</span>
                          <a
                            href={getWhatsAppLink(nurse.phone_number, `Hello ${nurse.full_name}, this is your supervising doctor.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800"
                            title="Chat on WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5 text-[#25D366]" />
                            <span>WhatsApp</span>
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleSuspend(nurse.id)}
                    disabled={processingId === nurse.id}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-amber-50 hover:text-amber-600 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {processingId === nurse.id ? '...' : (isAr ? 'تعليق الصلاحية' : 'Suspend')}
                  </button>
                  <button
                    onClick={() => handleRemove(nurse.id)}
                    disabled={processingId === nurse.id}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-red-50 hover:text-red-600 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {isAr ? 'إزالة' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL: ASSIGN / ADD NURSE FROM PLATFORM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xl border border-gray-100 dark:border-gray-800 p-6 sm:p-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>🩺</span>
                <span>{isAr ? 'ربط ممرض بعيادتك' : 'Assign Nurse to Your Clinic'}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 mb-4">
              {isAr
                ? 'اختر ممرضاً مسجلاً في النظام لضمه إلى طاقم عيادتك ومنحه صلاحية الوصول لقائمتك فوراً.'
                : 'Select a registered nurse from the platform to immediately assign and authorize them to your clinic.'}
            </p>

            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'ابحث باسم الممرض أو البريد الإلكتروني...' : 'Search nurse by name or email...'}
              className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold mb-4 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            {/* Nurse List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {availableNurses
                .filter(n => 
                  n.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  n.email?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(nurse => (
                  <div
                    key={nurse.id}
                    className="p-4 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-teal-600 text-white font-black flex items-center justify-center text-sm shrink-0 overflow-hidden">
                        {nurse.avatar_url ? (
                          <img src={nurse.avatar_url} alt={nurse.full_name} className="w-full h-full object-cover" />
                        ) : (
                          nurse.full_name?.charAt(0) || 'N'
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">{nurse.full_name}</h4>
                        <p className="text-xs text-gray-400 truncate">{nurse.email || nurse.phone_number || 'Registered Nurse'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAssignNurse(nurse.id)}
                      disabled={processingId === nurse.id}
                      className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 shrink-0"
                    >
                      {processingId === nurse.id ? '...' : (isAr ? '+ ضم واعتماد' : '+ Assign & Authorize')}
                    </button>
                  </div>
                ))}

              {availableNurses.length === 0 && (
                <div className="py-10 text-center text-gray-400 text-sm">
                  {isAr ? 'لا يوجد ممرضون متاحون حالياً.' : 'No available nurses found on the platform.'}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold text-xs"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
