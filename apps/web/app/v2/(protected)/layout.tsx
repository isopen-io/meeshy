'use client';

import { AuthGuardV2 } from '@/components/v2/auth/AuthGuardV2';

/**
 * Protected Layout for V2 routes
 *
 * All routes under /v2/(protected)/ will require authentication.
 * If the user is not authenticated, they will be redirected to /v2/login.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuardV2>{children}</AuthGuardV2>;
}
