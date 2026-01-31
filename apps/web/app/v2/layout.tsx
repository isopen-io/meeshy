'use client';

import { V2ThemeProvider, ThemeScript } from '@/components/v2';

/**
 * V2 Layout - Global Pulse Design System
 *
 * Wraps all V2 pages with the theme provider and injects
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
      {children}
    </V2ThemeProvider>
  );
}
