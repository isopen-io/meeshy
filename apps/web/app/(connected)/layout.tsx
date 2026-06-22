'use client';

import { V2ThemeProvider, ThemeScript, ToastProvider, SplitViewProvider } from '@/components/v2';
import { AuthGuard } from '@/components/auth';
import { useFCMNotifications } from '@/hooks/use-fcm-notifications';

/**
 * Layout des pages connectées migrées depuis l'ancienne app de test v2
 * (/me, /contacts, /communities). Reprend le pattern de `app/feeds/layout.tsx`
 * (design-system partagé `components/v2`, recoloré v1) + garde d'authentification
 * v1. Le `SplitViewProvider` fournit le contexte requis par `PageHeader`.
 */
function PushNotificationProvider() {
  useFCMNotifications({ autoSyncToken: true });
  return null;
}

export default function ConnectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <V2ThemeProvider defaultTheme="system">
      <ThemeScript />
      <ToastProvider>
        <AuthGuard>
          <PushNotificationProvider />
          <SplitViewProvider>{children}</SplitViewProvider>
        </AuthGuard>
      </ToastProvider>
    </V2ThemeProvider>
  );
}
