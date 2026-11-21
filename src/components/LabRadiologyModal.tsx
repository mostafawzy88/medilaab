'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import WhatsAppIcon from './icons/WhatsAppIcon'

export type LabOrder = {
  id: string
  test_name: string
  category: 'blood' | 'radiology' | 'cardiac' | 'urine_stool' | 'other'
  instructions?: string
  priority?: 'routine' | 'urgent'
  preferred_lab?: string
  ordered_at: string
  doctor_name?: string
  status?: 'pending' | 'completed' | 'cancelled'
  report_url?: string | null
  patient_notes?: string | null
}

export const POPULAR_LAB_TESTS = [
  // Blood Tests
  { name: 'Complete Blood Count (CBC)', ar: 'صورة دم كاملة (CBC)', category: 'blood' },
  { name: 'Fasting & 2h Postprandial Blood Sugar', ar: 'سكر صائم وفاطر', category: 'blood' },
  { name: 'HbA1c (Glycated Hemoglobin)', ar: 'السكر التراكمي (HbA1c)', category: 'blood' },
  { name: 'Lipid Profile (Cholesterol & Triglycerides)', ar: 'دهون الدم الكاملة والكوليسترول', category: 'blood' },
  { name: 'Liver Enzymes (ALT, AST, Bilirubin)', ar: 'وظائف كبد (ALT, AST)', category: 'blood' },
  { name: 'Kidney Function (Creatinine & Urea)', ar: 'وظائف كلى (كرياتينين وبولينا)', category: 'blood' },
  { name: 'Thyroid Function (TSH, Free T3, Free T4)', ar: 'وظائف الغدة الدرقية (TSH)', category: 'blood' },
  { name: 'Serum Ferritin & Iron Profile', ar: 'مخزون الحديد والأنيميا', category: 'blood' },
  { name: 'Vitamin D (25-OH)', ar: 'فيتامين د (Vitamin D)', category: 'blood' },
  { name: 'C-Reactive Protein (CRP) & ESR', ar: 'سرعة الترسيب وبروتين الالتهاب (CRP)', category: 'blood' },
  { name: 'Urine & Stool Routine Analysis', ar: 'تحليل بول وبراز كامل', category: 'urine_stool' },

  // Radiology Scans
  { name: 'Chest X-Ray (PA & Lateral)', ar: 'أشعة سينية على الصدر (Chest X-Ray)', category: 'radiology' },
  { name: 'Abdominal & Pelvic Ultrasound (Sonar)', ar: 'سونار على البطن والحوض', category: 'radiology' },
  { name: 'Pelvic / Kidney Sonar', ar: 'سونار على الكلى والمسالك البولية', category: 'radiology' },
  { name: 'Brain / Spine MRI with Contrast', ar: 'رنين مغناطيسي على المخ / العمود الفقري', category: 'radiology' },
  { name: 'CT Scan (Computed Tomography)', ar: 'أشعة مقطعية بالصبغة (CT Scan)', category: 'radiology' },
  { name: 'Echocardiogram (Cardiac Echo)', ar: 'إيكو على عضلة القلب (Echo)', category: 'cardiac' },
  { name: 'Resting Electrocardiogram (ECG)', ar: 'رسم قلب كهربائي (ECG)', category: 'cardiac' },
  { name: 'Mammogram & Breast Sonar', ar: 'ماموجرام وسونار الثدي', category: 'radiology' },
  { name: 'Doppler Arterial / Venous Scan', ar: 'دوبلر ملون على الأوعية الدموية', category: 'radiology' }
]

