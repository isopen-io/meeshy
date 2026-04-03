/**
 * Route Utilities
 * Provides logic to identify public vs protected routes
 */

/**
 * List of static public routes
 */
export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/register',
  '/partners',
  '/privacy',
  '/contact',
  '/about',
  '/terms',
  '/forgot-password',
  '/forgot-password/check-email',
  '/reset-password',
  '/auth-status'
];

/**
 * Checks if a given pathname is a public route
 *
 * @param pathname Pathname to check
 * @returns boolean True if the route is public
 */
export function isPublicRoute(pathname: string): boolean {
  if (!pathname) return true;

  // Clean pathname (remove trailing slash except for root)
  const cleanPath = pathname !== '/' && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  // 1. Static public routes
  if (PUBLIC_ROUTES.includes(cleanPath)) return true;

  // 2. v2 routes (new UI)
  if (cleanPath.startsWith('/v2')) return true;

  // 3. Auth routes (verify-email, etc)
  if (cleanPath.startsWith('/auth/')) return true;

  // 4. Tracking routes
  if (cleanPath.startsWith('/l/') || cleanPath.startsWith('/links/tracked/')) return true;

  // 5. Affiliate routes
  if (cleanPath.startsWith('/signup/affiliate/')) return true;

  // 6. Join routes
  if (cleanPath.startsWith('/join/')) return true;

  return false;
}

/**
 * Checks if a pathname is a shared chat route
 */
export function isSharedChatRoute(pathname: string): boolean {
  return pathname.startsWith('/chat/');
}
