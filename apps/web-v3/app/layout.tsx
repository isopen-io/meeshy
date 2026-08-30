import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { documentDir } from '@/lib/a11y/lang-attr';
import { getServerLocale } from '@/lib/a11y/server-locale';

import { ThemeScript } from './ThemeScript';

export const metadata: Metadata = {
  title: 'Meeshy',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const locale = await getServerLocale();

  return (
    <html lang={locale} dir={documentDir(locale)} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
