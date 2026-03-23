import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  // Update Supabase session cookies
  const supabaseResponse = await updateSession(request)

  // Apply next-intl routing
  const intlResponse = intlMiddleware(request)

  // Apply supabase cookies to the intl response
  const supabaseCookies = supabaseResponse.headers.getSetCookie()
  supabaseCookies.forEach((cookie) => {
    intlResponse.headers.append('Set-Cookie', cookie)
  })

  return intlResponse
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ar|en)/:path*', '/((?!_next|_vercel|.*\\..*).*)']
}
