import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionData } from '@/utils/getSeesion';
// This function can be marked `async` if using `await` inside

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl

    if (!getSessionData()) {
        return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();

}

export const config = {
    matcher: '/about/:path*',
}