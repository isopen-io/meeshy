'use client';

import './globals.css';
import { V2ThemeProvider, ThemeScript, ToastProvider } from '@/components';

/**
 * Root Layout - Meeshy V2
 *
 * Wraps all pages with the theme provider, toast provider, and injects
 * the theme script to prevent flash on load.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[var(--gp-background)] text-[var(--gp-text-primary)] antialiased">
        <V2ThemeProvider defaultTheme="system">
          <ThemeScript />
          <ToastProvider>
            {children}
          </ToastProvider>
        </V2ThemeProvider>
      </body>
    </html>
  );
}
