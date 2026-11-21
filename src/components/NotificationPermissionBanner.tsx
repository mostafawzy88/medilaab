'use client'

import { useState, useEffect } from 'react'
import { useLocale } from 'next-intl'
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showPushNotification,
  NotificationPermissionState,
} from '@/utils/notifications'

export default function NotificationPermissionBanner({
  compact = false,
}: {
  compact?: boolean
}) {
  const locale = useLocale()
  const isAr = locale === 'ar'

  const [permission, setPermission] = useState<NotificationPermissionState>('default')
  const [requesting, setRequesting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    if (isNotificationSupported()) {
      setPermission(getNotificationPermission())
    } else {
      setPermission('unsupported')
    }
  }, [])

  const handleEnable = async () => {
    setRequesting(true)
    const res = await requestNotificationPermission()
    setPermission(res)
    setRequesting(false)

    if (res === 'granted') {
      showPushNotification({
        title: isAr ? '🔔 تم تفعيل إشعارات ميدي لاب!' : '🔔 MediLab Notifications Enabled!',
        body: isAr
          ? 'ستصلك الآن تنبيهات دورك بالعيادة وتذكيرات مواعيد أدويتك مباشرة على هاتفك.'
          : 'You will now receive clinic turn alerts and medication reminders on your phone.',
        url: `/${locale}/dashboard`,
        kind: 'turn_calling',
      })
    }
  }

  const handleTestNotification = async () => {
    setTesting(true)
    const success = await showPushNotification({
      title: isAr ? '🔔 تجربة تنبيه الدور: د. دون ينادي عليك الآن! (Q1)' : '🔔 Turn Alert Test: Dr. Don is calling you now! (Q1)',
      body: isAr
        ? 'حان دورك الآن! يرجى التوجه لغرفة الكشف. (هكذا سيصلك الإشعار عند مناداة الطبيب)'
        : "It's your turn now! Please enter the clinic room. (This is how turn alerts appear on your phone)",
      url: `/${locale}/dashboard?tab=bookings`,
      kind: 'turn_calling',
    })

    if (success) {
      setTestSent(true)
      setTimeout(() => setTestSent(false), 4000)
    }
    setTesting(false)
  }

  if (permission === 'unsupported') {
    return null
  }

  if (permission === 'granted') {
    if (compact) {
      return (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{isAr ? 'الإشعارات مفعلة' : 'Notifications Active'}</span>
          <button
            type="button"
            onClick={handleTestNotification}
            disabled={testing}
            className="ml-auto text-[10px] font-black underline hover:text-emerald-700"
          >
            {testSent ? (isAr ? '✓ تم الإرسال!' : '✓ Alert Sent!') : (isAr ? 'تجربة' : 'Test Alert')}
          </button>
        </div>
      )
    }

    return (
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-300/60 dark:border-emerald-800/60 flex items-center justify-between gap-3 shadow-sm animate-in fade-in">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center text-lg shadow-sm shrink-0">
            🔔
          </div>
          <div>
            <p className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>{isAr ? 'إشعارات الهاتف وتنبيهات الدور مفعلة' : 'Phone Push Notifications Active'}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {isAr
                ? 'ستتلقى تنبيهاً فورياً مع رنين واهتزاز عند اقتراب دورك وتذكيرات بمواعيد الدواء.'
                : "You'll receive instant alerts with sound and vibration when your turn arrives and for daily medications."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestNotification}
          disabled={testing}
          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all hover:scale-105 active:scale-95 shadow-sm shrink-0"
        >
          {testSent ? (isAr ? '✓ تم إرسال الإشعار!' : '✓ Alert Sent!') : (isAr ? '🧪 تجربة إشعار' : '🧪 Test Alert')}
        </button>
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🔕</span>
          <div>
            <p className="font-bold text-amber-900 dark:text-amber-200">
              {isAr ? 'إشعارات الهاتف محظورة في متصفحك' : 'Phone Notifications Blocked in Browser'}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {isAr
                ? 'لتلقي تنبيهات اقتراب دورك وتذكير الدواء، اضغط على علامة القفل بجوار رابط الموقع وقم بالسماح بالإشعارات.'
                : 'To receive queue turn alerts and pill reminders, click the lock icon next to the address bar and allow Notifications.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Permission is 'default' (Prompt user)
  return (
    <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-lg shadow-blue-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur border border-white/30 flex items-center justify-center text-2xl shadow-sm shrink-0">
          🔔
        </div>
        <div>
          <h4 className="font-black text-sm sm:text-base">
            {isAr ? 'تفعيل تنبيهات الهاتف لمتابعة دورك وأدويتك' : 'Enable Phone Alerts for Turn Tracking & Medication'}
          </h4>
          <p className="text-xs text-blue-100 mt-0.5 max-w-xl leading-relaxed">
            {isAr
              ? 'احصل على إشعار فوري على شاشة هاتفك عند اقتراب دورك في العيادة، وتنبيهات يومية بمواعيد كؤوس الدواء الخمسة.'
              : 'Receive instant push alerts on your lock screen when your turn is called, plus daily reminders for your 5 dosage cups.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={requesting}
        onClick={handleEnable}
        className="px-5 py-2.5 rounded-xl bg-white text-blue-800 hover:bg-blue-50 font-black text-xs transition-all hover:scale-105 active:scale-95 shadow-md shadow-black/10 shrink-0"
      >
        {requesting ? (isAr ? 'جاري التفعيل...' : 'Enabling...') : (isAr ? 'تفعيل الإشعارات الآن ↗' : 'Enable Notifications ↗')}
      </button>
    </div>
  )
}
