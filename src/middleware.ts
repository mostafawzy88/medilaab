import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;

    // 1. Skip system paths early
    if (pathname.startsWith('/_next') || pathname.startsWith('/_vercel') || pathname.includes('.')) {
      return NextResponse.next();
    }

    // 2. Handle Supabase Session
    const supabaseResponse = await updateSession(request);

    // 3. Skip intl for API and Auth
    if (pathname.startsWith('/api') || pathname.startsWith('/auth')) {
      return supabaseResponse;
    }

    // 4. Handle next-intl
    const response = intlMiddleware(request);

    // 5. Merge cookies safely
    const supabaseCookies = supabaseResponse.headers.getSetCookie();
    for (const cookie of supabaseCookies) {
      response.headers.append('Set-Cookie', cookie);
    }

    return response;
  } catch (e) {
    console.error('Middleware crash:', e);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/', '/(ar|en)/:path*', '/((?!api|auth|_next|_vercel|.*\\..*).*)']
}
