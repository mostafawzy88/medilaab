'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'
import { getWhatsAppLink } from '@/utils/whatsapp'
import WhatsAppIcon from '@/components/icons/WhatsAppIcon'
import LogoutButton from './LogoutButton'

type Doctor = {
  id: string
  full_name: string
  specialization?: string | null
  clinic_location?: string | null
  avatar_url?: string | null
  phone_number?: string | null
}

export default function NurseAssignmentView({
  nurseId,
  nurseName,
  initialSupervisorId,
  supervisorDoctor,
  availableDoctors,
  isAuthorized
}: {
  nurseId: string
  nurseName: string
  initialSupervisorId: string | null
  supervisorDoctor: Doctor | null
  availableDoctors: Doctor[]
  isAuthorized: boolean
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [supervisorId, setSupervisorId] = useState<string | null>(initialSupervisorId)
  const [currentSupervisor, setCurrentSupervisor] = useState<Doctor | null>(supervisorDoctor)
  const [selectedDocId, setSelectedDocId] = useState<string>(initialSupervisorId || '')
  const [loading, setLoading] = useState(false)
  const [searchDoc, setSearchDoc] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [authorized, setAuthorized] = useState(isAuthorized)
  const [message, setMessage] = useState<string | null>(null)

  // Request assignment with a doctor
  const handleRequestAssignment = async (docId: string) => {
    if (!docId) return
    setLoading(true)
    setMessage(null)
    const supabase = createClient()
    
    const { error } = await supabase
      .from('profiles')
      .update({
        supervisor_id: docId,
        assigned_doctor_id: docId,
        is_authorized: false // Must be approved by doctor or admin
      })
      .eq('id', nurseId)

    setLoading(false)
    if (!error) {
      setSupervisorId(docId)
      const targetDoc = availableDoctors.find(d => d.id === docId) || null
      setCurrentSupervisor(targetDoc)
      setMessage(isAr ? 'تم إرسال طلب الانضمام إلى الطبيب بنجاح وهو بانتظار الموافقة.' : 'Request sent to doctor successfully. Awaiting approval.')
    } else {
      setMessage(`Error: ${error.message}`)
    }
  }

  // Change assigned doctor (reset)
  const handleChangeDoctor = async () => {
    if (!confirm(isAr ? 'هل أنت متأكد من رغبتك في تغيير الطبيب المشرف؟' : 'Are you sure you want to change your supervising doctor?')) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('profiles').update({
      supervisor_id: null,
      assigned_doctor_id: null,
      is_authorized: false
    }).eq('id', nurseId)
    setSupervisorId(null)
    setCurrentSupervisor(null)
    setSelectedDocId('')
    setLoading(false)
  }

  // Refresh authorization status
  const handleCheckStatus = async () => {
    setRefreshing(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('profiles')
      .select('is_authorized, supervisor_id, assigned_doctor_id')
      .eq('id', nurseId)
      .single()

    setRefreshing(false)
    if (data?.is_authorized) {
      setAuthorized(true)
      window.location.reload()
    } else {
      alert(isAr 
        ? 'حسابك لا يزال بانتظار موافقة الطبيب المشرف أو الإدارة.' 
        : 'Your account is still awaiting approval from your supervising doctor or clinic administrator.')
    }
  }

  const filteredDoctors = availableDoctors.filter(d => 
    d.full_name?.toLowerCase().includes(searchDoc.toLowerCase()) ||
    d.specialization?.toLowerCase().includes(searchDoc.toLowerCase()) ||
    d.clinic_location?.toLowerCase().includes(searchDoc.toLowerCase())
  )

  // MODE 1: Pending Authorization from assigned doctor
  if (supervisorId && !authorized) {
    const docName = currentSupervisor?.full_name || 'Assigned Doctor'
    const docSpecialization = currentSupervisor?.specialization || (isAr ? 'طبيب' : 'Practitioner')
    const whatsappMsg = isAr
      ? `مرحباً دكتور ${docName}، أنا الممرض(ة) ${nurseName}. لقد قمت بإنشاء حسابي وربطه بعيادتك على MediLab وبانتظار موافقتك لمنحي صلاحية الوصول لقائمة المرضى.`
      : `Hello Dr. ${docName}, this is nurse ${nurseName}. I have registered on MediLab and requested to assist your clinic. Please authorize my account so I can manage clinic patients.`

    return (
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 sm:p-10 border border-gray-100 dark:border-gray-800 text-center animate-in fade-in zoom-in-95 duration-500">
        {/* Status Icon */}
        <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-20" />
          <div className="relative w-20 h-20 rounded-3xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center text-4xl shadow-inner border border-amber-500/30">
            🩺
          </div>
        </div>

        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 uppercase tracking-widest mb-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          {isAr ? 'بانتظار موافقة الطبيب' : 'Awaiting Doctor Authorization'}
        </span>

        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2">
          {isAr ? `في انتظار اعتماد د. ${docName}` : `Awaiting Approval from Dr. ${docName}`}
        </h2>

        <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed mb-6">
          {isAr
            ? `لقد تم ربط حسابك كطاقم تمريض في عيادة د. ${docName} (${docSpecialization}). حرصاً على سرية وخصوصية بيانات المرضى، لن تتمكن من الاطلاع على سجلات المرضى أو قائمة الانتظار حتى يقوم الطبيب أو مدير النظام بالموافقة على حسابك.`
            : `You are linked as clinic staff to Dr. ${docName} (${docSpecialization}). For patient privacy and clinic security, access to patient records and queues is locked until Dr. ${docName} or a Clinic Administrator approves your account.`}
        </p>

        {/* Doctor Info Card */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 sm:p-5 border border-gray-100 dark:border-gray-800 mb-8 max-w-md mx-auto text-left flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-xl shrink-0 overflow-hidden shadow-md">
            {currentSupervisor?.avatar_url ? (
              <img src={currentSupervisor.avatar_url} alt={docName} className="w-full h-full object-cover" />
            ) : (
              docName.charAt(0)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-gray-900 dark:text-white truncate">Dr. {docName}</h3>
            <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold">{docSpecialization}</p>
            {currentSupervisor?.clinic_location && (
              <p className="text-[11px] text-gray-400 truncate mt-0.5">📍 {currentSupervisor.clinic_location}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
          {currentSupervisor?.phone_number && (
            <a
              href={getWhatsAppLink(currentSupervisor.phone_number, whatsappMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
            >
              <WhatsAppIcon className="w-5 h-5 text-white" />
              <span>{isAr ? 'تواصل مع الطبيب عبر واتساب' : 'WhatsApp Dr. ' + docName}</span>
            </a>
          )}

          <button
            onClick={handleCheckStatus}
            disabled={refreshing}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-lg shadow-teal-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>{refreshing ? (isAr ? 'جاري التحقق...' : 'Checking...') : (isAr ? 'تحديث الحالة' : 'Check Status')}</span>
          </button>
        </div>

        {/* Bottom Options */}
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400">
          <button
            onClick={handleChangeDoctor}
            disabled={loading}
            className="hover:text-red-500 underline font-semibold transition-colors"
          >
            {isAr ? 'اختيار طبيب آخر' : 'Change Supervising Doctor'}
          </button>
          <LogoutButton />
        </div>
      </div>
    )
  }

  // MODE 2: No doctor assigned yet - Select doctor
  return (
    <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 sm:p-10 border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center max-w-lg mx-auto mb-8">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center text-3xl mx-auto mb-4">
          🩺
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2">
          {isAr ? 'اختر الطبيب المشرف على عيادتك' : 'Select Your Supervising Doctor'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {isAr
            ? 'كممرض(ة) في MediLab، يجب أن ترتبط بطبيب معتمد للوصول إلى قائمة الانتظار وسجلات مرضاه. سيصل إشعار للطبيب للموافقة على انضمامك.'
            : 'As a clinic nurse on MediLab, you must be linked to an authorized doctor to manage their waiting queue and patients. The doctor will receive a request to approve your access.'}
        </p>
      </div>

      {message && (
        <div className="mb-6 p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-sm font-bold text-center">
          {message}
        </div>
      )}

      {/* Doctor Search Filter */}
      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchDoc}
            onChange={e => setSearchDoc(e.target.value)}
            placeholder={isAr ? 'ابحث باسم الطبيب أو التخصص أو مكان العيادة...' : 'Search by doctor name, specialty, or clinic location...'}
            className="w-full px-5 py-3.5 pl-11 rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
          />
          <span className="absolute left-4 top-4 text-gray-400">🔍</span>
        </div>
      </div>

      {/* Doctors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1">
        {filteredDoctors.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-400">
            {isAr ? 'لا يوجد أطباء مطابقين للبحث.' : 'No matching doctors found.'}
          </div>
        ) : (
          filteredDoctors.map(doc => {
            const isSelected = selectedDocId === doc.id
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 shadow-md shadow-teal-500/10'
                    : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-lg shrink-0 overflow-hidden shadow-sm">
                    {doc.avatar_url ? (
                      <img src={doc.avatar_url} alt={doc.full_name} className="w-full h-full object-cover" />
                    ) : (
                      doc.full_name.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">Dr. {doc.full_name}</h3>
                    <p className="text-xs text-teal-600 dark:text-teal-400 font-semibold">{doc.specialization || (isAr ? 'طبيب عام' : 'General Practice')}</p>
                    {doc.clinic_location && (
                      <p className="text-[11px] text-gray-400 truncate mt-1">📍 {doc.clinic_location}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-gray-400'}`}>
                    {isSelected ? (isAr ? '✓ تم التحديد' : '✓ Selected') : (isAr ? 'انقر للتحديد' : 'Click to select')}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRequestAssignment(doc.id)
                    }}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {loading && selectedDocId === doc.id ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'طلب انضمام' : 'Request Access')}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer Submit */}
      <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-4">
        <LogoutButton />
        {selectedDocId && (
          <button
            type="button"
            onClick={() => handleRequestAssignment(selectedDocId)}
            disabled={loading}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-500 text-white text-sm font-bold shadow-lg shadow-teal-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <span>{loading ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'تأكيد اختيار الطبيب وإرسال الطلب' : 'Confirm Doctor & Submit Request')}</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  )
}
