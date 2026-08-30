import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { DOCUMENT_LANGUAGE } from './document-language';
import { THEME_PAR_DEFAUT, ThemeScript } from './theme-script';

import './globals.css';

export const metadata: Metadata = {
  title: 'Meeshy',
  description: 'Messagerie multilingue en temps réel',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * La classe de thème est rendue par le SERVEUR, et le script inline ne fait
 * que la corriger.
 *
 * Sans elle, `<html>` arrivait nu : la conception impose `darkMode: ["class"]`
 * (§ 2), donc les utilitaires `dark:` de Tailwind auraient été INACTIFS chez un
 * visiteur sans JavaScript pendant que les jetons, portés par `:root` nu,
 * peignaient sombre — la « jumelle divergente » que le README interdit,
 * recréée dans le cas no-JS et garantie le jour où Tailwind est installé.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang={DOCUMENT_LANGUAGE} className={THEME_PAR_DEFAUT} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
