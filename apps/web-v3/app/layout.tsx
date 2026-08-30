import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { DOCUMENT_LANGUAGE } from './document-language';
import { SpriteCritique } from './sprite-critique';
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
 *
 * Le sous-sprite critique voyage ici pour une raison de même nature : un
 * `<use href="#ph-…">` ne résout que dans le document courant, et le § 8.5 lui
 * assigne nommément la coquille. Sa raison d'être, glyphe par glyphe, est dans
 * `app/sprite-critique.tsx` et `packages/icons/critique.json`.
 */
export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang={DOCUMENT_LANGUAGE} className={THEME_PAR_DEFAUT} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <SpriteCritique />
        {children}
      </body>
    </html>
  );
}
