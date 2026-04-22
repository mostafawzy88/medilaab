'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from '@/utils/pricing'
import LogoutButton from './LogoutButton'

type AdminSettings = {
  instapay_address: string | null
  payment_link: string | null
  bank_details: string | null
}

export default function SubscriptionRenewal({ 
  userId, 
  initialSettings 
}: { 
  userId: string, 
  initialSettings: AdminSettings 
}) {
  const [step, setStep] = useState<'plans' | 'payment' | 'pending'>('plans')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [months, setMonths] = useState(1)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan)
    setStep('payment')
  }

  const handleUploadReceipt = async () => {
    if (!receipt || !selectedPlan) return

    setUploading(true)
    const supabase = createClient()
    
    // 1. Upload receipt to storage
    const fileExt = receipt.name.split('.').pop()
    const fileName = `${userId}-${Date.now()}.${fileExt}`
    const filePath = `receipts/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, receipt)

    if (uploadError) {
      alert('Error uploading receipt: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(filePath)

    // 2. Create payment record
    const totalAmount = selectedPlan.price * months * (1 - selectedPlan.discount / 100)
    
    const { error: dbError } = await supabase
      .from('subscription_payments')
      .insert({
        user_id: userId,
        plan_id: selectedPlan.id,
        duration_months: months,
        amount: totalAmount,
        receipt_url: publicUrl,
        status: 'pending'
      })

    if (dbError) {
      alert('Error submitting payment: ' + dbError.message)
    } else {
      setStep('pending')
    }
    setUploading(false)
  }

  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const address = initialSettings.instapay_address || 'medilab@instapay'
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (step === 'pending') {
    return (
      <div className="bg-white dark:bg-gray-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-blue-100 dark:border-blue-900/30 animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-3xl font-black mb-3 text-gray-900 dark:text-white">Payment Received</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg leading-relaxed">
          Your receipt has been uploaded and is being reviewed by our team. 
          Your account will be activated shortly after verification.
        </p>
        <div className="flex justify-center">
          <LogoutButton />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black text-gray-900 dark:text-white">Renew Your Subscription</h1>
        <p className="text-gray-500 text-lg">Choose a plan that fits your clinic's needs</p>
      </div>

      {step === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SUBSCRIPTION_PLANS.map((plan) => (
            <div key={plan.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border-2 border-gray-100 dark:border-gray-800 hover:border-blue-500 transition-all flex flex-col h-full shadow-sm">
              <div className="mb-6">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-${plan.color}-100 text-${plan.color}-600 mb-4 inline-block`}>
                  {plan.name}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-gray-400 font-bold text-sm">EGP/mo</span>
                </div>
                {plan.discount > 0 && (
                  <p className="text-emerald-500 text-xs font-bold mt-1">✓ Save {plan.discount}% on multi-staff accounts</p>
                )}
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <svg className={`w-5 h-5 text-${plan.color}-500 shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => handleSelectPlan(plan)}
                className={`w-full py-4 rounded-2xl font-black text-sm transition-all bg-${plan.color}-600 text-white shadow-lg shadow-${plan.color}-500/20 hover:scale-[1.02]`}
              >
                Select {plan.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {step === 'payment' && selectedPlan && (
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-[2.5rem] p-10 border border-gray-100 dark:border-gray-800 shadow-xl">
          <button onClick={() => setStep('plans')} className="text-sm font-bold text-blue-600 mb-6 flex items-center gap-1 hover:underline">
            ← Change Plan
          </button>
          
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">Finalize Payment</h2>
                <p className="text-sm text-gray-500">Selected: <span className="font-bold text-gray-900 dark:text-white">{selectedPlan.name}</span></p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black">{selectedPlan.price * months * (1 - selectedPlan.discount / 100)} EGP</div>
                <div className="text-xs text-gray-400 font-bold">Total for {months} month{months > 1 ? 's' : ''}</div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-gray-400 px-1">How many months?</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 3, 6, 12].map(m => (
                  <button 
                    key={m} 
                    onClick={() => setMonths(m)}
                    className={`py-3 rounded-xl font-bold text-sm border-2 transition-all ${months === m ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-3xl p-6 space-y-4">
              <h3 className="text-sm font-black text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                InstaPay Instructions
              </h3>
              <p className="text-sm text-blue-700/80 dark:text-blue-400/80">
                Please transfer the total amount to the following InstaPay address. Once completed, upload a screenshot of the confirmation.
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 flex items-center justify-between border border-blue-100 dark:border-blue-900/50">
                <span className="font-mono font-bold text-blue-900 dark:text-blue-100">{initialSettings.instapay_address || 'medilab@instapay'}</span>
                <button 
                  onClick={handleCopy} 
                  className={`text-xs font-black uppercase transition-all ${copied ? 'text-green-600 scale-110' : 'text-blue-600 hover:underline'}`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-widest text-gray-400 px-1">Upload Receipt</label>
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={e => setReceipt(e.target.files?.[0] || null)}
                  className="hidden" 
                  id="receipt-upload" 
                />
                <label 
                  htmlFor="receipt-upload"
                  className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all group"
                >
                  {receipt ? (
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">✓</div>
                      <div className="text-left">
                        <p className="text-sm font-bold">{receipt.name}</p>
                        <p className="text-xs text-gray-400">Click to change</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-xl flex items-center justify-center group-hover:text-blue-500 group-hover:scale-110 transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </div>
                      <p className="text-sm font-bold text-gray-500">Click to upload payment screenshot</p>
                    </>
                  )}
                </label>
              </div>
            </div>

            <button 
              onClick={handleUploadReceipt}
              disabled={!receipt || uploading}
              className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/30 hover:scale-[1.01] transition-all disabled:opacity-50"
            >
              {uploading ? 'Submitting...' : 'Submit Payment Proof'}
            </button>
            <div className="flex justify-center">
              <LogoutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
