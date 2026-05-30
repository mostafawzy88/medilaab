'use client'

import { useState, useEffect, useRef } from 'react'
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
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchDoctor = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('full_name, specialization, clinic_location, phone_number, email')
        .eq('id', prescription.doctor_id)
        .single()
      if (data) {
        setDoctorInfo(data)
      }
    }
    if (prescription?.doctor_id) {
      fetchDoctor()
    }
  }, [prescription?.doctor_id])

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPdf = async () => {
    if (!pdfRef.current) return
    setIsGeneratingPdf(true)
    
    // Give state time to update the DOM
    setTimeout(async () => {
      try {
        const element = pdfRef.current!
        const canvas = await html2canvas(element, {
          scale: 2, // High resolution
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false
        })
        
        const imgData = canvas.toDataURL('image/png')
        
        // A4 size: 210 x 297 mm
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
        pdf.save(`Prescription_${patientName.replace(/\s+/g, '_')}.pdf`)
      } catch (error) {
        console.error("Failed to generate PDF", error)
      } finally {
        setIsGeneratingPdf(false)
      }
    }, 150)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in print:bg-white print:p-0">
      <div 
        className="bg-gray-100 dark:bg-gray-950 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800 print:shadow-none print:border-none print:w-full print:max-h-full print:overflow-visible flex flex-col"
      >
        {/* Top Sticky Bar - Hide when printing */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-gray-100/90 dark:bg-gray-950/90 backdrop-blur-md z-10 print:hidden">
          <h2 className="text-md font-bold text-gray-800 dark:text-gray-200">Prescription Viewer</h2>
          <div className="flex gap-2">
            <button 
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 text-sm shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              {isGeneratingPdf ? 'Generating...' : 'Download PDF'}
            </button>
            <button 
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm shadow-md"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Print
            </button>
            <button onClick={onClose} className="p-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-700 dark:text-gray-300">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Scrollable Container with Sheet */}
        <div className="p-4 md:p-8 bg-gray-200/50 dark:bg-gray-900/50 flex-1 print:bg-white print:p-0">
          {/* Printable A4 Paper Layout (Always Light Mode) */}
          <div 
            ref={pdfRef}
            className="bg-white text-gray-900 p-8 md:p-12 font-sans mx-auto shadow-lg print:shadow-none print:p-0 flex flex-col justify-between"
            style={{ 
              width: '100%', 
              maxWidth: '210mm', 
              minHeight: '297mm', 
              boxSizing: 'border-box',
              aspectRatio: '1 / 1.414'
            }}
          >
            {/* Upper Content */}
            <div>
              {/* Header: Doctor Details */}
              <div className="flex justify-between items-start border-b-2 border-blue-600 pb-6 mb-6">
                <div>
                  <h1 className="text-2xl font-extrabold text-blue-900 tracking-tight">
                    Dr. {doctorInfo?.full_name || 'Clinic Doctor'}
                  </h1>
                  {doctorInfo?.specialization && (
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">
                      {doctorInfo.specialization}
                    </p>
                  )}
                </div>
                <div className="text-right text-[11px] text-gray-500 space-y-0.5 font-medium">
                  {doctorInfo?.clinic_location && <p>📍 {doctorInfo.clinic_location}</p>}
                  {doctorInfo?.phone_number && <p>📞 {doctorInfo.phone_number}</p>}
                  {doctorInfo?.email && <p>✉️ {doctorInfo.email}</p>}
                </div>
              </div>

              {/* Patient Info */}
              <div className="grid grid-cols-2 gap-4 py-4 px-1 border-b border-gray-100 mb-8 text-xs font-semibold">
                <div>
                  <span className="text-gray-400 uppercase tracking-wider block text-[9px] mb-0.5">Patient Name</span>
                  <span className="text-sm font-bold text-gray-800">{patientName}</span>
                </div>
                <div className="text-right">
                  <span className="text-gray-400 uppercase tracking-wider block text-[9px] mb-0.5">Date of Visit</span>
                  <span className="text-sm font-bold text-gray-800">
                    {new Date(prescription.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
              </div>

              {/* Rx Symbol */}
              <div className="mb-6 select-none opacity-90 px-1">
                <span className="text-4xl font-serif italic font-extrabold text-blue-900">Rx</span>
              </div>

              {/* Medications List */}
              <div className="space-y-5 px-1">
                {prescription.medications && prescription.medications.map((med: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start border-b border-gray-50 pb-4 last:border-b-0">
                    <div className="flex-1">
                      <p className="font-bold text-base text-gray-800">{med.name}</p>
                      <p className="text-xs font-bold text-blue-600 mt-0.5">Dosage: {med.dosage}</p>
                    </div>
                    <div className="flex-1 text-right" dir="auto">
                      <p className="text-sm text-gray-700 bg-gray-50 p-2.5 rounded-xl border border-gray-100/80 inline-block text-left min-w-[180px] font-medium leading-relaxed">
                        {med.instructions}
                      </p>
                    </div>
                  </div>
                ))}
                {(!prescription.medications || prescription.medications.length === 0) && (
                  <p className="text-gray-400 italic text-center py-8">No medications prescribed.</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 pt-6 mt-12 text-center text-[9px] text-gray-400 font-medium">
              <p className="font-bold uppercase tracking-widest mb-0.5 text-gray-500">Medilab Clinic Management</p>
              <p>This is a computer generated document. Consult your doctor for queries.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
