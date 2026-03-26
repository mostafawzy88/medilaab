import { SupabaseClient } from '@supabase/supabase-js';

export async function getOrCreateProfile(supabase: SupabaseClient, userId: string, email?: string, fullName?: string) {
  // 1. Try to fetch existing profile
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profile) return profile;

  // 2. If not found (PGRST116), create a default one
  if (fetchError && fetchError.code === 'PGRST116') {
    console.log(`[profiles] Profile missing for ${userId}, creating default...`);
    
    const { data: newProfile, error: insertError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email || null,
        full_name: fullName || email?.split('@')[0] || 'New User',
        role: 'patient',
        has_completed_onboarding: false,
        is_authorized: true // Patients are authorized by default
      })
      .select()
      .single();

    if (insertError) {
      console.error('[profiles] Failed to create default profile:', insertError);
      return null;
    }

    return newProfile;
  }

  // Handle other potential errors
  console.error('[profiles] Unexpected error fetching profile:', fetchError);
  return null;
}
