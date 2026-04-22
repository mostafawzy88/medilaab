import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import { getOrCreateProfile } from '@/utils/supabase/profiles';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import PatientDashboard from '@/components/PatientDashboard';
import DoctorDashboard from '@/components/DoctorDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import NurseDashboard from '@/components/NurseDashboard';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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

   // Handle unauthorized medical staff
  if ((role === 'doctor' || role === 'nurse') && !isAuthorized) {
    const authT = await getTranslations('Authorization');
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <Navbar fullName={fullName} role={role} />
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
              {authT('pending_msg', { role: role === 'doctor' ? 'Doctor' : 'Nurse' })}
            </p>
            <div className="flex justify-center">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle expired subscriptions for medical staff
  const subscriptionExpired = profile.subscription_expires_at &&
    new Date(profile.subscription_expires_at) < new Date();

  if ((role === 'doctor' || role === 'nurse') && isAuthorized && subscriptionExpired) {
    const expiredDate = new Date(profile.subscription_expires_at);
    const daysAgo = Math.ceil((new Date().getTime() - expiredDate.getTime()) / (1000 * 60 * 60 * 24));

    // Fetch admin payment settings for display
    const { data: adminSettings } = await supabase
      .from('admin_settings')
      .select('instapay_address, payment_link, bank_details')
      .eq('id', 1)
      .single();

    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <Navbar fullName={fullName} role={role} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-gray-900 p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center border border-red-100 dark:border-red-900/30 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-8">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-black mb-3 text-gray-900 dark:text-white">
              Subscription Expired
            </h2>
            <div className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 rounded-full text-sm font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              Expired {daysAgo} day{daysAgo !== 1 ? 's' : ''} ago — {expiredDate.toLocaleDateString()}
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-8 text-lg leading-relaxed">
              Your subscription has expired. Please renew to continue using the clinic system.
              Contact the administrator to renew your access.
            </p>

            {/* Payment Information */}
            {adminSettings && (adminSettings.instapay_address || adminSettings.payment_link || adminSettings.bank_details) && (
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900 rounded-2xl p-5 mb-8 text-left space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Payment Information</h4>
                {adminSettings.instapay_address && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">InstaPay:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{adminSettings.instapay_address}</span>
                  </div>
                )}
                {adminSettings.payment_link && (
                  <div className="text-sm">
                    <span className="text-gray-500">Payment Link: </span>
                    <a href={adminSettings.payment_link} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline break-all">
                      {adminSettings.payment_link}
                    </a>
                  </div>
                )}
                {adminSettings.bank_details && (
                  <div className="text-sm">
                    <span className="text-gray-500">Bank Details:</span>
                    <p className="font-medium text-gray-900 dark:text-white whitespace-pre-line mt-1">{adminSettings.bank_details}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render variables
  let portalContent = null;
  let portalTitle = '';

  if (role === 'patient') {
    portalTitle = t('role_patient');
    
    // Fetch ALL active/recent appointments for the patient (not just today)
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        id, 
        doctor_id, 
        queue_position, 
        fees,
        payment_status,
        appointment_type,
        status,
        scheduled_time,
        rejection_reason,
        reviewed_by,
        reviewed_at,
        doctor:profiles!appointments_doctor_id_fkey(full_name, instapay_address),
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
      instapay_address: apt.doctor?.instapay_address || null,
      payment_status: apt.payment_status,
      appointment_type: apt.appointment_type,
      status: apt.status,
      scheduled_time: apt.scheduled_time,
      rejection_reason: apt.rejection_reason,
      reviewer_name: apt.reviewer?.full_name || null,
    }));

    // Fetch patient's doctors (with fallback if table doesn't exist yet)
    let initialDoctors: any[] = [];
    const { data: patientDoctors, error: pdError } = await supabase
      .from('patient_doctors')
      .select(`
        doctor_id,
        doctor:profiles!patient_doctors_doctor_id_fkey(id, full_name, specialization, clinic_location, working_hours, phone_number)
      `)
      .eq('patient_id', user.id);

    if (pdError) {
      console.warn('[Dashboard] patient_doctors error:', pdError.message);
      if (profile.assigned_doctor_id) {
        const { data: fallbackDoc } = await supabase
          .from('profiles')
          .select('id, full_name, specialization, clinic_location, working_hours, phone_number')
          .eq('id', profile.assigned_doctor_id)
          .single();
        if (fallbackDoc) initialDoctors = [fallbackDoc];
      }
    } else {
      initialDoctors = (patientDoctors || []).map((d: any) => d.doctor);
    }

    portalContent = <PatientDashboard initialAppointments={appointmentsList} initialDoctors={initialDoctors} />;
  } else if (role === 'doctor') {
    portalTitle = t('role_doctor');
    // Broaden the window to 12 hours ago to avoid midnight UTC issues
    const startOfWindow = new Date();
    startOfWindow.setHours(startOfWindow.getHours() - 12);

    // Today's queue (scheduled/in_progress)
    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .eq('doctor_id', user.id)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_time', startOfWindow.toISOString())
      .order('queue_position', { ascending: true });

    // ALL pending requests (any date)
    const { data: pendingRequests } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position, appointment_type, fees, payment_status,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .eq('doctor_id', user.id)
      .eq('status', 'waiting')
      .order('scheduled_time', { ascending: true });

    portalContent = <DoctorDashboard doctorId={user.id} initialQueue={(queue as any) || []} initialRequests={(pendingRequests as any) || []} />;
  } else if (role === 'nurse') {
    portalTitle = t('role_nurse');
    const startOfWindow = new Date();
    startOfWindow.setHours(startOfWindow.getHours() - 12);

    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, doctor_id, scheduled_time, status, queue_position,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .gte('scheduled_time', startOfWindow.toISOString())
      .order('queue_position', { ascending: true });

    portalContent = (
      <NurseDashboard 
        clinicAppointments={(queue as any) || []} 
        supervisorId={profile.supervisor_id} 
      />
    );
  } else {
    portalTitle = t('role_admin');
    portalContent = <AdminDashboard />;
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-cp-grey-bg)] dark:bg-[#0A0614] font-[family-name:var(--font-geist-sans)]">
      <div className="hidden lg:block">
        <Sidebar fullName={fullName} role={role} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar fullName={fullName} role={role} />

        <main className="flex-1 p-6 md:p-10 overflow-y-auto w-full">
          {/* Mobile Navigation Header */}
          <div className="lg:hidden w-full p-4 bg-[var(--color-cp-navy)] text-white rounded-[24px] shadow-lg mb-8 flex justify-between items-center">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-[var(--color-cp-purple)] flex items-center justify-center font-black">
                 {fullName?.charAt(0)}
               </div>
               <div>
                 <span className="text-sm font-bold block">{fullName}</span>
                 <span className="text-[10px] uppercase font-black text-gray-400">{role}</span>
               </div>
             </div>
             <LogoutButton />
          </div>

          <div className="mb-10">
            <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{portalTitle}</h1>
            <p className="text-gray-500 dark:text-gray-400">
              {role === 'patient' 
                ? t('manage_patient') || 'Manage your appointments and payments seamlessly.' 
                : t('manage_admin') || 'Manage your clinic flow securely.'}
            </p>
          </div>

          <div className="mx-auto w-full">
            {portalContent}
          </div>
        </main>
      </div>
    </div>
  );
}
