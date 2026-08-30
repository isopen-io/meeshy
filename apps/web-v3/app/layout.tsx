import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { DOCUMENT_LANGUAGE } from './document-language';
import { ThemeScript } from './theme-script';

export const metadata: Metadata = {
  title: 'Meeshy',
  description: 'Messagerie multilingue en temps réel',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang={DOCUMENT_LANGUAGE} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
