'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

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
      ? meds.map((med: any) => `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #f3f4f6;gap:16px;">
          <div style="flex:1;">
            <div style="font-size:16px;font-weight:700;color:#111827;margin:0;">${med.name || ''}</div>
            ${med.dosage ? `<div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:4px;">Dosage: ${med.dosage}</div>` : ''}
          </div>
          <div style="flex:1;font-size:13px;color:#374151;background:#f9fafb;padding:10px 14px;border-radius:10px;text-align:right;direction:rtl;">${med.instructions || ''}</div>
        </div>
      `).join('')
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
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white/80 dark:bg-gray-900/80 backdrop-blur-md sticky top-0 z-10">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Prescription Preview</h2>
          <div className="flex gap-2">
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
              {meds.map((med: any, idx: number) => (
                <div key={idx} className="flex items-start justify-between gap-4 py-4 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{med.name}</p>
                    {med.dosage && <p className="text-xs text-blue-600 font-semibold mt-0.5">Dosage: {med.dosage}</p>}
                  </div>
                  <div className="flex-1 text-right" dir="auto">
                    <p className="inline-block bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 font-medium leading-snug text-left min-w-[160px]">
                      {med.instructions}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-auto border-t border-gray-100 pt-5 text-center">
              <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400">MediLab Clinic Management System</p>
              <p className="text-[8px] text-gray-400 mt-0.5">Computer generated document — consult your doctor for queries.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
