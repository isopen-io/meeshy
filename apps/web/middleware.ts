import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  
  // Détecter le paramètre affiliate dans l'URL
  const affiliateToken = searchParams.get('affiliate');
  
  // Si un token d'affiliation est présent dans les paramètres de requête
  if (affiliateToken && pathname === '/') {
    // Créer une réponse de redirection vers la page d'accueil sans le paramètre
    const url = request.nextUrl.clone();
    url.searchParams.delete('affiliate');
    
    const response = NextResponse.redirect(url);
    
    // Sauvegarder le token dans un cookie (expire dans 30 jours)
    response.cookies.set('meeshy_affiliate_token', affiliateToken, {
      maxAge: 30 * 24 * 60 * 60, // 30 jours
      path: '/',
      httpOnly: false, // Permettre l'accès depuis JavaScript pour localStorage
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
