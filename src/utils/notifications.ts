// ==============================================================================
// MediLab Push Notifications & Sound Alerts Utility
// Handles Clinic Queue Turn Alerts & Scheduled Daily Medication Reminders
// ==============================================================================

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

/**
 * Synthesizes a clean clinic notification chime using the Web Audio API
 */
export function playNotificationChime(kind: 'turn_calling' | 'turn_next' | 'medication' = 'turn_calling') {
  if (typeof window === 'undefined') return

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime

    if (kind === 'turn_calling') {
      // 3-note ascending fanfare chime (Doctor Calling Now)
      const notes = [523.25, 659.25, 783.99, 1046.5] // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + idx * 0.12)
        gain.gain.setValueAtTime(0.3, now + idx * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + idx * 0.12)
        osc.stop(now + idx * 0.12 + 0.4)
      })
    } else if (kind === 'turn_next') {
      // 2-tone gentle alert (Next in Line)
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(587.33, now) // D5
      osc.frequency.setValueAtTime(880.0, now + 0.18) // A5
      gain.gain.setValueAtTime(0.25, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.65)
    } else {
      // Warm harmonic chime (Medication Dosage Reminder)
      const freqs = [440, 554.37, 659.25] // A4, C#5, E5
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, now + i * 0.1)
        gain.gain.setValueAtTime(0.2, now + i * 0.1)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.5)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(now + i * 0.1)
        osc.stop(now + i * 0.1 + 0.55)
      })
    }
  } catch {
    // Audio autoplay restrictions may prevent playback before first interaction
  }
}

/**
 * Triggers hardware vibration on mobile phones
 */
export function triggerVibration(pattern: number[] = [300, 150, 300, 150, 300]) {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {}
  }
}

/**
 * Check if browser supports Web Notifications
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Current notification permission state
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission as NotificationPermissionState
}

/**
 * Register Service Worker for background push handling
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.warn('[MediLab SW] Registration failed:', err)
    return null
  }
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported'

  try {
    await registerServiceWorker()
    const perm = await Notification.requestPermission()
    return perm as NotificationPermissionState
  } catch (e) {
    console.warn('Error requesting notification permission:', e)
    return 'denied'
  }
}

export type ShowNotificationOptions = {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  vibrate?: number[]
  kind?: 'turn_calling' | 'turn_next' | 'medication'
}

/**
 * Show a push notification on phone/browser screen
 */
export async function showPushNotification(options: ShowNotificationOptions): Promise<boolean> {
  if (!isNotificationSupported()) return false

  // Sound chime & phone vibration
  playNotificationChime(options.kind || 'turn_calling')
  triggerVibration(options.vibrate || [300, 150, 300, 150, 300])

  if (Notification.permission !== 'granted') {
    return false
  }

  const notificationOptions: any = {
    body: options.body,
    icon: options.icon || '/logo.png',
    badge: options.badge || '/logo.png',
    tag: options.tag || 'medilab-alert',
    renotify: true,
    requireInteraction: true,
    data: { url: options.url || '/dashboard' },
  }

  // 1. Try displaying via Service Worker registration (works on phone lock screen & background)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && reg.showNotification) {
        await reg.showNotification(options.title, notificationOptions)
        return true
      }
    } catch (e) {
      console.warn('SW notification fallback to window.Notification', e)
    }
  }

  // 2. Direct Notification API fallback
  try {
    const notif = new Notification(options.title, notificationOptions)
    notif.onclick = () => {
      window.focus()
      if (options.url) {
        window.location.href = options.url
      }
      notif.close()
    }
    return true
  } catch (err) {
    console.error('Failed to display native notification:', err)
    return false
  }
}

/**
 * Send Clinic Queue Turn Alert to Patient Phone
 */
export async function sendTurnAlertNotification({
  doctorName,
  turnNumber,
  isCallingNow,
  patientsAhead,
  locale = 'en',
}: {
  doctorName: string
  turnNumber: number | string
  isCallingNow: boolean
  patientsAhead: number
  locale?: string
}): Promise<boolean> {
  const isAr = locale === 'ar'

  if (isCallingNow) {
    const title = isAr
      ? `🔔 د. ${doctorName} ينادي على دورك الآن! (Q${turnNumber})`
      : `🔔 Dr. ${doctorName} is calling you now! (Q${turnNumber})`

    const body = isAr
      ? `حان دورك الآن! يرجى التوجه لغرفة الكشف بالعيادة فوراً.`
      : `It's your turn right now! Please enter the clinic examination room.`

    return showPushNotification({
      title,
      body,
      tag: `turn-call-${turnNumber}`,
      url: `/${locale}/dashboard?tab=bookings`,
      kind: 'turn_calling',
      vibrate: [400, 200, 400, 200, 500],
    })
  }

  // When patient is next in line
  const title = isAr
    ? `⏳ استعد: أنت التالي في الطابور! (Q${turnNumber})`
    : `⏳ You're Next in Line! (Q${turnNumber})`

  const body = isAr
    ? `مريض واحد فقط قبلك مع د. ${doctorName}. يرجى التواجد في صالة الانتظار والاستعداد للدخول.`
    : `Only 1 patient ahead of you with Dr. ${doctorName}. Please be ready in the waiting room.`

  return showPushNotification({
    title,
    body,
    tag: `turn-next-${turnNumber}`,
    url: `/${locale}/dashboard?tab=bookings`,
    kind: 'turn_next',
    vibrate: [250, 150, 250],
  })
}

/**
 * Send Scheduled Medication Reminder to Patient Phone
 */
export async function sendMedicationReminderNotification({
  slotTitle,
  pillNames,
  instructions,
  locale = 'en',
}: {
  slotTitle: string
  pillNames: string[]
  instructions?: string
  locale?: string
}): Promise<boolean> {
  const isAr = locale === 'ar'
  const pillListStr = pillNames.join(', ')

  const title = isAr
    ? `💊 تذكير بموعد الدواء: ${slotTitle}`
    : `💊 Medication Reminder: ${slotTitle}`

  const body = isAr
    ? `حان موعد تناول أدويتك الموصوفة: ${pillListStr}${instructions ? ` (${instructions})` : ''}. حافظ على صحتك!`
    : `Time to take your scheduled medications: ${pillListStr}${instructions ? ` (${instructions})` : ''}. Stay healthy!`

  return showPushNotification({
    title,
    body,
    tag: `med-reminder-${slotTitle.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(0, -5)}`,
    url: `/${locale}/dashboard?tab=prescriptions`,
    kind: 'medication',
    vibrate: [300, 200, 300],
  })
}