export const PARTNER_LABS = [
  {
    id: 'almokhtabar',
    nameEn: 'Al Mokhtabar Laboratories (معامل المختبر)',
    nameAr: 'معامل المختبر',
    logo: '🧪',
    hotline: '19014',
    phone: '201901419014',
    type: 'Blood & Pathology Tests',
    badgeEn: 'Home Sample Collection • 200+ Branches in Egypt',
    badgeAr: 'سحب عينات من المنزل مجاناً • أكثر من 200 فرع في مصر',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً معامل المختبر، أود حجز فحص مخبري: (${testName}) للمريض (${patientName}) بناءً على طلب الطبيب. يرجى التنسيق لزيارة منزلية أو أقرب فرع.`
  },
  {
    id: 'alborg',
    nameEn: 'Al Borg Laboratories (معامل البرج)',
    nameAr: 'معامل البرج',
    logo: '🔬',
    hotline: '19911',
    phone: '201099919911',
    type: 'Clinical & Molecular Pathology',
    badgeEn: 'Nationwide Lab Network • Fast Online Results',
    badgeAr: 'شبكة فروع شاملة بجميع المحافظات • نتائج سريعة أونلاين',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً معامل البرج، أود حجز تحليل طبي: (${testName}) للمريض (${patientName})، يرجى إفادتي بالتكلفة وأقرب فرع أو زيارة منزلية.`
  },
  {
    id: 'alfascan',
    nameEn: 'Alfa Scan & Labs (ألفا سكان ومعامل ألفا)',
    nameAr: 'ألفا سكان ومعامل ألفا',
    logo: '🩻',
    hotline: '16191',
    phone: '201619116191',
    type: 'Radiology Scans & Lab Tests',
    badgeEn: 'MRI, CT, 4D Ultrasound, Mammogram & Labs',
    badgeAr: 'رنين مغناطيسي، أشعة مقطعية، سونار، ومختبر متكامل',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً ألفا سكان، أود الاستفسار وحجز فحص: (${testName}) للمريض (${patientName}) بناءً على توصية الطبيب.`
  },
  {
    id: 'cairoscan',
    nameEn: 'Cairo Scan (كايرو سكان للأشعة والتحاليل)',
    nameAr: 'كايرو سكان للأشعة والتحاليل',
    logo: '⚡',
    hotline: '19144',
    phone: '201914419144',
    type: 'Advanced Diagnostic Radiology',
    badgeEn: 'Digital X-Ray, Echo, CT, MRI & Nuclear Medicine',
    badgeAr: 'أشعة ديجيتال، إيكو قلب، رنين، ومسح ذري متطور',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً كايرو سكان، أود حجز موعد أشعة / تحاليل: (${testName}) للمريض (${patientName}).`
  },
  {
    id: 'nilescan',
    nameEn: 'Nile Scan & Labs (نايل سكان)',
    nameAr: 'نايل سكان للأشعة والتحاليل',
    logo: '🌊',
    hotline: '19749',
    phone: '201974919749',
    type: 'Medical Imaging & Clinical Lab',
    badgeEn: 'PET-CT, Breast Imaging, Doppler & Labs',
    badgeAr: 'فحوصات الأشعة المقطعية المتطورة، الدوبلر، والمختبر',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً نايل سكان، يرغب المريض (${patientName}) في إجراء فحص: (${testName}) بناءً على طلب العيادة.`
  }
]

export default function LabRadiologyModal({
  order,
  patientName = 'Patient',
  onClose,
  onUploadReport
}: {
  order: LabOrder
  patientName?: string
  onClose: () => void
  onUploadReport?: (orderId: string, reportNote: string) => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [selectedPartnerId, setSelectedPartnerId] = useState(order.preferred_lab || PARTNER_LABS[0].id)
  const [reportNote, setReportNote] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [reportSuccess, setReportSuccess] = useState(false)
  const [copiedHotline, setCopiedHotline] = useState<string | null>(null)

  const selectedPartner = PARTNER_LABS.find(p => p.id === selectedPartnerId) || PARTNER_LABS[0]

  const getWhatsAppBookingUrl = (partner: typeof PARTNER_LABS[0]) => {
    const text = partner.whatsappMessage(order.test_name, patientName)
    return `https://wa.me/${partner.phone}?text=${encodeURIComponent(text)}`
  }

  const handleCopyHotline = (hotline: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hotline)
      setCopiedHotline(hotline)
      setTimeout(() => setCopiedHotline(null), 2500)
    }
  }

  const handleSaveReport = () => {
    if (!reportNote.trim()) return
    setSubmittingReport(true)
    onUploadReport?.(order.id, reportNote)
    setReportSuccess(true)
    setTimeout(() => {
      setSubmittingReport(false)
      onClose()
    }, 1500)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
      <div className="bg-[#0B0A14] text-white rounded-[32px] shadow-2xl w-full max-w-2xl border border-white/10 p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-300 text-2xl flex items-center justify-center border border-cyan-400/30">
              {order.category === 'radiology' ? '🩻' : order.category === 'cardiac' ? '💓' : '🧪'}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  {isAr ? 'فحص طبي مطلوب' : 'Medical Test Order'}
                </span>
                {order.priority === 'urgent' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30">
                    🔴 {isAr ? 'عاجل' : 'Urgent'}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                {order.test_name}
              </h3>
              <p className="text-xs text-gray-400">
                {isAr ? `الطبيب المعالج: د. ${order.doctor_name || 'الطبيب'}` : `Prescribing Doctor: Dr. ${order.doctor_name || 'Clinic'}`} • {new Date(order.ordered_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Preparation & Instructions Callout */}
        {order.instructions && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs space-y-1">
            <span className="font-black flex items-center gap-1.5 text-amber-300 uppercase tracking-wider text-[11px]">
              <span>⚠️</span>
              <span>{isAr ? 'تعليمات وإرشادات التحضير قبل الفحص:' : 'Preparation & Clinical Instructions:'}</span>
            </span>
            <p className="leading-relaxed font-semibold pl-5 text-gray-200">
              {order.instructions}
            </p>
          </div>
        )}

        {/* Nearest Partner Labs & Diagnostic Radiology Centers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>🏥</span>
              <span>{isAr ? 'أقرب المعامل ومراكز الأشعة المعتمدة للتنفيذ:' : 'Accredited Partner Labs & Imaging Centers:'}</span>
            </h4>
            <span className="text-[10px] text-gray-400 font-bold">
              {isAr ? 'توصيل / سحب عينات منزلي' : 'Home Sample Visit Available'}
            </span>
          </div>

          <div className="space-y-2.5">
            {PARTNER_LABS.map(partner => {
              const isSelected = selectedPartnerId === partner.id
              const waLink = getWhatsAppBookingUrl(partner)
              return (
                <div
                  key={partner.id}
                  onClick={() => setSelectedPartnerId(partner.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isSelected
                      ? 'bg-cyan-950/40 border-cyan-400/50 shadow-lg shadow-cyan-500/10'
                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-2xl p-2.5 rounded-xl bg-white/10 shrink-0">
                      {partner.logo}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-black text-sm text-white">
                          {isAr ? partner.nameAr : partner.nameEn}
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-cyan-300">
                          📞 {partner.hotline}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {isAr ? partner.badgeAr : partner.badgeEn}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyHotline(partner.hotline)
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-gray-200 transition-colors"
                      title="Copy Hotline"
                    >
                      {copiedHotline === partner.hotline ? (isAr ? '✓ تم النسخ' : '✓ Copied') : `📞 ${partner.hotline}`}
                    </button>

                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black text-xs transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 shadow-md shadow-[#25D366]/20"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 text-slate-950" />
                      <span>{isAr ? 'حجز بالواتساب' : 'WhatsApp'}</span>
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Patient Report Submission / Result Upload Section */}
        <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>📤</span>
              <span>{isAr ? 'إرسال نتيجة التحليل أو تقرير الأشعة للطبيب:' : 'Submit Test Results / Report to Doctor:'}</span>
            </h4>
            {order.report_url && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                ✓ {isAr ? 'تم إرسال التقرير' : 'Report Uploaded'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {isAr
              ? 'يمكنك كتابة ملخص النتيجة، رابط التقرير الطبي، أو اسم المعمل الذي أجريت به الفحص ليصل إلى طبيبك المعالج مباشرة.'
              : 'Add the test result values, online lab report link, or notes so your doctor can review it.'}
          </p>

          <div className="space-y-2">
            <textarea
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder={isAr ? 'مثال: تم إجراء التحليل في معمل المختبر، النتيجة: الهيموجلوبين 13.5، والسكر الصائم 95...' : 'e.g. Completed at Al Borg lab, Fasting Sugar: 95 mg/dL, HbA1c: 5.6%...'}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-gray-500 text-xs focus:outline-none focus:border-cyan-400 resize-none"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">
                {reportSuccess && <span className="text-emerald-400 font-bold">✓ {isAr ? 'تم إرسال التقرير للطبيب بنجاح!' : 'Report saved & shared with doctor!'}</span>}
              </span>
              <button
                type="button"
                disabled={submittingReport || !reportNote.trim()}
                onClick={handleSaveReport}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:brightness-110 active:scale-95 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-40"
              >
                {submittingReport ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال التقرير للطبيب' : 'Save & Send to Doctor')}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-200 font-bold text-xs transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  )
}
