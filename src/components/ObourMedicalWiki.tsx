'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLocale } from 'next-intl'
import { 
  OBOUR_MEDICAL_DIRECTORY, 
  OBOUR_DISTRICTS, 
  FACILITY_CATEGORIES, 
  MedicalFacility, 
  FacilityCategory, 
  ObourDistrict 
} from '@/data/obourMedicalDirectory'
import WhatsAppIcon from './icons/WhatsAppIcon'

interface ObourMedicalWikiProps {
  onSelectFacilityForTest?: (facility: MedicalFacility) => void
  selectedTestName?: string
  embedded?: boolean
  onClose?: () => void
}

export default function ObourMedicalWiki({
  onSelectFacilityForTest,
  selectedTestName,
  embedded = false,
  onClose
}: ObourMedicalWikiProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [facilities, setFacilities] = useState<MedicalFacility[]>(OBOUR_MEDICAL_DIRECTORY)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'all' | FacilityCategory>('all')
  const [selectedDistrict, setSelectedDistrict] = useState<'all' | ObourDistrict>('all')
  const [filterHomeSample, setFilterHomeSample] = useState(false)
  const [filterOpen24Hours, setFilterOpen24Hours] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [showAddModal, setShowAddModal] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null)

  // New facility form state
  const [newNameAr, setNewNameAr] = useState('')
  const [newNameEn, setNewNameEn] = useState('')
  const [newCategory, setNewCategory] = useState<FacilityCategory>('lab')
  const [newDistrict, setNewDistrict] = useState<ObourDistrict>('الحي الأول')
  const [newAddressAr, setNewAddressAr] = useState('')
  const [newLandmarkAr, setNewLandmarkAr] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newHotline, setNewHotline] = useState('')
  const [newWorkingHours, setNewWorkingHours] = useState('')
  const [newHomeSample, setNewHomeSample] = useState(false)
  const [new24Hours, setNew24Hours] = useState(false)
  const [newNotesAr, setNewNotesAr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [addSuccess, setAddSuccess] = useState(false)

  // Fetch updated community facilities from API
  const fetchDirectory = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/obour-directory')
      if (res.ok) {
        const data = await res.json()
        if (data.facilities && Array.isArray(data.facilities)) {
          setFacilities(data.facilities)
        }
      }
    } catch (e) {
      console.warn('Could not fetch updated directory from API, using baseline:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDirectory()
  }, [])

  // Filter and search
  const filteredFacilities = useMemo(() => {
    return facilities.filter(f => {
      if (selectedCategory !== 'all' && f.category !== selectedCategory) return false
      if (selectedDistrict !== 'all' && f.district !== selectedDistrict) return false
      if (filterHomeSample && !f.hasHomeSampleService) return false
      if (filterOpen24Hours && !f.isOpen24Hours) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = f.nameAr.toLowerCase().includes(q) || f.nameEn.toLowerCase().includes(q)
        const matchDistrict = f.district.toLowerCase().includes(q)
        const matchAddress = f.addressAr.toLowerCase().includes(q) || f.addressEn.toLowerCase().includes(q)
        const matchLandmark = (f.landmarkAr || '').toLowerCase().includes(q)
        const matchPhone = (f.phoneDisplay || '').includes(q) || (f.hotline || '').includes(q)
        const matchServices = (f.availableServicesAr || []).some(s => s.toLowerCase().includes(q))
        if (!matchName && !matchDistrict && !matchAddress && !matchLandmark && !matchPhone && !matchServices) {
          return false
        }
      }
      return true
    })
  }, [facilities, selectedCategory, selectedDistrict, filterHomeSample, filterOpen24Hours, searchQuery])

  const labsCount = facilities.filter(f => f.category === 'lab').length
  const radiologyCount = facilities.filter(f => f.category === 'radiology').length
  const hospitalsCount = facilities.filter(f => f.category === 'hospital').length
  const pharmaciesCount = facilities.filter(f => f.category === 'pharmacy').length
  const communityCount = facilities.filter(f => f.isCommunityContributed).length

  const handleCopyPhone = (phone: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(phone)
      setCopiedPhone(phone)
      setTimeout(() => setCopiedPhone(null), 2500)
    }
  }

  const handleCreateFacility = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNameAr.trim() && !newNameEn.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        nameAr: newNameAr.trim() || newNameEn.trim(),
        nameEn: newNameEn.trim() || newNameAr.trim(),
        category: newCategory,
        district: newDistrict,
        addressAr: newAddressAr.trim() || 'مدينة العبور',
        addressEn: newAddressAr.trim() || 'Obour City',
        landmarkAr: newLandmarkAr.trim(),
        phone: newPhone.trim(),
        phoneDisplay: newPhone.trim() || newHotline.trim(),
        hotline: newHotline.trim(),
        whatsapp: newPhone.trim().replace(/\D/g, ''),
        workingHoursAr: newWorkingHours.trim() || (new24Hours ? 'مفتوح 24 ساعة' : 'يومياً'),
        workingHoursEn: newWorkingHours.trim() || (new24Hours ? '24/7 Open' : 'Daily'),
        isOpen24Hours: new24Hours,
        hasHomeSampleService: newHomeSample,
        rating: 5,
        notesAr: newNotesAr.trim(),
        contributedBy: 'MediLab Community User'
      }

      const res = await fetch('/api/obour-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const data = await res.json()
        if (data.facility) {
          setFacilities(prev => [data.facility, ...prev])
        }
        setAddSuccess(true)
        setTimeout(() => {
          setAddSuccess(false)
          setShowAddModal(false)
          setNewNameAr('')
          setNewNameEn('')
          setNewAddressAr('')
          setNewLandmarkAr('')
          setNewPhone('')
          setNewHotline('')
          setNewWorkingHours('')
          setNewNotesAr('')
          setNewHomeSample(false)
          setNew24Hours(false)
        }, 1200)
      } else {
        alert('Could not save facility, please check required fields.')
      }
    } catch (err: any) {
      console.error(err)
      alert('Error saving facility: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`space-y-6 ${embedded ? '' : 'p-4 sm:p-6 max-w-7xl mx-auto'}`}>
      
      {/* Hero Wikipedia Banner for Obour City */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 border border-blue-500/20 shadow-2xl">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                <span>{isAr ? 'دليل مدينة العبور الطبي الموثق' : 'Obour City Verified Medical Directory'}</span>
              </span>
              <span className="text-xs text-slate-400 font-bold">
                {isAr ? 'القاهرة الكبرى / محافظة القليوبية' : 'Greater Cairo / Qalyubia'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:brightness-110 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <span>➕</span>
                <span>{isAr ? 'إضافة أو ترشيح معمل / مركز طبي' : '+ Add / Recommend Medical Facility'}</span>
              </button>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="max-w-3xl space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>🏙️</span>
              <span>{isAr ? 'ويكيبيديا ودليل العبور الطبي الشامل' : 'Obour City Medical Wikipedia & Guide'}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed" dir="auto">
              {isAr
                ? 'قاعدة بيانات حقيقية وموثقة من خرائط جوجل والمصادر الميدانية لمدينة العبور: عناوين المعامل ومراكز الأشعة والمستشفيات، الخطوط الساخنة، أرقام الواتساب، وخدمات السحب المنزلي لتنسيق الفحوصات بين الطبيب والمريض.'
                : 'Real, verified geographical medical directory for Obour City: Diagnostic labs, imaging centers, hospitals, 24/7 pharmacies, hotlines, WhatsApp booking, and home sample visits.'}
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-4 border-t border-white/10">
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? 'معامل تحاليل' : 'Labs'}</span>
              <span className="text-xl font-black text-cyan-400">🧪 {labsCount}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? 'مراكز أشعة' : 'Radiology'}</span>
              <span className="text-xl font-black text-indigo-400">🩻 {radiologyCount}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? 'مستشفيات كبرى' : 'Hospitals'}</span>
              <span className="text-xl font-black text-emerald-400">🏥 {hospitalsCount}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? 'صيدليات 24/7' : 'Pharmacies'}</span>
              <span className="text-xl font-black text-amber-400">💊 {pharmaciesCount}</span>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">{isAr ? 'إضافات المجتمع' : 'Community'}</span>
              <span className="text-xl font-black text-purple-400">👥 {communityCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Test Context Alert (if invoked from doctor or prescription) */}
      {selectedTestName && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">
                {isAr ? 'الفحص المطلوب حله حالياً:' : 'Target Medical Test to Route:'}
              </p>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white">{selectedTestName}</h4>
            </div>
          </div>
          <span className="text-xs font-bold text-gray-500">
            {isAr ? 'اختر أي معمل أو مركز بالأسفل للربط الفوري' : 'Pick any facility below to link'}
          </span>
        </div>
      )}

      {/* Search, Filter & View Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        
        {/* Search Input & View Mode Switcher */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'ابحث باسم المعمل، المركز الطبي، الحي، أو الشارع في العبور...' : 'Search by facility name, district, landmark, or street in Obour...'}
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {/* View Mode Buttons */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title="Consolidated Table View"
              >
                <span>📊</span>
                <span>{isAr ? 'جدول البيانات الموحد' : 'Data Table'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                title="Cards Grid View"
              >
                <span>🗂️</span>
                <span>{isAr ? 'بطاقات' : 'Cards'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'all'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {isAr ? `الكل (${facilities.length})` : `All (${facilities.length})`}
          </button>
          {FACILITY_CATEGORIES.map(cat => {
            const count = facilities.filter(f => f.category === cat.id).length
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{isAr ? cat.labelAr : cat.labelEn}</span>
                <span className="text-[10px] opacity-75 font-normal">({count})</span>
              </button>
            )
          })}
        </div>

        {/* District Filter Chips & Feature Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <span className="text-xs font-black text-gray-400 mr-1 shrink-0">{isAr ? 'الأحياء:' : 'Districts:'}</span>
            <button
              type="button"
              onClick={() => setSelectedDistrict('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                selectedDistrict === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              {isAr ? 'كافة الأحياء' : 'All Districts'}
            </button>
            {OBOUR_DISTRICTS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDistrict(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  selectedDistrict === d
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Feature toggles */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterHomeSample}
                onChange={e => setFilterHomeSample(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span>🚗 {isAr ? 'سحب منزلي' : 'Home Sample'}</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterOpen24Hours}
                onChange={e => setFilterOpen24Hours(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span>🌙 {isAr ? 'مفتوح 24 ساعة' : '24/7 Open'}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Directory Content: Table View vs Cards View */}
      {filteredFacilities.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 space-y-3">
          <span className="text-4xl block">🔍</span>
          <h3 className="font-bold text-gray-800 dark:text-gray-200 text-base">
            {isAr ? 'لم يتم العثور على منشآت مطابقة للبحث' : 'No medical facilities found matching criteria'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {isAr
              ? 'هل تعرف معملاً أو مركزاً في هذا الحي؟ يمكنك إضافته الآن ليظهر فوراً لكافة مستخدمي وأطباء التطبيق!'
              : 'Know a lab or hospital in this area? Add it now to share with all MediLab users and doctors!'}
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
          >
            + {isAr ? 'إضافة معمل أو مركز طبي الآن' : 'Add Facility Now'}
          </button>
        </div>
      ) : viewMode === 'table' ? (
        
        /* ─── CONSOLIDATED DATABASE TABLE VIEW ─────────────────────────── */
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-800 text-[11px] font-black uppercase text-gray-500 tracking-wider">
                  <th className="px-5 py-3.5">{isAr ? 'المنشأة الطبية' : 'Medical Facility'}</th>
                  <th className="px-4 py-3.5">{isAr ? 'الحي والعنوان' : 'District & Address'}</th>
                  <th className="px-4 py-3.5">{isAr ? 'أرقام التواصل والخط الساخن' : 'Contact & Hotlines'}</th>
                  <th className="px-4 py-3.5">{isAr ? 'مواعيد العمل والخدمات' : 'Hours & Badges'}</th>
                  <th className="px-4 py-3.5 text-right">{isAr ? 'الإجراءات والتنسيق' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-xs">
                {filteredFacilities.map((f) => {
                  const catObj = FACILITY_CATEGORIES.find(c => c.id === f.category)
                  const waNumber = (f.whatsapp || f.phone || '').replace(/\D/g, '')
                  const waMessage = `مرحباً ${f.nameAr}، أود الاستفسار والحجز بفرعكم بمدينة العبور (${f.district}) بناءً على توصية الطبيب عبر منصة MediLab.`
                  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : null

                  return (
                    <tr key={f.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors group">
                      
                      {/* Name & Type */}
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xl p-2 rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0">
                            {catObj?.icon || '🏥'}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-black text-gray-900 dark:text-white text-sm">
                                {isAr ? f.nameAr : f.nameEn}
                              </h4>
                              {f.isCommunityContributed && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                  {isAr ? 'إدخال مستخدم' : 'User Added'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-0.5">{isAr ? f.nameEn : f.nameAr}</p>
                            <div className="flex items-center gap-1 mt-1 text-amber-500 font-bold text-[11px]">
                              <span>★ {f.rating.toFixed(1)}</span>
                              <span className="text-gray-400 font-normal">({f.reviewsCount} {isAr ? 'تقييم' : 'reviews'})</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* District & Address */}
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1">
                          <span className="inline-block px-2 py-0.5 rounded-md font-bold text-[10px] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                            📍 {f.district}
                          </span>
                          <p className="text-gray-700 dark:text-gray-300 text-xs font-medium leading-relaxed" dir="auto">
                            {isAr ? f.addressAr : f.addressEn}
                          </p>
                          {f.landmarkAr && (
                            <p className="text-[10px] text-gray-400" dir="auto">
                              🏷️ {f.landmarkAr}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Contacts */}
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1.5">
                          {f.hotline && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black uppercase text-gray-400">Hotline:</span>
                              <span className="font-black text-blue-600 dark:text-blue-400 text-xs">{f.hotline}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(f.hotline!)}
                                className="text-[10px] text-gray-400 hover:text-blue-600"
                                title="Copy Hotline"
                              >
                                {copiedPhone === f.hotline ? '✓' : '📋'}
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-gray-800 dark:text-gray-200 font-bold">
                            {f.phoneDisplay}
                          </p>
                        </div>
                      </td>

                      {/* Badges & Hours */}
                      <td className="px-4 py-4 align-top">
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-gray-500 font-medium">
                            🕒 {isAr ? f.workingHoursAr : f.workingHoursEn}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {f.isOpen24Hours && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                                🌙 24/7 Open
                              </span>
                            )}
                            {f.hasHomeSampleService && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300">
                                🚗 {isAr ? 'سحب منزلي' : 'Home Draw'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          {onSelectFacilityForTest && (
                            <button
                              type="button"
                              onClick={() => onSelectFacilityForTest(f)}
                              className="w-full py-1.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all text-center"
                            >
                              ✓ {isAr ? 'اختيار للفحص' : 'Select for Test'}
                            </button>
                          )}

                          <div className="flex items-center gap-1">
                            {waUrl && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] transition-colors"
                                title="WhatsApp Chat"
                              >
                                <WhatsAppIcon className="w-4 h-4" />
                              </a>
                            )}
                            {f.googleMapsUrl && (
                              <a
                                href={f.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors text-xs"
                                title="Google Maps"
                              >
                                🗺️
                              </a>
                            )}
                            <a
                              href={`tel:${f.hotline || f.phone}`}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-bold text-xs transition-colors"
                            >
                              📞 {isAr ? 'اتصال' : 'Call'}
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (

        /* ─── INTERACTIVE CARDS GRID VIEW ─────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFacilities.map((f) => {
            const catObj = FACILITY_CATEGORIES.find(c => c.id === f.category)
            const waNumber = (f.whatsapp || f.phone || '').replace(/\D/g, '')
            const waMessage = `مرحباً ${f.nameAr}، أود الاستفسار عن خدمات الفحص وحجز موعد بفرعكم بالعبور (${f.district}).`
            const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}` : null

            return (
              <div
                key={f.id}
                className="bg-white dark:bg-gray-900 rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-blue-500/40 transition-all flex flex-col justify-between space-y-4 group"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shrink-0">
                        {catObj?.icon || '🏥'}
                      </span>
                      <div>
                        <h4 className="font-black text-sm text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                          {isAr ? f.nameAr : f.nameEn}
                        </h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 mt-0.5 inline-block">
                          📍 {f.district}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-amber-500">★ {f.rating.toFixed(1)}</span>
                      <p className="text-[9px] text-gray-400">({f.reviewsCount})</p>
                    </div>
                  </div>

                  {/* Address & Landmark */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl space-y-1 text-xs">
                    <p className="text-gray-800 dark:text-gray-200 font-medium" dir="auto">
                      {isAr ? f.addressAr : f.addressEn}
                    </p>
                    {f.landmarkAr && (
                      <p className="text-[11px] text-gray-400" dir="auto">
                        🏷️ {f.landmarkAr}
                      </p>
                    )}
                  </div>

                  {/* Contacts & Hours */}
                  <div className="space-y-1 text-xs">
                    {f.hotline && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 font-bold">Hotline:</span>
                        <span className="font-black text-blue-600 dark:text-blue-400">{f.hotline}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                      <span>🕒 {isAr ? 'المواعيد:' : 'Hours:'}</span>
                      <span className="font-semibold">{isAr ? f.workingHoursAr : f.workingHoursEn}</span>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {f.isOpen24Hours && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                        🌙 24/7 Open
                      </span>
                    )}
                    {f.hasHomeSampleService && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300">
                        🚗 {isAr ? 'سحب منزلي' : 'Home Sample'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {onSelectFacilityForTest && (
                    <button
                      type="button"
                      onClick={() => onSelectFacilityForTest(f)}
                      className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-black text-xs shadow-md transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      <span>✓</span>
                      <span>{isAr ? 'اختيار هذا المركز للفحص وإخطار الطبيب' : 'Select for Test & Update Doctor'}</span>
                    </button>
                  )}

                  <div className="flex items-center gap-2">
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-3 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <WhatsAppIcon className="w-4 h-4 text-white" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                    {f.googleMapsUrl && (
                      <a
                        href={f.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-xs transition-colors shrink-0"
                        title="Google Maps"
                      >
                        🗺️ Maps
                      </a>
                    )}
                    <a
                      href={`tel:${f.hotline || f.phone}`}
                      className="p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-xl text-xs font-bold transition-colors shrink-0"
                    >
                      📞 Call
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── ADD FACILITY MODAL (CROWDSOURCED OBOUR DATABASE) ─────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xl border border-gray-100 dark:border-gray-800 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <div>
                <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <span>➕</span>
                  <span>{isAr ? 'إضافة أو ترشيح معمل / مركز طبي في العبور' : 'Add Medical Facility in Obour City'}</span>
                </h3>
                <p className="text-xs text-gray-400">
                  {isAr ? 'سيتم حفظ البيانات في قاعدة بيانات العبور الموحدة لتظهر لكافة المرضى والأطباء' : 'Data will be saved to the community directory for all users'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFacility} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'اسم المنشأة بالعربية *' : 'Facility Name (Arabic) *'}
                  </label>
                  <input
                    required
                    value={newNameAr}
                    onChange={e => setNewNameAr(e.target.value)}
                    placeholder="مثال: معمل كايرو لاب - سنتر الحجاز"
                    className="w-full rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'Facility Name (English)'}
                  </label>
                  <input
                    value={newNameEn}
                    onChange={e => setNewNameEn(e.target.value)}
                    placeholder="e.g. Cairo Lab - Hegaz Center"
                    className="w-full rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'التصنيف الطبي' : 'Category'}
                  </label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value as any)}
                    className="w-full rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
                  >
                    <option value="lab">🧪 معمل تحاليل طبية (Laboratory)</option>
                    <option value="radiology">🩻 مركز / قسم أشعة (Radiology)</option>
                    <option value="hospital">🏥 مستشفى متكامل (Hospital)</option>
                    <option value="pharmacy">💊 صيدلية 24 ساعة (Pharmacy)</option>
                    <option value="clinic">🩺 عيادات ومجمع طبي (Polyclinic)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'الحي بمدينة العبور' : 'District in Obour'}
                  </label>
                  <select
                    value={newDistrict}
                    onChange={e => setNewDistrict(e.target.value as any)}
                    className="w-full rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold"
                  >
                    {OBOUR_DISTRICTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                  {isAr ? 'العنوان التفصيلي بالعبور *' : 'Detailed Address *'}
                </label>
                <input
                  required
                  value={newAddressAr}
                  onChange={e => setNewAddressAr(e.target.value)}
                  placeholder="مثال: الحي الأول، محلية 5، سنتر الحجاز، الدور الثاني"
                  className="w-full rounded-xl px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                  {isAr ? 'علامة مميزة (أقرب مسجد، سنتر، مدرسة)' : 'Landmark'}
                </label>
                <input
                  value={newLandmarkAr}
                  onChange={e => setNewLandmarkAr(e.target.value)}
                  placeholder="مثال: بجوار قسم شرطة العبور وسنترال الحجاز"
                  className="w-full rounded-xl px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'رقم التليفون / موبايل واتساب' : 'Phone / WhatsApp'}
                  </label>
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                    {isAr ? 'الخط الساخن (إن وجد)' : 'Hotline'}
                  </label>
                  <input
                    value={newHotline}
                    onChange={e => setNewHotline(e.target.value)}
                    placeholder="مثال: 19014"
                    className="w-full rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHomeSample}
                    onChange={e => setNewHomeSample(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>🚗 {isAr ? 'يوفر خدمة سحب عينات منزلي' : 'Home Sample Available'}</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={new24Hours}
                    onChange={e => setNew24Hours(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>🌙 {isAr ? 'خدمة وطوارئ 24 ساعة' : 'Open 24/7'}</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-gray-500 mb-1">
                  {isAr ? 'ملاحظات وتوصيات للمرضى' : 'Recommendations & Tips'}
                </label>
                <textarea
                  value={newNotesAr}
                  onChange={e => setNewNotesAr(e.target.value)}
                  rows={2}
                  placeholder="مثال: سرعة في استلام النتائج، معتمد لدى التأمين الصحي..."
                  className="w-full rounded-xl p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs resize-none"
                />
              </div>

              {addSuccess && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold text-center">
                  ✓ {isAr ? 'تمت إضافة المنشأة الطبية بنجاح وتحديث قاعدة بيانات العبور!' : 'Facility added and saved to Obour Directory successfully!'}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black rounded-xl text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {submitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ وإضافة للموسوعة' : 'Save & Publish')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
