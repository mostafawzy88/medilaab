'use client'

import { useTranslations } from 'next-intl'

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
  const t = useTranslations('Dashboard')

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in print:bg-white print:p-0">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800 print:shadow-none print:border-none print:w-full print:max-h-full print:overflow-visible text-gray-900 dark:text-gray-100 print:text-black">
        
        {/* Header - Hide print button when printing */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10 print:hidden">
          <h2 className="text-xl font-bold">{t('view_prescription')} - {patientName}</h2>
          <div className="flex gap-2">
            <button 
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              {t('print_prescription')}
            </button>
            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Print Header (Only visible when printing) */}
        <div className="hidden print:block p-8 border-b-2 border-slate-200 mb-8 pb-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-blue-700">MEDILAB</h1>
              <p className="text-sm text-gray-500 mt-1">Official Clinical Prescription</p>
            </div>
            <div className="text-right text-sm">
              <p><strong>Patient:</strong> {patientName}</p>
              <p><strong>Date:</strong> {new Date(prescription.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          {/* Diagnosis */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Diagnosis</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 print:bg-white print:border-gray-300">
              <p className="text-lg font-medium">{prescription.diagnosis || 'No specific diagnosis recorded.'}</p>
            </div>
          </div>

          {/* Medications */}
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Medications</h3>
            <div className="space-y-4">
              {prescription.medications && prescription.medications.map((med: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row gap-4 p-4 border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 rounded-r-xl print:bg-white print:border-l-4 print:border-gray-800">
                  <div className="flex-1">
                    <p className="font-bold text-lg text-blue-900 dark:text-blue-100 print:text-black">{med.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium mt-1">Dosage: {med.dosage}</p>
                  </div>
                  <div className="flex-1 rtl text-right sm:text-left sm:rtl:text-right" dir="auto">
                    <p className="bg-white dark:bg-gray-900/50 p-3 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-900/30 print:border-dashed print:border-gray-300 print:bg-transparent">
                      {med.instructions}
                    </p>
                  </div>
                </div>
              ))}
              {(!prescription.medications || prescription.medications.length === 0) && (
                <p className="text-gray-500 italic">No medications prescribed.</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {prescription.notes && (
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Doctor Notes</h3>
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-100 dark:border-yellow-900/30 print:bg-white print:border-gray-300">
                <p className="text-md" dir="auto">{prescription.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Print Footer */}
        <div className="hidden print:block fixed bottom-0 left-0 w-full p-8 text-center text-xs text-gray-400 border-t border-gray-200 mt-20">
          Generated automatically by Medilab Clinic Management System. 
        </div>

      </div>
    </div>
  )
}
