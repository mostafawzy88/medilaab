import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import { getOrCreateProfile } from '@/utils/supabase/profiles';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import PatientDashboard from '@/components/PatientDashboard';
import DoctorDashboard from '@/components/DoctorDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import NurseDashboard from '@/components/NurseDashboard';
import NurseAssignmentView from '@/components/NurseAssignmentView';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import SubscriptionRenewal from '@/components/SubscriptionRenewal';
import DashboardHeader from '@/components/DashboardHeader';

export default async function DashboardPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ locale: string }>,
  searchParams?: Promise<{ tab?: string }>
}) {
  const { locale } = await params;
  const { tab } = (await searchParams) || {};
  const t = await getTranslations('Dashboard');
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // Get or create user profile
  const profile = await getOrCreateProfile(supabase, user.id, user.email, user.user_metadata?.full_name);

  if (!profile) {
    // This only happens on serious DB error (e.g. missing RLS policies)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-cp-grey-bg)] dark:bg-[#0A0614] p-8">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-red-100 dark:border-red-900/30">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">⚠️</div>
          <h2 className="text-2xl font-black mb-4 text-gray-900 dark:text-white">Profile Access Error</h2>
          <p className="text-gray-500 mb-8">
            The system could not load your profile from the database. This is usually caused by missing Row Level Security (RLS) policies. Please contact the administrator.
          </p>
          <div className="flex justify-center">
            <LogoutButton />
          </div>
        </div>
      </div>
    );
  }

  if (!profile.has_completed_onboarding) {
    redirect(`/${locale}/onboarding`);
  }

  const role = profile.role;
  const fullName = profile.full_name;
  const isAuthorized = profile.is_authorized;

  // Handle unauthorized doctors (pending admin approval)
  if (role === 'doctor' && !isAuthorized) {
    const authT = await getTranslations('Authorization');
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <Navbar fullName={fullName} role={role} avatarUrl={profile.avatar_url} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-gray-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-8 rotate-3">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
              {authT('pending_title')}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-10 text-lg leading-relaxed">
              {authT('pending_msg', { role: 'Doctor' })}
            </p>
            <div className="flex justify-center">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle nurse doctor assignment and authorization (Doctor or Admin approval required)
  if (role === 'nurse') {
    const supervisorId = profile.supervisor_id || profile.assigned_doctor_id;
    if (!supervisorId || !isAuthorized) {
      let supervisorDoctor = null;
      if (supervisorId) {
        const { data: doc } = await supabase
          .from('profiles')
          .select('id, full_name, specialization, phone_number, clinic_location, avatar_url')
          .eq('id', supervisorId)
          .single();
        supervisorDoctor = doc;
      }

      const { data: availableDoctors } = await supabase
        .from('profiles')
        .select('id, full_name, specialization, clinic_location, avatar_url, phone_number')
        .eq('role', 'doctor')
        .order('full_name', { ascending: true });

      return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
          <Navbar fullName={fullName} role={role} avatarUrl={profile.avatar_url} />
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <NurseAssignmentView
              nurseId={user.id}
              nurseName={fullName}
              initialSupervisorId={supervisorId || null}
              supervisorDoctor={supervisorDoctor}
              availableDoctors={availableDoctors || []}
              isAuthorized={!!isAuthorized}
            />
          </div>
        </div>
      );
    }
  }

  // Handle expired subscriptions for medical staff
  const subscriptionExpired = profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) < new Date();

  if ((role === 'doctor' || role === 'nurse') && isAuthorized && subscriptionExpired) {
    // 1. Check for any pending payments
    const { data: pendingPayment } = await supabase
      .from('subscription_payments')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .maybeSingle();

    // 2. Fetch admin payment settings
    const { data: adminSettings } = await supabase
      .from('admin_settings')
      .select('*')
      .eq('id', 1)
      .single();

    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <Navbar fullName={fullName} role={role} />
        <div className="flex-1 flex items-center justify-center p-8">
          {pendingPayment ? (
            <div className="bg-white dark:bg-gray-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-blue-100 dark:border-blue-900/30 animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-3xl font-black mb-3 text-gray-900 dark:text-white">Payment Under Review</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg leading-relaxed">
                Your payment proof has been submitted and is currently being reviewed by our team. 
                Your dashboard will be unlocked as soon as we verify the transfer.
              </p>
              <div className="flex justify-center">
                <LogoutButton />
              </div>
            </div>
          ) : (
            <SubscriptionRenewal 
              userId={user.id} 
              initialSettings={adminSettings || { instapay_address: null, payment_link: null, bank_details: null }} 
            />
          )}
        </div>
      </div>
    );
  }

  // Render variables
  let portalContent = null;
  let portalTitle = '';
  let portalSubtitle = '';
  let supervisorDoctorName: string | null = null;

  if (role === 'patient') {
    if (tab === 'prescriptions') {
      portalTitle = locale === 'ar' ? 'الوصفات الطبية والجرعات اليومية' : 'Prescriptions & Daily Medications';
      portalSubtitle = locale === 'ar' 
        ? 'جدول الأكواب اليومية الخمسة ومتابعة أدويتك وتعليمات الطبيب.'
        : 'Your 5 daily dosage cups timeline and prescribed treatment plan.';
    } else if (tab === 'family') {
      portalTitle = locale === 'ar' ? 'أفراد العائلة' : 'Family Members';
      portalSubtitle = locale === 'ar'
        ? 'إدارة ملفات أفراد أسرتك وحجز الكشوفات ومتابعة علاجهم.'
        : 'Manage your family members, book consultations, and keep their records organized.';
    } else if (tab === 'doctors') {
      portalTitle = locale === 'ar' ? 'أطبائي والبحث عن طبيب' : 'My Doctors & Specialists';
      portalSubtitle = locale === 'ar'
        ? 'تصفح نخبة الأطباء، مواعيد عملهم، وحجز كشوفات العيادة أو الزيارات المنزلية.'
        : 'Browse your doctors, check clinic availability, and schedule visits.';
    } else if (tab === 'history') {
      portalTitle = locale === 'ar' ? 'سجل الزيارات والكشوفات' : 'Visit History';
      portalSubtitle = locale === 'ar'
        ? 'أرشيف كشوفاتك السابقة، تقارير الأطباء، وتاريخ الدفعات.'
        : 'Archive of past consultations, doctor notes, and payment records.';
    } else if (tab === 'bookings') {
      portalTitle = locale === 'ar' ? 'مواعيدي وحجوزاتي' : 'My Bookings';
      portalSubtitle = locale === 'ar'
        ? 'متابعة مواعيدك القادمة، حالة الدفع عبر InstaPay، وتأكيدات العيادة.'
        : 'Track your upcoming visits, InstaPay payment status, and queue position.';
    } else {
      portalTitle = t('role_patient') || (locale === 'ar' ? 'بوابة المريض' : 'Patient Portal');
      portalSubtitle = t('manage_patient') || (locale === 'ar' ? 'إدارة مواعيدك وكشوفاتك ودفعاتك بكل سهولة.' : 'Manage your appointments and payments seamlessly.');
    }
    
    // Fetch ALL active/recent appointments for the patient (not just today)
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id, 
        doctor_id, 
        queue_position, 
        fees,
        payment_status,
        payment_reference,
        family_member_name,
        appointment_type,
        status,
        scheduled_time,
        notes,
        rejection_reason,
        reviewed_by,
        reviewed_at,
        doctor:profiles!appointments_doctor_id_fkey(full_name, instapay_address, phone_number),
        reviewer:profiles!appointments_reviewed_by_fkey(full_name)
      `)
      .eq('patient_id', user.id)
      .order('scheduled_time', { ascending: false })
      .limit(20);

    const appointmentsList = (appointments || []).map((apt: any) => ({
      id: apt.id,
      doctor_id: apt.doctor_id,
      queue_position: apt.queue_position || 0,
      fees: apt.fees,
      doctor_name: apt.doctor?.full_name || 'Doctor',
      doctor_phone: apt.doctor?.phone_number || null,
      instapay_address: apt.doctor?.instapay_address || null,
      payment_status: apt.payment_status,
      payment_reference: apt.payment_reference || null,
      family_member_name: apt.family_member_name || null,
      appointment_type: apt.appointment_type,
      status: apt.status,
      scheduled_time: apt.scheduled_time,
      notes: apt.notes,
      rejection_reason: apt.rejection_reason,
      reviewer_name: apt.reviewer?.full_name || null,
    }));

    // Fetch patient's doctors (with fallback if table doesn't exist yet)
    let initialDoctors: any[] = [];
    const { data: patientDoctors, error: pdError } = await supabase
      .from('patient_doctors')
      .select(`
        doctor_id,
        doctor:profiles!patient_doctors_doctor_id_fkey(id, full_name, avatar_url, specialization, bio, clinic_location, working_hours, phone_number, fees_normal, fees_urgent, fees_home_visit, availability_status)
      `)
      .eq('patient_id', user.id);

    if (pdError) {
      console.warn('[Dashboard] patient_doctors error:', pdError.message);
      if (profile.assigned_doctor_id) {
        const { data: fallbackDoc } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, specialization, bio, clinic_location, working_hours, phone_number, fees_normal, fees_urgent, fees_home_visit, availability_status')
          .eq('id', profile.assigned_doctor_id)
          .single();
        if (fallbackDoc) initialDoctors = [fallbackDoc];
      }
    } else {
      initialDoctors = (patientDoctors || []).map((d: any) => d.doctor).filter(Boolean);
    }

    portalContent = <PatientDashboard initialAppointments={appointmentsList} initialDoctors={initialDoctors} />;
  } else if (role === 'doctor') {
    if (tab === 'queue') {
      portalTitle = locale === 'ar' ? 'طابور انتظار العيادة' : "Clinic Waiting Room Queue";
      portalSubtitle = locale === 'ar' ? 'مناداة المرضى، متابعة العلامات الحيوية، وحالة الغرفة.' : 'Call next patients, monitor triage vitals, and manage consultation flow.';
    } else if (tab === 'schedule') {
      portalTitle = locale === 'ar' ? 'جدول المواعيد والزيارات' : "Clinic & Home Schedule";
      portalSubtitle = locale === 'ar' ? 'تنظيم كشوفات العيادة والزيارات المنزلية الخارجية.' : 'Organize clinic time slots, house calls, and calendar availability.';
    } else if (tab === 'requests') {
      portalTitle = locale === 'ar' ? 'طلبات الحجز الجديدة' : "Booking Requests";
      portalSubtitle = locale === 'ar' ? 'مراجعة طلبات المرضى، الموافقة عليها أو اقتراح مواعيد بديلة.' : 'Review new appointments, approve, or propose alternative times.';
    } else if (tab === 'staff') {
      portalTitle = locale === 'ar' ? 'طاقم تمريض العيادة' : "Clinic Nursing Staff";
      portalSubtitle = locale === 'ar' ? 'إدارة تصاريح التمريض وصلاحيات إدارة طابور العيادة.' : 'Authorize nurses to triage patients and coordinate waiting room flow.';
    } else if (tab === 'patients') {
      portalTitle = locale === 'ar' ? 'سجل المرضى والملفات الطبية' : "Patients Directory";
      portalSubtitle = locale === 'ar' ? 'البحث عن ملفات المرضى وتاريخ كشوفاتهم وأدويتهم.' : 'Search patient history, clinical records, and past prescriptions.';
    } else if (tab === 'history') {
      portalTitle = locale === 'ar' ? 'أرشيف الزيارات السابقة' : "Consultation History";
      portalSubtitle = locale === 'ar' ? 'سجل الكشوفات المكتملة وتقارير العيادة.' : 'Complete archive of finished visits and clinical notes.';
    } else if (tab === 'stats') {
      portalTitle = locale === 'ar' ? 'التقارير والإحصائيات المالية' : "Reports & Analytics";
      portalSubtitle = locale === 'ar' ? 'إحصائيات الإيرادات، عدد الكشوفات، وأداء العيادة.' : 'Track earnings, visit volume, and operational clinic analytics.';
    } else if (tab === 'meds') {
      portalTitle = locale === 'ar' ? 'صيدلية العيادة وإدارة الأدوية' : "Medications & Formulary";
      portalSubtitle = locale === 'ar' ? 'إدارة الأدوية الشائعة والجرعات للوصفات السريعة.' : 'Quick prescription templates, dosages, and patient medications.';
    } else {
      portalTitle = t('role_doctor') || (locale === 'ar' ? 'لوحة تحكم الطبيب' : 'Doctor Dashboard');
      portalSubtitle = t('manage_doctor') || (locale === 'ar' ? 'إدارة العيادة والمواعيد بكفاءة.' : 'Manage your clinic flow securely.');
    }
    // Broaden the window to 12 hours ago to avoid midnight UTC issues
    const startOfWindow = new Date();
    startOfWindow.setHours(startOfWindow.getHours() - 12);

    // Today's clinic queue (scheduled/in_progress) - Exclude home visits from clinic waiting room!
    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, notes,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number)
      `)
      .eq('doctor_id', user.id)
      .neq('appointment_type', 'home_visit')
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_time', startOfWindow.toISOString())
      .order('queue_position', { ascending: true });

    // ALL pending requests (any date)
    const { data: pendingRequests } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status, notes,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number)
      `)
      .eq('doctor_id', user.id)
      .eq('status', 'waiting')
      .order('scheduled_time', { ascending: true });

    portalContent = <DoctorDashboard doctorId={user.id} initialQueue={(queue as any) || []} initialRequests={(pendingRequests as any) || []} />;
  } else if (role === 'nurse') {
    const supervisorId = profile.supervisor_id || profile.assigned_doctor_id;

    // Fetch supervising doctor details for header banner
    const { data: supervisorDoctor } = await supabase
      .from('profiles')
      .select('id, full_name, specialization, phone_number, clinic_location, avatar_url')
      .eq('id', supervisorId)
      .single();

    supervisorDoctorName = supervisorDoctor?.full_name || null;

    if (tab === 'schedule') {
      portalTitle = locale === 'ar' ? 'جدول مواعيد العيادة' : 'Clinic Schedule';
      portalSubtitle = supervisorDoctor?.full_name 
        ? (locale === 'ar' ? `جدول مواعيد عيادة د. ${supervisorDoctor.full_name}` : `Appointment schedule for Dr. ${supervisorDoctor.full_name}`)
        : 'Manage daily clinic schedule';
    } else if (tab === 'patients') {
      portalTitle = locale === 'ar' ? 'سجل المرضى والعلامات الحيوية' : 'Clinic Patients';
      portalSubtitle = locale === 'ar' ? 'البحث في ملفات مرضى العيادة والفرز الطبي.' : 'Patient directory, past visits, and triage records.';
    } else {
      portalTitle = supervisorDoctor?.full_name 
        ? (locale === 'ar' ? `طابور عيادة د. ${supervisorDoctor.full_name}` : `Dr. ${supervisorDoctor.full_name}'s Clinic Queue`)
        : (locale === 'ar' ? 'طابور العيادة والفرز' : 'Clinic Queue & Triage');
      portalSubtitle = locale === 'ar'
        ? 'تسجيل وصول المرضى، قياس العلامات الحيوية، وإدارة دور الانتظار.'
        : 'Check in arrivals, record triage vitals, and coordinate queue order.';
    }

    const startOfWindow = new Date();
    startOfWindow.setHours(startOfWindow.getHours() - 12);

    // STRICT DOCTOR ISOLATION: Nurse ONLY queries their supervising doctor's appointments
    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, manual_patient_id, doctor_id, scheduled_time, status, queue_position, appointment_type, notes,
        patient:profiles!appointments_patient_id_fkey(full_name, phone_number),
        manual_patient:manual_patients(full_name, phone_number)
      `)
      .eq('doctor_id', supervisorId)
      .neq('appointment_type', 'home_visit')
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .gte('scheduled_time', startOfWindow.toISOString())
      .order('queue_position', { ascending: true });

    portalContent = (
      <NurseDashboard 
        clinicAppointments={(queue as any) || []} 
        supervisorId={supervisorId}
        supervisorDoctor={supervisorDoctor}
      />
    );
  } else {
    portalTitle = t('role_admin');
    portalSubtitle = t('manage_admin') || 'Manage your clinic flow securely.';
    portalContent = <AdminDashboard />;
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-cp-grey-bg)] dark:bg-[#0A0614] font-[family-name:var(--font-geist-sans)]">
      <div className="hidden lg:block">
        <Sidebar fullName={fullName} role={role} avatarUrl={profile.avatar_url} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar fullName={fullName} role={role} avatarUrl={profile.avatar_url} />

        <main className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
          {/* Mobile Navigation Header */}
          <div className="lg:hidden w-full p-4 bg-[var(--color-cp-navy)] text-white rounded-[24px] shadow-lg mb-8 flex justify-between items-center">
             <Link href={`/${locale}/profile`} className="flex items-center gap-3 hover:opacity-80 transition-opacity" title="My Profile">
               <div className="w-12 h-12 rounded-full bg-[var(--color-cp-purple)] flex items-center justify-center font-black overflow-hidden shrink-0 border-2 border-white/20">
                 {profile.avatar_url ? (
                   <img src={profile.avatar_url} alt={fullName} className="w-full h-full object-cover" />
                 ) : (
                   fullName?.charAt(0)
                 )}
               </div>
               <div>
                 <span className="text-sm font-bold block">{fullName}</span>
                 <span className="text-[10px] uppercase font-black text-gray-400">{role}</span>
               </div>
             </Link>
             <LogoutButton />
          </div>

          {/* Dynamic Client Tab Header */}
          <DashboardHeader 
            role={role} 
            fullName={fullName} 
            supervisorName={supervisorDoctorName}
            initialTab={tab}
          />

          <div className="mx-auto w-full">
            {portalContent}
          </div>
        </main>
      </div>
    </div>
  );
}
