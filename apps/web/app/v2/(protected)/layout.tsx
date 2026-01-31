'use client';

import { AuthGuardV2, SplitViewLayout } from '@/components/v2';

/**
 * Protected Layout for V2 routes
 *
 * All routes under /v2/(protected)/ will require authentication.
 * If the user is not authenticated, they will be redirected to /v2/login.
 *
 * Uses SplitViewLayout to always show conversation list on the left
 * and the current page content on the right.
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuardV2>
      <SplitViewLayout>{children}</SplitViewLayout>
    </AuthGuardV2>
  );
}
