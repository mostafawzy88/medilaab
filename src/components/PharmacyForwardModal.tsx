'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import WhatsAppIcon from './icons/WhatsAppIcon'

type MedicationItem = {
  name: string
  dosage?: string
  instructions?: string
  form?: string
}

type PrescriptionData = {
  id?: string
  doctor_name?: string
  created_at?: string
  diagnosis?: string
  medications?: MedicationItem[]
}

const PHARMACY_PARTNERS = [
  {
    id: 'elezaby',
    nameEn: 'El Ezaby Pharmacy (صيدليات العزبي)',
    nameAr: 'صيدليات العزبي',
    logo: '🟢',
    phone: '201111119600',
    hotline: '19600',
    badgeEn: 'Egypt #1 Chain • 24/7 Delivery',
    badgeAr: 'سلسلة رقم 1 بمصر • توصيل 24 ساعة'
  },
  {
    id: 'yodawy',
    nameEn: 'Yodawy Digital Pharmacy (يدوي)',
    nameAr: 'صيدلية يدوي الرقمية',
    logo: '🔵',
    phone: '201000808080',
    hotline: 'App & WhatsApp',
    badgeEn: 'Fast Digital Delivery & Insurance',
    badgeAr: 'توصيل رقمي سريع وتأمين طبي'
  },
  {
    id: '19011',
    nameEn: '19011 Pharmacies (صيدليات 19011)',
    nameAr: 'صيدليات 19011',
    logo: '🔴',
    phone: '201901119011',
    hotline: '19011',
    badgeEn: 'Nationwide Branches',
    badgeAr: 'فروع في جميع أنحاء الجمهورية'
  },
  {
    id: 'seif',
    nameEn: 'Seif Pharmacies (صيدليات سيف)',
    nameAr: 'صيدليات سيف',
    logo: '🟡',
    phone: '201919919199',
    hotline: '19199',
    badgeEn: 'Express Medicine Delivery',
    badgeAr: 'خدمة التوصيل السريع للدواء'
  }
]

