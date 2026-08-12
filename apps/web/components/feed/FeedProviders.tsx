'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { V2ThemeProvider, ThemeScript, ToastProvider, SplitViewProvider } from '@/components/v2';

/**
 * Shared provider stack for the feed surface (posts + reels + stories).
 *
 * Mounted by both the canonical `/feed/*` routes and the legacy `/feeds/*`
 * aliases so the experience is identical regardless of the entry URL.
 *
 * Wrapping order matters:
 *  1. `AuthGuard` blocks pre-auth, redirecting to the login surface.
 *  2. `V2ThemeProvider` + `ThemeScript` install the `var(--gp-*)` tokens
 *     before any descendant paints, avoiding the dark-mode flash.
 *  3. `ToastProvider` makes `useToast()` available to PostCard / composers.
 *  4. `SplitViewProvider` is required by `PageHeader` for the mobile back button.
 */
export function FeedProviders({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requireAuth>
      <V2ThemeProvider defaultTheme="system">
        <ThemeScript />
        <ToastProvider>
          <SplitViewProvider>{children}</SplitViewProvider>
        </ToastProvider>
      </V2ThemeProvider>
    </AuthGuard>
  );
}

export default FeedProviders;
