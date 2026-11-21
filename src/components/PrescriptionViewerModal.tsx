'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { getFormIcon, inferFormFromName } from './PrescriptionModal'
import PharmacyForwardModal from './PharmacyForwardModal'
import LabRadiologyModal, { LabOrder, PARTNER_LABS } from './LabRadiologyModal'

type PrescriptionViewerModalProps = {
  prescription: any
  patientName: string
  onClose: () => void
}

export default function PrescriptionViewerModal({ 
  prescription,
  patientName, 
  onClose
}: PrescriptionViewerModalProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [doctorInfo, setDoctorInfo] = useState<any>(null)
  const [showPharmacyModal, setShowPharmacyModal] = useState(false)
  const [takenMeds, setTakenMeds] = useState<Record<string, string>>({})
  const [patientId, setPatientId] = useState<string>('')
  const [selectedLabOrder, setSelectedLabOrder] = useState<LabOrder | null>(null)
  const [reminderSet, setReminderSet] = useState(false)

  // Extract any lab / diagnostic orders from doctor_notes
  const labOrders: LabOrder[] = (() => {
    const notes = prescription.doctor_notes || ''
    const match = notes.match(/\[LAB_ORDERS:\s*([\s\S]*?)\]/)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
    return []
  })()

  const handleSetReminder = async () => {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          new Notification('MediLab Medicine & Lab Reminder 🔔', {
            body: `Don't forget to take your prescribed medication and complete your required diagnostic tests!`,
            icon: '/favicon.ico'
          })
        }
      } catch {}
    }
    setReminderSet(true)
    setTimeout(() => setReminderSet(false), 3000)
  }

  useEffect(() => {
    try {
      const todayKey = `medilab_taken_${new Date().toISOString().slice(0, 10)}`
      const saved = localStorage.getItem(todayKey)
      if (saved) setTakenMeds(JSON.parse(saved))
    } catch {}

    const getPatient = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setPatientId(user.id)
    }
    getPatient()
  }, [])

  const handleToggleTakenMed = async (medName: string, idx: number) => {
    const key = `rx-${prescription.id}-${idx}`
    const isTaken = !!takenMeds[key]
    const nowISO = new Date().toISOString()
    const todayStr = nowISO.slice(0, 10)

    setTakenMeds(prev => {
      const next = { ...prev }
      if (isTaken) {
        delete next[key]
      } else {
        next[key] = nowISO
      }
      try {
        localStorage.setItem(`medilab_taken_${todayStr}`, JSON.stringify(next))
      } catch {}
      return next
    })

    if (!isTaken && patientId) {
      try {
        await fetch('/api/adherence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: patientId,
            prescription_id: prescription.id,
            medication_name: medName,
            slot: 'morning',
            taken_at: nowISO,
            scheduled_date: todayStr,
            confirmed_by: 'patient',
          })
        })
      } catch (err) {
        console.warn('Adherence log notice:', err)
      }
    }
  }

  useEffect(() => {
    const fetchDoctor = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('full_name, specialization, clinic_location, phone_number, email')
        .eq('id', prescription.doctor_id)
        .single()
      if (data) setDoctorInfo(data)
    }
    if (prescription?.doctor_id) {
      fetchDoctor()
    }
  }, [prescription?.doctor_id])

  const buildPrintContent = () => {
    const meds = prescription.medications || []
    const medicationsHtml = meds.length > 0
      ? meds.map((med: any) => {
        const form = med.form || inferFormFromName(med.name)
        const icon = getFormIcon(form)
        return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #f3f4f6;gap:16px;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;">${icon}</span>
              <span style="font-size:16px;font-weight:700;color:#111827;margin:0;">${med.name || ''}</span>
              <span style="font-size:10px;font-weight:700;color:#2563eb;background:#eff6ff;padding:2px 8px;border-radius:99px;text-transform:uppercase;">${form}</span>
            </div>
            ${med.dosage ? `<div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:4px;">Dosage: ${med.dosage}</div>` : ''}
          </div>
          <div style="flex:1;font-size:13px;color:#374151;background:#f9fafb;padding:10px 14px;border-radius:10px;text-align:right;direction:rtl;">${med.instructions || ''}</div>
        </div>
      `}).join('')
      : '<p style="color:#9ca3af;font-style:italic;text-align:center;padding:32px 0;">No medications prescribed.</p>'

    const dateStr = new Date(prescription.created_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    })

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#fff;color:#111827;width:794px;min-height:1123px;padding:64px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <!-- HEADER -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1d4ed8;padding-bottom:24px;margin-bottom:28px;">
            <div>
              <h1 style="font-size:26px;font-weight:900;color:#1e3a8a;margin:0;letter-spacing:-0.5px;">Dr. ${doctorInfo?.full_name || prescription.doctor_name || 'Doctor'}</h1>
              ${doctorInfo?.specialization ? `<p style="color:#2563eb;font-size:11px;font-weight:700;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px;">${doctorInfo.specialization}</p>` : ''}
            </div>
            <div style="text-align:right;font-size:11px;color:#6b7280;line-height:2.0;">
              ${doctorInfo?.clinic_location ? `<div>📍 ${doctorInfo.clinic_location}</div>` : ''}
              ${doctorInfo?.phone_number ? `<div>📞 ${doctorInfo.phone_number}</div>` : ''}
              ${doctorInfo?.email ? `<div>✉️ ${doctorInfo.email}</div>` : ''}
            </div>
          </div>

          <!-- PATIENT / DATE -->
          <div style="display:flex;justify-content:space-between;padding:12px 4px 16px;border-bottom:1px solid #e5e7eb;margin-bottom:32px;">
            <div>
              <div style="color:#9ca3af;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Patient Name</div>
              <div style="font-size:15px;font-weight:700;color:#111827;">${patientName}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:#9ca3af;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Date of Visit</div>
              <div style="font-size:15px;font-weight:700;color:#111827;">${dateStr}</div>
            </div>
          </div>

          <!-- Rx -->
          <div style="font-family:Georgia,serif;font-size:44px;font-style:italic;font-weight:900;color:#1e3a8a;margin-bottom:20px;line-height:1;">Rx</div>

          <!-- MEDICATIONS -->
          <div>
            ${medicationsHtml}
          </div>

          <!-- DIAGNOSTIC LAB ORDERS -->
          ${labOrders.length > 0 ? `
            <div style="margin-top:28px;padding-top:16px;border-top:2px dashed #06b6d4;">
              <h3 style="font-size:12px;font-weight:800;color:#0891b2;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">
                🧪 Required Diagnostic Tests & Scans / التحاليل والأشعة المطلوبة
              </h3>
              ${labOrders.map(lo => `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f3f4f6;">
                  <div>
                    <div style="font-size:14px;font-weight:700;color:#111827;">${lo.test_name}</div>
                    ${lo.instructions ? `<div style="font-size:11px;color:#4b5563;margin-top:2px;">Prep: ${lo.instructions}</div>` : ''}
                  </div>
                  <div style="font-size:10px;color:#0891b2;font-weight:700;background:#ecfeff;padding:2px 8px;border-radius:6px;text-transform:uppercase;">${lo.category}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- FOOTER -->
        <div style="margin-top:60px;border-top:1px solid #e5e7eb;padding-top:18px;text-align:center;">
          <p style="font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin:0;">MediLab Clinic Management System</p>
          <p style="font-size:9px;color:#9ca3af;font-weight:400;margin:4px 0 0;">This is a computer generated document. Consult your doctor for queries.</p>
        </div>
      </div>
    `
  }

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true)

    // Build a clean, isolated DOM element for pdf capture (not inside modal)
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
    wrapper.innerHTML = buildPrintContent()
    document.body.appendChild(wrapper)

    try {
      await new Promise(resolve => setTimeout(resolve, 100)) // allow DOM paint

      const canvas = await html2canvas(wrapper.firstElementChild as HTMLElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 794,
        windowWidth: 794
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`Prescription_${patientName.replace(/\s+/g, '_')}.pdf`)
    } catch (err) {
      console.error('PDF generation error:', err)
      alert('PDF generation failed. Please use the Print button instead.')
    } finally {
      document.body.removeChild(wrapper)
      setIsGeneratingPdf(false)
    }
  }

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'width=900,height=1100')
    if (!printWin) return
    printWin.document.write(`
      <!DOCTYPE html><html><head>
        <title>Prescription - ${patientName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: white; }
          @media print { @page { size: A4; margin: 0; } }
        </style>
      </head><body>
        ${buildPrintContent()}
        <script>window.onload = function(){ window.print(); window.close(); }<\/script>
      </body></html>
    `)
    printWin.document.close()
  }

  const meds = prescription.medications || []
  const dateStr = prescription.created_at 
    ? new Date(prescription.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-gray-100 dark:bg-gray-950 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">

        {/* Action Bar */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-10 flex-wrap gap-2">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Prescription Preview</h2>
          <div className="flex gap-2 flex-wrap items-center">
            {labOrders.length > 0 && (
              <button
                onClick={() => setSelectedLabOrder(labOrders[0])}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-md"
                title="Book nearest lab or radiology scan center via WhatsApp"
              >
                <span>🧪</span>
                <span>Book Lab Tests ({labOrders.length})</span>
              </button>
            )}
            <button
              onClick={handleSetReminder}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-sm"
              title="Set notification reminder to buy medicines and complete tests"
            >
              <span>🔔</span>
              <span>{reminderSet ? '✓ Reminder Scheduled!' : 'Remind Me'}</span>
            </button>
            <button
              onClick={() => setShowPharmacyModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-md"
              title="Forward prescription to partner pharmacy via WhatsApp"
            >
              <span>📦</span>
              <span>Order from Pharmacy</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md disabled:opacity-60"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {isGeneratingPdf ? 'Generating…' : 'Download PDF'}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print
            </button>
            <button onClick={onClose} className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview Panel — scrollable */}
        <div className="overflow-y-auto flex-1 bg-gray-200/70 dark:bg-gray-900/50 p-6">
          {/* A4 Paper */}
          <div className="bg-white text-gray-900 mx-auto shadow-xl p-10 flex flex-col" style={{ width: '100%', maxWidth: '595px', minHeight: '842px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

            {/* Header */}
            <div className="flex justify-between items-start border-b-[3px] border-blue-700 pb-5 mb-5">
              <div>
                <h1 className="text-xl font-black text-blue-900 tracking-tight">
                  Dr. {doctorInfo?.full_name || 'Loading…'}
                </h1>
                {doctorInfo?.specialization && (
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[2px] mt-1">
                    {doctorInfo.specialization}
                  </p>
                )}
              </div>
              <div className="text-right text-[11px] text-gray-500 space-y-0.5 font-medium leading-relaxed">
                {doctorInfo?.clinic_location && <p>📍 {doctorInfo.clinic_location}</p>}
                {doctorInfo?.phone_number && <p>📞 {doctorInfo.phone_number}</p>}
                {doctorInfo?.email && <p>✉️ {doctorInfo.email}</p>}
              </div>
            </div>

            {/* Patient Info */}
            <div className="flex justify-between items-start border-b border-gray-100 pb-4 mb-7 text-sm">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Patient Name</p>
                <p className="font-bold text-gray-900">{patientName}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Date of Visit</p>
                <p className="font-bold text-gray-900">{dateStr}</p>
              </div>
            </div>

            {/* Rx Symbol */}
            <p className="text-4xl font-black italic text-blue-900 mb-5" style={{ fontFamily: 'Georgia, serif' }}>Rx</p>

            {/* Medications */}
            <div className="flex-1 space-y-0">
              {meds.length === 0 && (
                <p className="text-gray-400 italic text-center py-10">No medications prescribed.</p>
              )}
              {meds.map((med: any, idx: number) => {
                const form = med.form || inferFormFromName(med.name)
                const key = `rx-${prescription.id}-${idx}`
                const isTaken = !!takenMeds[key]
                return (
                  <div key={idx} className="flex items-start justify-between gap-4 py-4 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{getFormIcon(form)}</span>
                        <p className={`font-bold ${isTaken ? 'line-through text-gray-400' : 'text-gray-900'}`}>{med.name}</p>
                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {form}
                        </span>
                      </div>
                      {med.dosage && <p className="text-xs text-blue-600 font-semibold mt-0.5">Dosage: {med.dosage}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      {med.instructions && (
                        <p className="inline-block bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-xs text-gray-700 font-medium leading-snug text-left min-w-[140px]" dir="auto">
                          {med.instructions}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleTakenMed(med.name, idx)}
                        className={`px-3 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                          isTaken
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                        }`}
                      >
                        <span>{isTaken ? '✓' : '💊'}</span>
                        <span>{isTaken ? 'Taken (تم التناول)' : 'I Took This Dose'}</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Diagnostic Tests & Radiology Scans */}
            {labOrders.length > 0 && (
              <div className="mt-6 pt-5 border-t-2 border-dashed border-cyan-300 dark:border-cyan-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🧪</span>
                    <h3 className="font-black text-xs uppercase tracking-wider text-cyan-900 dark:text-cyan-300">
                      Required Tests & Radiology Scans (التحاليل والأشعة المطلوبة)
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLabOrder(labOrders[0])}
                    className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-[11px] font-bold transition-all shadow-sm flex items-center gap-1"
                  >
                    <span>🏥</span>
                    <span>Book Nearest Lab (حجز المعمل)</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {labOrders.map((lo, idx) => {
                    const partner = PARTNER_LABS.find(p => p.id === lo.preferred_lab) || PARTNER_LABS[0]
                    return (
                      <div key={idx} className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-2xl border border-cyan-200/60 dark:border-cyan-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs sm:text-sm text-gray-900 dark:text-white">{lo.test_name}</span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300 uppercase">
                              {lo.category}
                            </span>
                            {lo.priority === 'urgent' && (
                              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 uppercase animate-pulse">
                                🚨 Urgent
                              </span>
                            )}
                          </div>
                          {lo.instructions && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1" dir="auto">
                              <span className="font-bold text-gray-400">Preparation: </span>{lo.instructions}
                            </p>
                          )}
                          <p className="text-[10px] text-cyan-700 dark:text-cyan-400 mt-0.5">
                            Recommended: <strong>{partner.nameEn}</strong> (Hotline: {partner.hotline})
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedLabOrder(lo)}
                          className="px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shrink-0 text-center"
                        >
                          Book via WhatsApp
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-auto border-t border-gray-100 pt-5 text-center">
              <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">MediLab Clinic Management System</p>
              <p className="text-[8px] text-gray-400 mt-0.5">Computer generated document — consult your doctor for queries.</p>
            </div>
          </div>
        </div>

      </div>

      {showPharmacyModal && (
        <PharmacyForwardModal
          prescription={prescription}
          patientName={patientName}
          onClose={() => setShowPharmacyModal(false)}
          onDownloadPdf={handleDownloadPdf}
        />
      )}

      {selectedLabOrder && (
        <LabRadiologyModal
          order={selectedLabOrder}
          patientName={patientName}
          onClose={() => setSelectedLabOrder(null)}
        />
      )}
    </div>
  )
}
