import { NextResponse, type NextRequest } from 'next/server';
/* Tells the layout which section is active (for the navigation highlight). */
export function middleware(req: NextRequest) {
  const h = new Headers(req.headers); h.set('x-pp-page', req.nextUrl.pathname.split('/')[1] || 'home');
  return NextResponse.next({ request: { headers: h } });
}
export const config = { matcher: ['/((?!api|_next|img|icon).*)'] };
