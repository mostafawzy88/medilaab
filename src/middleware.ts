import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export async function middleware(request: NextRequest) {
  // 1. Update Supabase session (standard pattern)
  // This ensures the session is refreshed and cookies are updated in the request/response
  const supabaseResponse = await updateSession(request);

  // 2. Determine if this path needs internationalization
  const { pathname } = request.nextUrl;
  
  // Skip intl for API, Auth and internal paths
  if (
    pathname.startsWith('/api') || 
    pathname.startsWith('/auth') || 
    pathname.startsWith('/_next') || 
    pathname.startsWith('/_vercel') ||
    pathname.includes('.') // Static files
  ) {
    return supabaseResponse;
  }

  // 3. Apply next-intl routing
  const response = intlMiddleware(request);

  // 4. Copy all Set-Cookie headers from Supabase to the final response
  // This is essential for session persistence
  supabaseResponse.headers.getSetCookie().forEach((cookie) => {
    response.headers.append('Set-Cookie', cookie);
  });

  return response;
}

export const config = {
  matcher: [
    // Match all non-static paths
    '/((?!_next|_vercel|.*\\..*).*)',
    // Always match the root
    '/'
  ]
}
