'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale } from 'next-intl'

interface DashboardHeaderProps {
  role: string
  fullName: string
  supervisorName?: string | null
  initialTab?: string
}

export default function DashboardHeader({
  role,
  fullName,
  supervisorName,
  initialTab = 'overview'
}: DashboardHeaderProps) {
  const searchParams = useSearchParams()
  const locale = useLocale()
  const isAr = locale === 'ar'

  const tab = searchParams.get('tab') || initialTab || 'overview'

  // If patient is on overview, the PatientDashboard already renders a rich Welcome Hero Banner
  if (role === 'patient' && tab === 'overview') {
    return null
  }

  let title = ''
  let subtitle = ''

  if (role === 'patient') {
    switch (tab) {
      case 'prescriptions':
        title = isAr ? 'الوصفات الطبية والجرعات اليومية' : 'Prescriptions & Daily Medications'
        subtitle = isAr
          ? 'جدول الأكواب اليومية الخمسة ومتابعة أدويتك، تأكيد التناول، والطلب المباشر من الصيدلية.'
          : 'Your 5 daily dosage cups timeline, pill check-in adherence, and direct pharmacy delivery.'
        break
      case 'bookings':
        title = isAr ? 'مواعيدي وحالة الطابور' : 'My Bookings & Queue Status'
        subtitle = isAr
          ? 'متابعة مواعيدك القادمة، حالة الدفع عبر InstaPay، ووقت الانتظار المتوقع في العيادة.'
          : 'Track your upcoming clinic visits, InstaPay payment verification, and live waiting room status.'
        break
      case 'family':
        title = isAr ? 'أفراد العائلة والرعاية الخاصة' : 'Family Members & Care Profiles'
        subtitle = isAr
          ? 'إدارة ملفات أسرتك، بطاقات الأطفال، فصائل الدم، الحساسية الدوائية، والأمراض المزمنة.'
          : 'Manage family profiles, pediatric tracking, blood types, drug allergies, and chronic conditions.'
        break
      case 'doctors':
        title = isAr ? 'أطبائي والبحث عن طبيب' : 'My Doctors & Specialists'
        subtitle = isAr
          ? 'تصفح نخبة الأطباء المعتمدين، مواعيد عمل العيادة، وحجز الكشوفات العادية والمستعجلة والمنزلية.'
          : 'Browse accredited doctors, clinic hours, and schedule clinic or home visit consultations.'
        break
      case 'history':
        title = isAr ? 'سجل الزيارات والملف الطبي' : 'Visit History & Medical Records'
        subtitle = isAr
          ? 'أرشيف كشوفاتك السابقة، تقارير الأطباء، تقييمات الزيارات (CSAT)، وسجل المدفوعات.'
          : 'Archive of past consultations, clinical notes, patient satisfaction reviews, and receipts.'
        break
      default:
        title = isAr ? 'بوابة المريض' : 'Patient Portal'
        subtitle = isAr
          ? 'إدارة مواعيدك وكشوفاتك ودفعاتك بكل سهولة.'
          : 'Manage your appointments and payments seamlessly.'
    }
  } else if (role === 'doctor') {
    switch (tab) {
      case 'queue':
        title = isAr ? 'طابور انتظار العيادة' : 'Clinic Waiting Room Queue'
        subtitle = isAr
          ? 'مناداة المرضى، متابعة الكشوفات الجارية، إدارة الفرز، وحجز الاستشارات المجانية.'
          : 'Call next patients, monitor active consultations, and manage triage and free follow-ups.'
        break
      case 'schedule':
        title = isAr ? 'جدول المواعيد والزيارات' : 'Clinic & Home Schedule'
        subtitle = isAr
          ? 'تنظيم كشوفات العيادة، الزيارات المنزلية الخارجية، وتعديل مواعيد المرضى.'
          : 'Organize clinic time slots, house calls, and adjust patient booking dates.'
        break
      case 'requests':
        title = isAr ? 'طلبات الحجز الجديدة' : 'Booking Requests'
        subtitle = isAr
          ? 'مراجعة طلبات المرضى، الموافقة الفورية، أو اقتراح مواعيد بديلة ذكية.'
          : 'Review new patient appointments, approve, or propose smart alternative times.'
        break
      case 'patients':
        title = isAr ? 'سجل المرضى والملفات الطبية' : 'Patients Directory & Clinical Records'
        subtitle = isAr
          ? 'البحث في ملفات المرضى، الروشتات، تاريخ الكشوفات، وتسجيل الأدوية المصنفة.'
          : 'Search patient clinical history, past prescriptions, and manage categorized formulary.'
        break
      case 'staff':
        title = isAr ? 'طاقم تمريض العيادة' : 'Clinic Nursing Staff'
        subtitle = isAr
          ? 'إدارة تصاريح التمريض وصلاحيات إدارة طابور العيادة وتسجيل العلامات الحيوية.'
          : 'Authorize nurses to triage patients and coordinate waiting room consultation flow.'
        break
      case 'history':
        title = isAr ? 'سجل الزيارات والكشوفات السابقة' : 'Consultation History & Archives'
        subtitle = isAr
          ? 'أرشيف الكشوفات المكتملة، تقارير الحالات، وتاريخ المرضى السابق.'
          : 'Archive of completed clinic consultations, patient notes, and clinical records.'
        break
      case 'stats':
        title = isAr ? 'التقارير والإحصائيات المالية والولاء' : 'Reports, Revenue & CSAT Analytics'
        subtitle = isAr
          ? 'تحليل إيرادات العيادة، أوقات الذروة، تصدير البيانات إلى Excel، ومؤشر رضا المرضى.'
          : 'Analyze clinic revenue, peak consultation hours, Excel exports, and patient CSAT ratings.'
        break
      case 'meds':
        title = isAr ? 'صيدلية الطبيب والأدوية المفضلة' : 'Frequently Prescribed Formulary'
        subtitle = isAr
          ? 'إدارة الأدوية المفضلة، أشكالها الصيدلانية (أقراص، شراب، مرهم، حقن)، وربطها بالأعراض.'
          : 'Manage favorite medications, forms (pills, syrup, cream, injection), and symptom keywords.'
        break
      default:
        title = isAr ? 'لوحة تحكم الطبيب' : 'Doctor Dashboard'
        subtitle = isAr ? 'إدارة تدفق عيادتك الطبية بأمان وكفاءة.' : 'Manage your clinic flow securely.'
    }
  } else if (role === 'nurse') {
    switch (tab) {
      case 'schedule':
        title = isAr ? 'جدول مواعيد العيادة' : 'Clinic Schedule'
        subtitle = supervisorName
          ? (isAr ? `جدول مواعيد عيادة د. ${supervisorName}` : `Appointment schedule for Dr. ${supervisorName}`)
          : (isAr ? 'تنظيم مواعيد العيادة اليومية' : 'Manage daily clinic schedule')
        break
      case 'patients':
        title = isAr ? 'سجل المرضى والعلامات الحيوية' : 'Clinic Patients & Triage'
        subtitle = isAr
          ? 'البحث في ملفات مرضى العيادة والفرز الطبي وتسجيل العلامات الحيوية.'
          : 'Patient directory, triage vitals, and queue consultation flow.'
        break
      default:
        title = supervisorName
          ? (isAr ? `طابور عيادة د. ${supervisorName}` : `Dr. ${supervisorName}'s Clinic Queue`)
          : (isAr ? 'طابور العيادة والفرز الطبي' : 'Clinic Queue & Triage')
        subtitle = isAr
          ? 'تسجيل وصول المرضى، قياس العلامات الحيوية، وإدارة دور الانتظار.'
          : 'Check in arrivals, record triage vitals, and coordinate queue order.'
    }
  } else {
    title = isAr ? 'لوحة تحكم الإدارة' : 'Admin Dashboard'
    subtitle = isAr ? 'إدارة تدفق العيادة والاشتراكات بأمان.' : 'Manage your clinic flow securely.'
  }

  return (
    <div className="mb-8 animate-in fade-in duration-300">
      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">
        {title}
      </h1>
      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-2xl leading-relaxed">
        {subtitle}
      </p>
    </div>
  )
}
