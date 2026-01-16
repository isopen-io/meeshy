import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Nom du cookie de session contenant les permissions utilisateur
 * Ce cookie est défini par auth-manager.service.ts lors du login
 */
const SESSION_COOKIE_NAME = 'meeshy_session';

/**
 * Décode et parse le cookie de session
 * Format: { role: string, canAccessAdmin: boolean, userId: string }
 */
function parseSessionCookie(cookieValue: string): {
  role: string;
  canAccessAdmin: boolean;
  userId: string;
} | null {
  try {
    // Le cookie est encodé en base64 pour éviter les problèmes de caractères
    const decoded = atob(cookieValue);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // =============================================================================
  // PROTECTION DES ROUTES ADMIN (Priorité 2 - Conditional Loading)
  // Empêche le chargement du bundle admin pour les non-admins
  // =============================================================================

  if (pathname.startsWith('/admin')) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    // Pas de cookie de session = pas connecté, rediriger vers login
    if (!sessionCookie) {
      const loginUrl = new URL('/signup', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Parser le cookie de session
    const session = parseSessionCookie(sessionCookie);

    // Cookie invalide ou pas de permission admin = rediriger vers dashboard
    if (!session || !session.canAccessAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // L'utilisateur a accès admin, continuer
  }

  // =============================================================================
  // GESTION DES TOKENS D'AFFILIATION
  // =============================================================================

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
