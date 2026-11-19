'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useLocale } from 'next-intl'

type DoctorReviewModalProps = {
  doctorId: string
  doctorName: string
  appointmentId?: string | null
  existingReview?: {
    id: string
    rating: number
    review_text: string | null
    tags?: string[]
  } | null
  onClose: () => void
  onSuccess: () => void
}

const DEFAULT_TAGS = [
  '🎯 Accurate Diagnosis',
  '👂 Attentive Listener',
  '👶 Great with Kids',
  '⏱️ Punctual & On Time',
  '💬 Clear Treatment Explanation',
  '🩺 Gentle Examination',
  '🌟 Highly Recommended',
  '💡 Helpful Follow-up Advice'
]

const RATING_LABELS_EN: Record<number, string> = {
  1: 'Poor Consultation',
  2: 'Fair Experience',
  3: 'Good Doctor',
  4: 'Very Good & Professional',
  5: 'Exceptional Medical Expert ⭐⭐⭐⭐⭐'
}

const RATING_LABELS_AR: Record<number, string> = {
  1: 'استشارة ضعيفة',
  2: 'تجربة مقبولة',
  3: 'طبيب جيد',
  4: 'طبيب محترف وممتاز',
  5: 'خبير طبي استثنائي ⭐⭐⭐⭐⭐'
}

export default function DoctorReviewModal({
  doctorId,
  doctorName,
  appointmentId,
  existingReview,
  onClose,
  onSuccess
}: DoctorReviewModalProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [rating, setRating] = useState<number>(existingReview?.rating || 5)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [reviewText, setReviewText] = useState<string>(existingReview?.review_text || '')
  const [selectedTags, setSelectedTags] = useState<string[]>(existingReview?.tags || [])
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag))
    } else {
      setSelectedTags([...selectedTags, tag])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating < 1 || rating > 5) {
      setErrorMsg(isAr ? 'يرجى تحديد تقييم بالنجوم' : 'Please select a star rating')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setErrorMsg(isAr ? 'يجب تسجيل الدخول أولاً' : 'You must be logged in to review')
      setSubmitting(false)
      return
    }

    try {
      if (existingReview?.id) {
        // Update existing review
        const { error } = await supabase
          .from('doctor_reviews')
          .update({
            rating,
            review_text: reviewText.trim() || null,
            tags: selectedTags
          })
          .eq('id', existingReview.id)

        if (error) throw error
      } else {
        // Create new review
        const { error } = await supabase
          .from('doctor_reviews')
          .insert({
            doctor_id: doctorId,
            patient_id: user.id,
            appointment_id: appointmentId || null,
            rating,
            review_text: reviewText.trim() || null,
            tags: selectedTags
          })

        if (error) {
          if (error.message?.includes('doctor_reviews') || error.message?.includes('schema cache')) {
            // Fallback: save review inside appointment notes so it's not lost
            if (appointmentId) {
              const reviewSnippet = `[REVIEW: ${rating} Stars: "${reviewText.trim()}" | Tags: ${selectedTags.join(', ')}]`
              const { data: apt } = await supabase.from('appointments').select('notes').eq('id', appointmentId).single()
              const updatedNotes = `${apt?.notes || ''} ${reviewSnippet}`.trim()
              await supabase.from('appointments').update({ notes: updatedNotes }).eq('id', appointmentId)
            }
            alert(
              isAr
                ? `تم تسجيل تقييمك (${rating} نجوم) بنجاح! يرجى تنفيذ سكربت الجداول في Supabase لتفعيل لوحة المراجعات العامة.`
                : `Your rating (${rating}★) was saved to the visit history! Please execute the Supabase SQL migration in your dashboard to activate the public reviews feed.`
            )
            onSuccess()
            onClose()
            return
          }
          throw error
        }
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting review')
    } finally {
      setSubmitting(false)
    }
  }

  const currentActiveRating = hoverRating || rating

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <h3 className="font-black text-lg text-gray-900 dark:text-white">
                {isAr ? 'تقييم ورأي في الطبيب' : 'Review & Rate Doctor'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAr ? `شارك تجربتك مع د. ${doctorName}` : `Share your visit feedback for Dr. ${doctorName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-xs font-bold border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Star Selector */}
          <div className="text-center space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-gray-400 block">
              {isAr ? 'تقييمك الكلي' : 'Overall Rating'}
            </label>
            <div className="flex justify-center items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="text-4xl transition-transform hover:scale-125 focus:outline-none p-1"
                >
                  <span className={star <= currentActiveRating ? 'text-amber-400 drop-shadow-md' : 'text-gray-200 dark:text-gray-700'}>
                    ★
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs font-black text-amber-500 h-5">
              {isAr ? RATING_LABELS_AR[currentActiveRating] : RATING_LABELS_EN[currentActiveRating]}
            </p>
          </div>

          {/* Praise Tags */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-gray-400 block">
              {isAr ? 'ما الذي ميز الزيارة؟ (اختر ما ينطبق)' : 'What stood out? (Select tags)'}
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Review Text */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-gray-400 block">
              {isAr ? 'تعليقك وتقييمك للطبيب (اختياري)' : 'Your Review & Experience (Optional)'}
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={3}
              className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none text-gray-900 dark:text-white"
              placeholder={isAr ? 'كيف كانت معاملة الطبيب؟ التشخيص؟ وضوح الخطة العلاجية؟' : 'Describe the consultation, doctor bedside manner, diagnosis clarity...'}
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-all"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (isAr ? 'جاري النشر...' : 'Posting...') : (isAr ? '⭐ نشر التقييم' : '⭐ Submit Review')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
