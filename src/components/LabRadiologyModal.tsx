'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import WhatsAppIcon from './icons/WhatsAppIcon'
import { OBOUR_MEDICAL_DIRECTORY, MedicalFacility, OBOUR_DISTRICTS } from '@/data/obourMedicalDirectory'
import ObourMedicalWiki from './ObourMedicalWiki'

export type LabOrder = {
  id: string
  test_name: string
  category: 'blood' | 'radiology' | 'cardiac' | 'urine_stool' | 'other'
  instructions?: string
  priority?: 'routine' | 'urgent'
  preferred_lab?: string
  ordered_at: string
  doctor_name?: string
  status?: 'pending' | 'scheduled' | 'sample_collected' | 'completed' | 'cancelled'
  report_url?: string | null
  patient_notes?: string | null
  chosen_facility_name?: string | null
  reference_number?: string | null
  coordination_updates?: Array<{
    status: string
    timestamp: string
    note: string
    facilityName?: string
  }>
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
      `مرحباً معامل المختبر، أود حجز فحص مخبري: (${testName}) للمريض (${patientName}) بناءً على طلب عيادة MediLab. يرجى التنسيق لزيارة منزلية أو أقرب فرع في العبور.`
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
      `مرحباً معامل البرج، أود حجز تحليل طبي: (${testName}) للمريض (${patientName})، يرجى إفادتي بالتكلفة وأقرب فرع أو زيارة منزلية بالعبور.`
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
    id: 'farid-habib',
    nameEn: 'Farid Habib Hospital Imaging (مستشفى فريد حبيب بالعبور)',
    nameAr: 'مستشفى فريد حبيب - أشعة ومعامل 24 ساعة',
    logo: '🏥',
    hotline: '15478',
    phone: '201015478154',
    type: '24/7 Advanced Imaging & Diagnostics',
    badgeEn: '5th District, Obour • 24/7 Open • MRI, CT, Echo',
    badgeAr: 'الحي الخامس، العبور • طوارئ 24 ساعة • رنين ومقطعية وإيكو',
    whatsappMessage: (testName: string, patientName: string) =>
      `مرحباً مستشفى فريد حبيب بالعبور، أود حجز فحص أشعة / تحاليل: (${testName}) للمريض (${patientName}).`
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
  onUploadReport,
  onUpdateCoordination
}: {
  order: LabOrder
  patientName?: string
  onClose: () => void
  onUploadReport?: (orderId: string, reportNote: string) => void
  onUpdateCoordination?: (orderId: string, updateData: {
    status: string
    facilityName: string
    referenceNumber: string
    notes: string
  }) => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  // View state: 'select' | 'obour_wiki' | 'custom_partner'
  const [partnerMode, setPartnerMode] = useState<'obour' | 'national' | 'custom'>('obour')
  const [showObourWiki, setShowObourWiki] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState(order.preferred_lab || 'mokhtabar-obour-1')
  const [selectedCustomFacility, setSelectedCustomFacility] = useState<MedicalFacility | null>(null)

  // Coordination & Status update state
  const [coordStatus, setCoordStatus] = useState<string>(order.status || 'scheduled')
  const [coordFacility, setCoordFacility] = useState<string>(order.chosen_facility_name || 'معامل المختبر - فرع سنتر لؤلؤة العبور')
  const [coordRefNum, setCoordRefNum] = useState<string>(order.reference_number || '')
  const [coordNotes, setCoordNotes] = useState<string>(order.patient_notes || '')
  const [coordSubmitting, setCoordSubmitting] = useState(false)
  const [coordSuccess, setCoordSuccess] = useState(false)

  // Custom Partner Input State
  const [customName, setCustomName] = useState('')
  const [customDistrict, setCustomDistrict] = useState(OBOUR_DISTRICTS[0])
  const [customAddress, setCustomAddress] = useState('')
  const [customPhone, setCustomPhone] = useState('')
  const [customHotline, setCustomHotline] = useState('')
  const [customHomeSample, setCustomHomeSample] = useState(false)
  const [customNotes, setCustomNotes] = useState('')
  const [savingCustom, setSavingCustom] = useState(false)
  const [customSavedSuccess, setCustomSavedSuccess] = useState(false)

  const [copiedHotline, setCopiedHotline] = useState<string | null>(null)

  // Obour facilities matching test category
  const obourDiagnosticFacilities = OBOUR_MEDICAL_DIRECTORY.filter(f => 
    order.category === 'radiology' ? (f.category === 'radiology' || f.category === 'hospital') : (f.category === 'lab' || f.category === 'hospital')
  )

  const handleCopyHotline = (hotline: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(hotline)
      setCopiedHotline(hotline)
      setTimeout(() => setCopiedHotline(null), 2500)
    }
  }

  const handleSaveCustomPartner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customName.trim()) return
    setSavingCustom(true)
    try {
      const payload = {
        nameAr: customName.trim(),
        nameEn: customName.trim(),
        category: order.category === 'radiology' ? 'radiology' : 'lab',
        district: customDistrict,
        addressAr: customAddress.trim() || 'مدينة العبور',
        phone: customPhone.trim(),
        phoneDisplay: customPhone.trim() || customHotline.trim(),
        hotline: customHotline.trim(),
        whatsapp: customPhone.trim().replace(/\D/g, ''),
        hasHomeSampleService: customHomeSample,
        notesAr: customNotes.trim(),
        contributedBy: patientName
      }

      const res = await fetch('/api/obour-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        if (data.facility) {
          setSelectedCustomFacility(data.facility)
          setCoordFacility(data.facility.nameAr)
        }
        setCustomSavedSuccess(true)
        setTimeout(() => {
          setCustomSavedSuccess(false)
          setPartnerMode('obour')
        }, 1500)
      } else {
        alert('Could not save partner details.')
      }
    } catch (err: any) {
      console.error(err)
      alert('Error saving partner: ' + err.message)
    } finally {
      setSavingCustom(false)
    }
  }

  const handleSaveCoordinationUpdate = async () => {
    setCoordSubmitting(true)
    try {
      onUploadReport?.(order.id, coordNotes)
      onUpdateCoordination?.(order.id, {
        status: coordStatus,
        facilityName: coordFacility,
        referenceNumber: coordRefNum,
        notes: coordNotes
      })
      setCoordSuccess(true)
      setTimeout(() => {
        setCoordSuccess(false)
        onClose()
      }, 1500)
    } catch (e) {
      console.error(e)
    } finally {
      setCoordSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="bg-[#0B0A14] text-white rounded-[32px] shadow-2xl w-full max-w-3xl border border-white/10 p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-300 text-2xl flex items-center justify-center border border-cyan-400/30 shrink-0">
              {order.category === 'radiology' ? '🩻' : order.category === 'cardiac' ? '💓' : '🧪'}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  {isAr ? 'فحص طبي مطلوب' : 'Medical Test Order'}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  📍 {isAr ? 'نطاق مدينة العبور' : 'Obour City Geotarget'}
                </span>
                {order.priority === 'urgent' && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 animate-pulse">
                    🔴 {isAr ? 'عاجل' : 'Urgent'}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-black text-white mt-1">
                {order.test_name}
              </h3>
              <p className="text-xs text-gray-400">
                {isAr ? `الطبيب المعالج: د. ${order.doctor_name || 'الطبيب'}` : `Doctor: Dr. ${order.doctor_name || 'Clinic'}`} • {new Date(order.ordered_at).toLocaleDateString()}
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

        {/* Diagnostic Partner Selection Tabs */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>🏥</span>
              <span>{isAr ? 'اختر معمل أو مركز تشخيص لتنفيذ الفحص:' : 'Choose Diagnostic Partner for this Test:'}</span>
            </h4>

            <button
              type="button"
              onClick={() => setShowObourWiki(!showObourWiki)}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors self-start sm:self-auto"
            >
              <span>🏙️</span>
              <span>{showObourWiki ? (isAr ? 'إخفاء الموسوعة' : 'Hide Wiki') : (isAr ? 'تصفح موسوعة العبور الطبية الشاملة ←' : 'Browse Obour Medical Wiki →')}</span>
            </button>
          </div>

          {/* Toggle Partner Scope Tabs */}
          <div className="grid grid-cols-3 gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            <button
              type="button"
              onClick={() => { setPartnerMode('obour'); setShowObourWiki(false); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                partnerMode === 'obour' && !showObourWiki
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              <span>🏙️</span>
              <span>{isAr ? 'فروع العبور المعتمدة' : 'Obour City Labs'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setPartnerMode('national'); setShowObourWiki(false); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                partnerMode === 'national' && !showObourWiki
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              <span>🇪🇬</span>
              <span>{isAr ? 'كبار الشركاء بمصر' : 'National Partners'}</span>
            </button>
            <button
              type="button"
              onClick={() => { setPartnerMode('custom'); setShowObourWiki(false); }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                partnerMode === 'custom' && !showObourWiki
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'text-gray-300 hover:bg-white/10'
              }`}
            >
              <span>➕</span>
              <span>{isAr ? 'إدخال شريك / معمل آخر' : 'Input Other Partner'}</span>
            </button>
          </div>

          {/* Inline Obour Wiki if toggled */}
          {showObourWiki ? (
            <div className="bg-[#0e0c1b] p-4 rounded-3xl border border-cyan-500/30 max-h-[500px] overflow-y-auto">
              <ObourMedicalWiki
                embedded
                selectedTestName={order.test_name}
                onSelectFacilityForTest={(fac) => {
                  setSelectedCustomFacility(fac)
                  setCoordFacility(`${fac.nameAr} (${fac.district})`)
                  setShowObourWiki(false)
                }}
              />
            </div>
          ) : partnerMode === 'obour' ? (

            /* ─── OBOUR CITY BRANCHES ─────────────────────────────────────── */
            <div className="space-y-2.5">
              {obourDiagnosticFacilities.map(fac => {
                const isSelected = coordFacility.includes(fac.nameAr) || selectedPartnerId === fac.id
                const waNumber = (fac.whatsapp || fac.phone || '').replace(/\D/g, '')
                const waMsg = `مرحباً ${fac.nameAr} بمدينة العبور، أود حجز فحص: (${order.test_name}) للمريض (${patientName}) بناءً على توصية عيادة MediLab.`
                const waLink = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : null

                return (
                  <div
                    key={fac.id}
                    onClick={() => {
                      setSelectedPartnerId(fac.id)
                      setCoordFacility(`${fac.nameAr} (${fac.district})`)
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-cyan-950/50 border-cyan-400 shadow-md shadow-cyan-500/10'
                        : 'bg-white/5 hover:bg-white/10 border-white/10'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-white">{isAr ? fac.nameAr : fac.nameEn}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                          📍 {fac.district}
                        </span>
                        {fac.hasHomeSampleService && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">
                            🚗 {isAr ? 'سحب منزلي' : 'Home Visit'}
                          </span>
                        )}
                        {fac.isOpen24Hours && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                            🌙 24/7
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400" dir="auto">{fac.addressAr}</p>
                      {fac.landmarkAr && <p className="text-[11px] text-gray-500">🏷️ {fac.landmarkAr}</p>}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCopyHotline(fac.hotline || fac.phoneDisplay)
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-gray-200"
                      >
                        {copiedHotline === (fac.hotline || fac.phoneDisplay) ? '✓' : `📞 ${fac.hotline || fac.phoneDisplay}`}
                      </button>

                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black text-xs flex items-center gap-1"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 text-slate-950" />
                          <span>WhatsApp</span>
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : partnerMode === 'national' ? (

            /* ─── NATIONAL PARTNER CHAINS ─────────────────────────────────── */
            <div className="space-y-2.5">
              {PARTNER_LABS.map(partner => {
                const isSelected = selectedPartnerId === partner.id
                const waLink = partner.whatsappMessage(order.test_name, patientName)
                const fullWaUrl = `https://wa.me/${partner.phone}?text=${encodeURIComponent(waLink)}`

                return (
                  <div
                    key={partner.id}
                    onClick={() => {
                      setSelectedPartnerId(partner.id)
                      setCoordFacility(partner.nameAr)
                    }}
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
                      >
                        {copiedHotline === partner.hotline ? (isAr ? '✓ تم النسخ' : '✓ Copied') : `📞 ${partner.hotline}`}
                      </button>

                      <a
                        href={fullWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3.5 py-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba59] text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 text-slate-950" />
                        <span>{isAr ? 'حجز بالواتساب' : 'WhatsApp'}</span>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (

            /* ─── CUSTOM PARTNER INPUT FORM ───────────────────────────────── */
            <form onSubmit={handleSaveCustomPartner} className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4 animate-in fade-in">
              <div className="space-y-1">
                <h5 className="font-black text-sm text-cyan-300">
                  {isAr ? 'تسجيل معمل أو مركز أشعة آخر في العبور:' : 'Input Other Diagnostic Partner in Obour:'}
                </h5>
                <p className="text-xs text-gray-400">
                  {isAr ? 'سيتم حفظه في قاعدة بيانات العبور الموحدة لتظهر لك ولكافة المرضى والأطباء' : 'Will be saved in the consolidated database for all users'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    {isAr ? 'اسم المعمل / المركز الطبي *' : 'Facility Name *'}
                  </label>
                  <input
                    required
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="مثال: معمل كايرو سكان - فرع كارفور العبور"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    {isAr ? 'الحي بمدينة العبور' : 'District'}
                  </label>
                  <select
                    value={customDistrict}
                    onChange={e => setCustomDistrict(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  >
                    {OBOUR_DISTRICTS.map(d => (
                      <option key={d} value={d} className="bg-gray-900">{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    {isAr ? 'العنوان أو السنتر التجاري' : 'Address / Mall'}
                  </label>
                  <input
                    value={customAddress}
                    onChange={e => setCustomAddress(e.target.value)}
                    placeholder="مثال: سنتر الحجاز، الحي الأول"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    {isAr ? 'رقم التليفون أو الواتساب' : 'Phone / WhatsApp'}
                  </label>
                  <input
                    value={customPhone}
                    onChange={e => setCustomPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customHomeSample}
                    onChange={e => setCustomHomeSample(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500"
                  />
                  <span>🚗 {isAr ? 'يوفر خدمة سحب عينات منزلي' : 'Home Sample Visit Available'}</span>
                </label>
              </div>

              {customSavedSuccess && (
                <div className="p-2.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold text-center">
                  ✓ {isAr ? 'تم حفظ الشريك بنجاح وإضافته لقاعدة بيانات العبور!' : 'Partner saved to Obour Directory successfully!'}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingCustom}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-black rounded-xl text-xs shadow-md disabled:opacity-50"
                >
                  {savingCustom ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? 'حفظ وإضافة لقاعدة البيانات' : 'Save & Add to Database')}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Doctor-Patient Live Coordination Section */}
        <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-blue-950/40 border-2 border-indigo-400/40 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 text-lg">📡</span>
              <div>
                <h4 className="text-sm font-black text-white">
                  {isAr ? 'التنسيق وتحديث حالة الفحص مع الطبيب مباشرة:' : 'Doctor-Patient Coordination & Status Updates:'}
                </h4>
                <p className="text-[11px] text-gray-400">
                  {isAr ? 'أرسل تحديثاً لطبيبك عن موعد سحب العينة، اسم المعمل، أو رقم الفاتورة' : 'Update your doctor about test scheduling, chosen lab, and results'}
                </p>
              </div>
            </div>

            <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              Live Sync
            </span>
          </div>

          <div className="space-y-3">
            {/* Status Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                {isAr ? 'حالة الفحص الحالية:' : 'Current Test Status:'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'scheduled', labelAr: '🚗 تم طلب سحب منزلي / حجز موعد', labelEn: 'Home Sample / Visit Booked' },
                  { id: 'sample_collected', labelAr: '🧪 تم سحب العينة بالمعمل', labelEn: 'Sample Collected' },
                  { id: 'completed', labelAr: '📑 صدرت النتيجة وجاهزة', labelEn: 'Results Ready' }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setCoordStatus(st.id)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center ${
                      coordStatus === st.id
                        ? 'bg-indigo-600 text-white shadow-md font-black ring-2 ring-indigo-400'
                        : 'bg-white/5 hover:bg-white/10 text-gray-400'
                    }`}
                  >
                    {isAr ? st.labelAr : st.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* Chosen Facility & Reference Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isAr ? 'المعمل أو المركز الذي تم اختياره بالعبور:' : 'Chosen Facility in Obour:'}
                </label>
                <input
                  value={coordFacility}
                  onChange={e => setCoordFacility(e.target.value)}
                  placeholder="مثال: معامل المختبر سنتر الحجاز بالعبور"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isAr ? 'رقم الإيصال / كود النتيجة (اختياري):' : 'Invoice / Result Code:'}
                </label>
                <input
                  value={coordRefNum}
                  onChange={e => setCoordRefNum(e.target.value)}
                  placeholder="e.g. #INV-9481 / 2026-LAB-01"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white"
                />
              </div>
            </div>

            {/* Notes / Result Summary */}
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                {isAr ? 'ملخص النتيجة أو ملاحظاتك للطبيب:' : 'Report Summary or Note for Doctor:'}
              </label>
              <textarea
                value={coordNotes}
                onChange={e => setCoordNotes(e.target.value)}
                placeholder={isAr ? 'مثال: تم سحب عينة السكر الصائم في المنزل، والنتيجة ستظهر مساء اليوم أونلاين...' : 'e.g. Fasting sample taken at home, results will be online this evening...'}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 resize-none"
              />
            </div>

            {/* Submit Coordination Update Button */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-400 font-bold">
                {coordSuccess && <span>✓ {isAr ? 'تم إرسال التحديث وتنبيه الطبيب بنجاح!' : 'Update synced & doctor notified!'}</span>}
              </span>
              <button
                type="button"
                disabled={coordSubmitting}
                onClick={handleSaveCoordinationUpdate}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:brightness-110 active:scale-95 text-white font-black text-xs shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-40 flex items-center gap-2"
              >
                <span>🚀</span>
                <span>{coordSubmitting ? (isAr ? 'جارٍ الإرسال...' : 'Sending...') : (isAr ? 'إرسال التحديث للطبيب المعالج' : 'Send Coordination Update')}</span>
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
