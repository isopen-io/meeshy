import { authorAccentColor, colorForName } from '@meeshy/shared/utils/conversation-colors';

import { legibleTint } from '@/lib/view/author-ink';

import type { ActiveCall } from './call-store';

/**
 * **LA COULEUR DE L'AUTEUR, DANS L'APPEL AUSSI** (#16614, décision #16612) —
 * le sous-titre d'une personne (son texte ET son nom) et le liseré de sa
 * vignette portent la couleur vive qu'elle a PARTOUT ailleurs :
 * `authorAccentColor` (`@meeshy/shared`, miroir iOS
 * `DynamicColorGenerator.colorForName(userId)`), l'identifiant primant sur le
 * nom. Aucune seconde palette : celle de #8393 divergeait du fil.
 *
 * Le verre d'appel est sombre : la teinte est éclaircie vers le blanc du plus
 * petit pas qui la rend lisible (AA) sur le pire fond de
 * `glass-call-prominent` (mesuré par `call-speaker-color.test.ts`) — le geste
 * d'`adaptedColor(.dark)` côté iOS.
 */

/** Le pire fond de `glass-call-prominent` (`glassWorstCaseBackground`, sur toile blanche, les deux schémas). */
export const CALL_GLASS_WORST_BACKGROUND = '#3e3b64';

const WHITE = '#ffffff';

export const SELF_SPEAKER_COLOR = 'var(--color-on-media)';

export function speakerColor(userId: string, name = ''): string {
  return legibleTint({ tint: authorAccentColor(userId, name).toLowerCase(), toward: WHITE, backgrounds: [CALL_GLASS_WORST_BACKGROUND] });
}

/**
 * La couleur de l'AUTRE telle que l'écran d'appel la montre — son portrait et le liseré de sa vignette —, que la
 * bulle de l'appel réduit garde (P18.4) : réduire l'appel ne change pas sa couleur. Sans pair connu (un groupe),
 * celle du nom, comme le portrait (`call-portrait.tsx`).
 */
export function peerColor({ peerKey, title }: Pick<ActiveCall, 'peerKey' | 'title'>): string {
  return peerKey == null || peerKey === '' ? colorForName(title) : speakerColor(peerKey, title);
}
