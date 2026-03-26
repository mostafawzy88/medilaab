import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Hand off to intlMiddleware first to get the base response (including rewrites/redirects)
  let response = intlMiddleware(request);

  // 2. Skip Supabase for static files and internal paths
  if (pathname.includes('.') || pathname.startsWith('/_next') || pathname.startsWith('/_vercel')) {
    return response;
  }

  // 3. Initialize Supabase client with the ability to modify our 'response' object
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 4. Important: This refreshes the session if needed
  await supabase.auth.getUser()

  return response;
}

export const config = {
  matcher: ['/', '/(ar|en)/:path*', '/((?!api|auth|_next|_vercel|.*\\..*).*)']
}
