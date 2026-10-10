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

/**
 * **UNE COTE COMPTÉE DEPUIS LE HAUT DE L'ÉCRAN, ÉCRITE UNE SEULE FOIS**
 * (#9942, #9517) — pour un `top` ou un `padding-top` de chrome `fixed`.
 *
 * Le haut RÉSERVÉ de l'écran n'est pas l'encoche : sur les hubs, la coquille
 * ajoute la hauteur du bandeau du haut à `--safe-top` quand la bannière du
 * joueur l'occupe (#9494), et tout écran qui lit `pt-safe` descend d'autant.
 * Un chrome qui lit `env(safe-area-inset-top)` seul reste, pendant que l'écran
 * descend — mesuré en #9517 : le disque du menu recouvrait « Créer une story »
 * et la pastille hors ligne retombait au milieu d'un rail.
 *
 * Le repli `env()` est dans la formule et n'en sort pas : `--safe-top` est
 * posée sur `:root` par `styles/thread-menu.css`, mais un `calc` dont la
 * variable est absente SANS repli est invalide, donc la propriété entière
 * tombe en silence — la forme de défaut que `styles/declared-tokens.test.ts`
 * a pour rôle d'empêcher.
 *
 * Ce qui reste HORS de cette cote, et pourquoi : la pile du haut elle-même, la
 * bannière de mise à jour et le toast de notification se posent sur l'encoche
 * réelle — ils SONT le haut de la fenêtre, pas un chrome de l'écran.
 */
export function belowScreenTop(pixels: number): string {
  return `calc(var(--safe-top, env(safe-area-inset-top, 0px)) + ${pixels}px)`;
}
