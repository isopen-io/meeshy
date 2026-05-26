'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { V2ThemeProvider, ThemeScript, ToastProvider, SplitViewProvider } from '@/components/v2';

/**
 * Feeds Layout (v1)
 *
 * The post feature is rendered with the Global Pulse design system —
 * the same component family that powers the v2 surface — but mounted at
 * the canonical, version-agnostic paths (`/feeds`, `/feeds/post/:postId`)
 * so external share URLs minted by the gateway (`meeshy.me/feeds/post/...`)
 * and the iOS universal-link parser stay aligned with the web router.
 *
 * Wrapping order matters:
 *  1. `AuthGuard` blocks pre-auth, redirecting to the v1 login surface.
 *  2. `V2ThemeProvider` + `ThemeScript` install the `var(--gp-*)` tokens
 *     before any descendant paints, avoiding the dark-mode flash that
 *     would happen if the script ran after first hydration.
 *  3. `ToastProvider` makes `useToast()` available to PostCard, PostDetail,
 *     and the composers.
 *  4. `SplitViewProvider` is required by `PageHeader`, which reads
 *     `useSplitView()` to expose the mobile back-button affordance.
 */
export default function FeedsLayout({ children }: { children: ReactNode }) {
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
