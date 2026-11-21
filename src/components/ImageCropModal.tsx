'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocale } from 'next-intl'

interface ImageCropModalProps {
  imageSrc: string
  onClose: () => void
  onCropComplete: (croppedBlob: Blob) => Promise<void> | void
}

export default function ImageCropModal({ imageSrc, onClose, onCropComplete }: ImageCropModalProps) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [scale, setScale] = useState(1.2) // Default slightly zoomed for face
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  const imageRef = useRef<HTMLImageElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const CROP_BOX_SIZE = 280 // px diameter of the circular crop area

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    setPosition({ x: 0, y: 0 })
  }

  // Mouse / Touch drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return
    setPosition({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY * -0.002
    setScale(prev => Math.min(Math.max(0.6, prev + delta), 4.0))
  }

  // Live Canvas Crop Rendering
  const generateCroppedBlob = async (): Promise<Blob | null> => {
    if (!imageRef.current) return null
    const img = imageRef.current

    const outputSize = 512 // 512x512 high res square
    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Enable highest quality smoothing
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Compute transformation from crop box (CROP_BOX_SIZE) to outputSize (512)
    const factor = outputSize / CROP_BOX_SIZE

    ctx.save()
    // Center of canvas
    ctx.translate(outputSize / 2, outputSize / 2)
    // Apply user rotation
    ctx.rotate((rotation * Math.PI) / 180)
    // Apply user position (scaled to output canvas)
    ctx.translate(position.x * factor, position.y * factor)
    // Apply user scale
    ctx.scale(scale * factor, scale * factor)

    // Base fit scale: how the image is fitted in the 280px box initially
    // We fit by cover: max(CROP_BOX_SIZE / img.naturalWidth, CROP_BOX_SIZE / img.naturalHeight)
    const fitRatio = Math.max(CROP_BOX_SIZE / img.naturalWidth, CROP_BOX_SIZE / img.naturalHeight)
    const drawW = img.naturalWidth * fitRatio
    const drawH = img.naturalHeight * fitRatio

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob)
        },
        'image/jpeg',
        0.92
      )
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const blob = await generateCroppedBlob()
      if (blob) {
        await onCropComplete(blob)
      }
    } catch (err: any) {
      alert(isAr ? 'حدث خطأ أثناء حفظ الصورة' : 'Error saving cropped image: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-lg w-full p-6 border border-gray-100 dark:border-gray-800 shadow-2xl space-y-6">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>✂️</span>
              <span>{isAr ? 'ضبط وتكبير الصورة الشخصية' : 'Crop & Adjust Profile Photo'}</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAr
                ? 'اسحب الصورة لتوسيط وجهك، واستخدم شريط التكبير لملء الدائرة.'
                : 'Drag to center your face and use the slider to zoom in.'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full text-lg"
          >
            ✕
          </button>
        </div>

        {/* Viewport & Circular Stencil */}
        <div className="flex flex-col items-center justify-center">
          <div
            className="relative overflow-hidden rounded-2xl bg-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing select-none shadow-inner"
            style={{ width: `${CROP_BOX_SIZE + 40}px`, height: `${CROP_BOX_SIZE + 40}px` }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* Draggable & Scalable Image */}
            <div
              className="absolute pointer-events-none transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
                transformOrigin: 'center center'
              }}
            >
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Source"
                onLoad={handleImageLoad}
                className="max-w-none select-none"
                style={{
                  width: `${CROP_BOX_SIZE}px`,
                  height: 'auto',
                  objectFit: 'contain'
                }}
                draggable={false}
              />
            </div>

            {/* Circular Vignette Overlay (Dark outside, transparent inside) */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(circle at center, transparent ${CROP_BOX_SIZE / 2 - 2}px, rgba(10, 6, 20, 0.75) ${CROP_BOX_SIZE / 2}px)`
              }}
            />

            {/* Circular Border Ring with crosshair guidelines */}
            <div
              className="absolute rounded-full border-2 border-emerald-400 pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
              style={{ width: `${CROP_BOX_SIZE}px`, height: `${CROP_BOX_SIZE}px` }}
            >
              {/* Subtle face guide lines */}
              <div className="absolute inset-x-0 top-1/3 border-t border-white/20 border-dashed pointer-events-none" />
              <div className="absolute inset-x-0 top-2/3 border-t border-white/20 border-dashed pointer-events-none" />
              <div className="absolute inset-y-0 left-1/3 border-l border-white/20 border-dashed pointer-events-none" />
              <div className="absolute inset-y-0 left-2/3 border-l border-white/20 border-dashed pointer-events-none" />
            </div>

            <span className="absolute bottom-2 text-[10px] font-bold text-white/60 bg-black/50 px-2 py-0.5 rounded-full pointer-events-none">
              {isAr ? 'اسحب للتحريك ↔' : 'Drag to reposition ↔'}
            </span>
          </div>

          {/* Quick Previews: Header Pill (48px) & Card (80px) */}
          <div className="flex items-center gap-6 mt-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                {isAr ? 'معاينة القائمة' : 'Header (1.5x)'}
              </span>
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-emerald-500 bg-slate-900 mx-auto shadow-sm relative">
                <div
                  className="absolute"
                  style={{
                    transform: `translate(${position.x * (48 / CROP_BOX_SIZE)}px, ${position.y * (48 / CROP_BOX_SIZE)}px) rotate(${rotation}deg) scale(${scale * (48 / CROP_BOX_SIZE)})`,
                    transformOrigin: 'center center',
                    left: '50%',
                    top: '50%',
                    marginLeft: `-${CROP_BOX_SIZE / 2}px`,
                    marginTop: `-${CROP_BOX_SIZE / 2}px`
                  }}
                >
                  <img src={imageSrc} alt="Preview" className="max-w-none" style={{ width: `${CROP_BOX_SIZE}px` }} />
                </div>
              </div>
            </div>

            <div className="text-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block mb-1">
                {isAr ? 'معاينة الملف' : 'Profile Page'}
              </span>
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-900 mx-auto shadow-md relative">
                <div
                  className="absolute"
                  style={{
                    transform: `translate(${position.x * (64 / CROP_BOX_SIZE)}px, ${position.y * (64 / CROP_BOX_SIZE)}px) rotate(${rotation}deg) scale(${scale * (64 / CROP_BOX_SIZE)})`,
                    transformOrigin: 'center center',
                    left: '50%',
                    top: '50%',
                    marginLeft: `-${CROP_BOX_SIZE / 2}px`,
                    marginTop: `-${CROP_BOX_SIZE / 2}px`
                  }}
                >
                  <img src={imageSrc} alt="Preview" className="max-w-none" style={{ width: `${CROP_BOX_SIZE}px` }} />
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p className="font-bold text-gray-700 dark:text-gray-300">
                {isAr ? '✨ ميزة التكبير الذكي:' : '✨ Face Area Zoom:'}
              </p>
              <p className="text-[11px] leading-relaxed">
                {isAr
                  ? 'قم بتكبير الوجه حتى يملأ الإطار تماماً بدون مسافات فارغة.'
                  : 'Zoom in so your face fills the frame clearly without tiny borders.'}
              </p>
            </div>
          </div>
        </div>

        {/* Zoom & Adjustment Controls */}
        <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl">
          {/* Zoom Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-gray-600 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <span>🔍</span>
                <span>{isAr ? 'تكبير الوجه (Zoom Face):' : 'Zoom Face Area:'}</span>
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">
                {Math.round(scale * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setScale(prev => Math.max(0.6, prev - 0.15))}
                className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-100 flex items-center justify-center shrink-0"
              >
                −
              </button>
              <input
                type="range"
                min="0.6"
                max="3.5"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1 accent-emerald-500 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setScale(prev => Math.min(3.5, prev + 0.15))}
                className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-100 flex items-center justify-center shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex-wrap">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setScale(1.0); setPosition({ x: 0, y: 0 }); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100"
              >
                100% (Fit)
              </button>
              <button
                type="button"
                onClick={() => { setScale(1.5); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
              >
                150% (👤 Face Close-up)
              </button>
              <button
                type="button"
                onClick={() => { setScale(2.0); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100"
              >
                200% (Focus)
              </button>
            </div>

            <div className="flex gap-1.5">
              {/* Rotate 90 deg */}
              <button
                type="button"
                onClick={() => setRotation(r => (r + 90) % 360)}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 flex items-center gap-1"
                title="Rotate 90°"
              >
                <span>🔄</span>
                <span>{isAr ? 'تدوير' : 'Rotate'}</span>
              </button>
              {/* Reset to center */}
              <button
                type="button"
                onClick={() => { setPosition({ x: 0, y: 0 }); setRotation(0); setScale(1.3); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100"
              >
                {isAr ? 'إعادة ضبط' : 'Center'}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold py-3 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-3 rounded-2xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{isAr ? 'جاري القص والرفع...' : 'Saving Photo...'}</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>{isAr ? 'حفظ الصورة المقصوصة' : 'Crop & Save Photo'}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
