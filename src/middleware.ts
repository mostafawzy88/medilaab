import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  try {
    // Update Supabase session cookies
    const supabaseResponse = await updateSession(request)

    // Apply next-intl routing
    const intlResponse = intlMiddleware(request)

    // Ensure we have a valid response to work with
    const finalResponse = intlResponse || NextResponse.next()

    // Apply supabase cookies to the final response
    const supabaseCookies = supabaseResponse.headers.getSetCookie()
    if (supabaseCookies.length > 0) {
      supabaseCookies.forEach((cookie) => {
        finalResponse.headers.append('Set-Cookie', cookie)
      })
    }

    return finalResponse
  } catch (error) {
    console.error('Middleware execution failed:', error)
    // Return a default response instead of crashing
    return NextResponse.next()
  }
}

export const config = {
  // Match only internationalized pathnames
  matcher: ['/', '/(ar|en)/:path*', '/((?!_next|_vercel|.*\\..*).*)']
}
