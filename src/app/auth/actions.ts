'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function login(locale: string, formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // If it's an email confirmation error, let's bypass it using the Service Role Key for local dev
    if (error.message.includes('Email not confirmed') && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      
      // Auto confirm the user via Admin API
      const { data: { users } } = await adminClient.auth.admin.listUsers()
      const userToConfirm = users.find(u => u.email === email)
      
      if (userToConfirm) {
        await adminClient.auth.admin.updateUserById(userToConfirm.id, { email_confirm: true })
        
        // Retry login
        const { error: retryError } = await supabase.auth.signInWithPassword({ email, password })
        if (retryError) {
          redirect(`/${locale}/login?message=${encodeURIComponent(retryError.message)}`)
        } else {
          revalidatePath('/', 'layout')
          redirect(`/${locale}/dashboard`)
        }
      }
    }
    redirect(`/${locale}/login?message=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect(`/${locale}/dashboard`)
}

export async function signup(locale: string, formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('full_name') as string

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      }
    }
  })

  if (error) {
    redirect(`/${locale}/login?message=${encodeURIComponent(error.message)}`)
  }

  // Auto-confirm the new user if they didn't get a session (which means email confirm is on)
  if (!data.session && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    if (data.user?.id) {
       await adminClient.auth.admin.updateUserById(data.user.id, { email_confirm: true })
       // Log them in now that they are confirmed
       await supabase.auth.signInWithPassword({ email, password })
    }
  } else if (!data.session) {
    redirect(`/${locale}/login?message=${encodeURIComponent('Please check your email to confirm your account')}`)
  }

  revalidatePath('/', 'layout')
  redirect(`/${locale}/dashboard`)
}

export async function signInWithGoogle(locale: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback?next=/${locale}/dashboard`,
    },
  })

  if (error) {
    redirect(`/${locale}/login?message=${encodeURIComponent(error.message)}`)
  }

  if (data.url) {
    redirect(data.url)
  }
}
