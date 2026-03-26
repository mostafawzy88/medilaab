import { getTranslations } from 'next-intl/server';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import PatientDashboard from '@/components/PatientDashboard';
import DoctorDashboard from '@/components/DoctorDashboard';
import AdminDashboard from '@/components/AdminDashboard';
import NurseDashboard from '@/components/NurseDashboard';
import Navbar from '@/components/Navbar';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('Dashboard');
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // redirect(`/${locale}/login`);
    return <div className="p-10 text-center">No user. Redirect to Login disabled for debugging. <a href={`/${locale}/login`} className="underline">Click here to go manually</a></div>;
  }

  // Get user profile role and onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email, has_completed_onboarding, is_authorized')
    .eq('id', user.id)
    .single();

  if (!profile) {
    // This shouldn't happen with the trigger, but safe to redirect to onboarding
    // redirect(`/${locale}/onboarding`);
    return <div className="p-10 text-center text-red-500">No profile found for user {user.email}. Role based UI cannot render. <a href={`/${locale}/onboarding`} className="underline font-bold">Try Onboarding Manually</a></div>;
  }

  if (!profile.has_completed_onboarding) {
    // redirect(`/${locale}/onboarding`);
    return (
      <div className="p-10 text-center">
        Onboarding not completed. Redirect to Onboarding disabled for debugging. 
        <pre className="mt-4 bg-gray-100 p-4 rounded text-left">{JSON.stringify(profile, null, 2)}</pre>
        <a href={`/${locale}/onboarding`} className="underline mt-4 block">Go to Onboarding</a>
      </div>
    );
  }

  const role = profile.role;
  const fullName = profile.full_name;
  const isAuthorized = profile.is_authorized;

  // Handle unauthorized medical staff
  if ((role === 'doctor' || role === 'nurse') && !isAuthorized) {
    const authT = await getTranslations('Authorization');
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
        <Navbar fullName={fullName} />
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

  // Render variables
  let portalContent = null;
  let portalTitle = '';

  if (role === 'patient') {
    portalTitle = t('role_patient');
    // ... logic remains same
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date();
    endOfDay.setHours(23,59,59,999);

    const { data: appointment } = await supabase
      .from('appointments')
      .select(`
        id, 
        doctor_id, 
        queue_position, 
        fees,
        payment_status,
        appointment_type,
        doctor:profiles!appointments_doctor_id_fkey(full_name, instapay_address)
      `)
      .eq('patient_id', user.id)
      .in('status', ['scheduled', 'waiting', 'in_progress'])
      .gte('scheduled_time', startOfDay.toISOString())
      .lte('scheduled_time', endOfDay.toISOString())
      .order('scheduled_time', { ascending: true })
      .limit(1)
      .single();

    let appointmentData = null;
    if (appointment) {
      // @ts-ignore - Handle joining typing complexities
      const doctorData = appointment.doctor as any;
      appointmentData = {
        id: appointment.id,
        doctor_id: appointment.doctor_id,
        queue_position: appointment.queue_position || 1,
        fees: appointment.fees,
        doctor_name: doctorData?.full_name || 'Doctor',
        instapay_address: doctorData?.instapay_address || 'doctor@instapay',
        payment_status: appointment.payment_status,
        appointment_type: appointment.appointment_type,
      };
    }

    // Fetch patient's doctors
    const { data: patientDoctors } = await supabase
      .from('patient_doctors')
      .select(`
        doctor_id,
        doctor:profiles!patient_doctors_doctor_id_fkey(id, full_name, specialization, clinic_location, working_hours, phone_number)
      `)
      .eq('patient_id', user.id);

    const initialDoctors = (patientDoctors || []).map((d: any) => d.doctor);

    portalContent = <PatientDashboard initialAppointment={appointmentData} initialDoctors={initialDoctors} />;
  } else if (role === 'doctor') {
    portalTitle = t('role_doctor');
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date();
    endOfDay.setHours(23,59,59,999);

    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, scheduled_time, status, queue_position,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .eq('doctor_id', user.id)
      .in('status', ['scheduled', 'waiting', 'in_progress'])
      .gte('scheduled_time', startOfDay.toISOString())
      .lte('scheduled_time', endOfDay.toISOString())
      .order('queue_position', { ascending: true });

    portalContent = <DoctorDashboard doctorId={user.id} initialQueue={(queue as any) || []} />;
  } else if (role === 'nurse') {
    portalTitle = t('role_nurse');
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date();
    endOfDay.setHours(23,59,59,999);

    const { data: queue } = await supabase
      .from('appointments')
      .select(`
        id, patient_id, doctor_id, scheduled_time, status, queue_position,
        patient:profiles!appointments_patient_id_fkey(full_name)
      `)
      .in('status', ['scheduled', 'waiting', 'in_progress', 'completed'])
      .gte('scheduled_time', startOfDay.toISOString())
      .lte('scheduled_time', endOfDay.toISOString())
      .order('queue_position', { ascending: true });

    portalContent = <NurseDashboard clinicAppointments={(queue as any) || []} />;
  } else {
    portalTitle = t('role_admin');
    portalContent = <AdminDashboard />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-[family-name:var(--font-geist-sans)]">
      <Navbar fullName={fullName} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{portalTitle}</h1>
            <p className="text-gray-500 dark:text-gray-400">
              {role === 'patient' 
                ? 'Manage your appointments and payments seamlessly.' 
                : 'Manage your clinic flow securely.'}
            </p>
          </div>
          
          {/* Mobile Logout */}
          <div className="sm:hidden w-full p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <span className="text-sm font-bold truncate max-w-[200px]">{t('welcome', { name: fullName })}</span>
            <LogoutButton />
          </div>
        </div>

        {portalContent}
      </main>
    </div>
  );
}
