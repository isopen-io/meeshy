/**
 * L'ENCOCHE, LUE UNE SEULE FOIS (#6213) — extrait de
 * `components/message-menu.tsx`, où cette fonction était privée, parce qu'un
 * SECOND lecteur est apparu (`use-thread-insets.ts`).
 *
 * `--safe-top` / `--safe-bottom` sont posées sur `:root` par
 * `styles/thread-menu.css`, qui les documente comme « la SEULE porte par
 * laquelle une loi PURE reçoit l'encoche de l'appareil ». Deux lectures
 * valent mieux qu'un second calcul d'`env()` en JavaScript ; deux ÉCRITURES
 * de la lecture, non — c'est la jumelle divergente que CLAUDE.md interdit.
 */
export type SafeAreaInsets = { readonly top: number; readonly bottom: number };

export function safeAreaInsets(): SafeAreaInsets {
  if (typeof window === 'undefined') return { top: 0, bottom: 0 };
  const style = getComputedStyle(document.documentElement);
  const top = Number.parseFloat(style.getPropertyValue('--safe-top')) || 0;
  const bottom = Number.parseFloat(style.getPropertyValue('--safe-bottom')) || 0;
  return { top, bottom };
}