export default function PharmacyForwardModal({
  isOpen = true,
  prescription,
  patientName = 'Patient',
  onClose,
  onDownloadPdf
}: {
  isOpen?: boolean
  prescription: PrescriptionData
  patientName?: string
  onClose: () => void
  onDownloadPdf?: () => void
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [selectedPartner, setSelectedPartner] = useState(PHARMACY_PARTNERS[0].id)
  const [customPhone, setCustomPhone] = useState('')
  const [copied, setCopied] = useState(false)

  if (isOpen === false) return null

  const meds = prescription.medications || []
  const doctorName = prescription.doctor_name || 'Clinic Doctor'
  const rxDate = prescription.created_at
    ? new Date(prescription.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'Recent'

  // Generate standardized Egyptian pharmacy order text
  const generateOrderMessage = () => {
    let msg = isAr
      ? `السلام عليكم، أرغب في طلب الأدوية المقررة بالروشتة الطبية من منصة MediLab:\n\n`
      : `Hello, I would like to order the prescribed medications from MediLab digital prescription:\n\n`

    msg += isAr
      ? `👤 اسم المريض: ${patientName}\n`
      : `👤 Patient: ${patientName}\n`

    msg += isAr
      ? `👨‍⚕️ الطبيب المعالج: د. ${doctorName}\n`
      : `👨‍⚕️ Attending Doctor: Dr. ${doctorName}\n`

    msg += isAr
      ? `📅 تاريخ الكشف: ${rxDate}\n`
      : `📅 Date: ${rxDate}\n`

    if (prescription.diagnosis) {
      msg += isAr
        ? `🩺 التشخيص: ${prescription.diagnosis}\n`
        : `🩺 Diagnosis: ${prescription.diagnosis}\n`
    }

    msg += isAr ? `\n💊 قائمة الأدوية المطلوبة:\n` : `\n💊 Prescribed Medications List:\n`

    meds.forEach((m, idx) => {
      const formTag = m.form ? ` [${m.form}]` : ''
      const dose = m.dosage ? ` - ${m.dosage}` : ''
      const inst = m.instructions ? ` (${m.instructions})` : ''
      msg += `${idx + 1}. ${m.name}${dose}${formTag}${inst}\n`
    })

    msg += isAr
      ? `\n📄 الروشتة صادرة ومعتمدة رقمياً عبر MediLab Clinic System.`
      : `\n📄 Digitally issued and verified via MediLab Clinic System.`

    return msg
  }

  const handleCopyText = () => {
    const text = generateOrderMessage()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const handleSendWhatsApp = (phoneToSend?: string) => {
    const partner = PHARMACY_PARTNERS.find(p => p.id === selectedPartner)
    let phone = phoneToSend || customPhone.trim() || partner?.phone || '201111119600'
    phone = phone.replace(/\D/g, '')
    if (phone.startsWith('01')) {
      phone = '2' + phone
    }

    const message = encodeURIComponent(generateOrderMessage())
    const url = `https://wa.me/${phone}?text=${message}`
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-bold transition-colors"
          >
            ✕
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 rounded-2xl bg-white/20">📦</span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100 bg-white/20 px-2.5 py-0.5 rounded-full">
                {isAr ? 'خدمة صيدليات الشركاء' : 'Pharmacy Partner Dispatch'}
              </span>
              <h3 className="text-xl font-black mt-1">
                {isAr ? 'طلب وتوصيل الأدوية بنقرة واحدة' : 'Order Prescription from Pharmacy'}
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                {isAr
                  ? 'أرسل الروشتة مباشرة للصيدلية عبر واتساب لتوصيلها إلى باب منزلك فوراً'
                  : 'Forward this prescription directly to pharmacy delivery via WhatsApp'}
              </p>
            </div>
          </div>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Pharmacy Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {isAr ? 'اختر الصيدلية أو خدمة التوصيل:' : 'Select Partner Pharmacy / Delivery:'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PHARMACY_PARTNERS.map(partner => {
                const isSelected = selectedPartner === partner.id
                return (
                  <div
                    key={partner.id}
                    onClick={() => {
                      setSelectedPartner(partner.id)
                      setCustomPhone('')
                    }}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {isAr ? partner.nameAr : partner.nameEn}
                      </span>
                      <span className="text-lg">{partner.logo}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {isAr ? partner.badgeAr : partner.badgeEn}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      📞 {partner.hotline}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Custom Local Pharmacy Option */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center justify-between">
              <span>{isAr ? 'أو رقم واتساب صيدلية منطقتك المحلية:' : 'Or Local Pharmacy WhatsApp Phone:'}</span>
              <span className="text-[10px] text-gray-400">01xxxxxxxxx</span>
            </label>
            <input
              type="tel"
              placeholder={isAr ? 'مثال: 01012345678' : 'e.g. 01012345678'}
              value={customPhone}
              onChange={e => setCustomPhone(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Medications Order Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {isAr ? `الأدوية المشمولة بالطلب (${meds.length}):` : `Prescribed Medications (${meds.length}):`}
              </span>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <span>{copied ? '✓' : '📋'}</span>
                <span>{copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ نص الطلب' : 'Copy Order Text')}</span>
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar text-xs">
              {meds.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <span className="font-bold text-gray-900 dark:text-white">
                    {i + 1}. {m.name} {m.dosage ? `(${m.dosage})` : ''}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    {m.form || 'pill'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={() => handleSendWhatsApp()}
            className="w-full sm:flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
          >
            <WhatsAppIcon className="w-5 h-5 text-white" />
            <span>
              {isAr ? 'إرسال الروشتة للصيدلية عبر واتساب' : 'Forward Rx to Pharmacy on WhatsApp'}
            </span>
          </button>

          {onDownloadPdf && (
            <button
              type="button"
              onClick={onDownloadPdf}
              className="w-full sm:w-auto py-3 px-4 rounded-2xl bg-white dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-black transition-colors"
            >
              {isAr ? 'تحميل الروشتة PDF' : 'Download Rx PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
