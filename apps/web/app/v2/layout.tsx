'use client';

import { V2ThemeProvider, ThemeScript, ToastProvider } from '@/components/v2';

/**
 * V2 Layout - Global Pulse Design System
 *
 * Wraps all V2 pages with the theme provider, toast provider, and injects
 * the theme script to prevent flash on load.
 */
export default function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <V2ThemeProvider defaultTheme="system">
      <ThemeScript />
      <ToastProvider>
        {children}
      </ToastProvider>
    </V2ThemeProvider>
  );
}
