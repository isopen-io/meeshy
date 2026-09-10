import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';

import type { CSSProperties } from 'react';

import type { Conversation } from '@/lib/api/types';

/**
 * L'ACCENT DE LA CONVERSATION — calculé par `@meeshy/shared`, posé en variable CSS.
 *
 * Le POC tirait une TEINTE 1..4 d'une palette catégorielle inventée, et la
 * stockait sur la conversation. C'était une jumelle : la loi du dépôt est
 * `primary = blend(langue × 0,30, type × 0,30, thème × 0,40)`, miroir exact de
 * `DynamicColorGenerator.colorFor(context:)` côté iOS, et la règle est écrite
 * noir sur blanc — « ALL conversation-context components MUST use accentColor,
 * never hardcode colors ». Quatre teintes ne pouvaient pas rendre la même
 * couleur qu'iOS pour la même conversation ; deux plateformes affichaient donc
 * deux accents pour un même fil.
 *
 * POURQUOI UNE VARIABLE CSS. Côté iOS chaque vue reçoit l'accent en paramètre.
 * Sur le web, une variable posée sur le conteneur le fait descendre à toute la
 * sous-arborescence sans qu'un composant intermédiaire ait à le connaître : les
 * bulles, les puces, les bordures et le composeur lisent `var(--accent)`. C'est
 * le mécanisme qui rend tenable la règle « aucun composant de conversation ne
 * code une couleur en dur ».
 */
export const accentOf = (conversation: Conversation): string =>
  conversationAccentPalette({
    name: conversation.title ?? conversation.identifier ?? conversation.id,
    type: conversation.type,
  }).primary;

/**
 * LA LUMINANCE RELATIVE WCAG — miroir EXACT de `Color.luminance`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Theme/ColorExtensions.swift:62-70`),
 * la même formule aux mêmes coefficients. Rendue ici plutôt qu'importée : la
 * loi vit côté Swift, sa transcription est de trois lignes, et `@meeshy/shared`
 * n'en expose aucune.
 */
const relativeLuminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const c = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
};

/**
 * LE SEUIL DE BASCULE ENCRE NOIRE / ENCRE BLANCHE — le point où les deux
 * rendent EXACTEMENT le même rapport de contraste : `(L+0,05)/0,05 =
 * 1,05/(L+0,05)`, donc `L = √(0,05 × 1,05) − 0,05 ≈ 0,179`. Écrit comme la
 * FORMULE, jamais comme le nombre : c'est une conséquence de la définition
 * WCAG du contraste, pas une constante de design à dériver (D-4).
 *
 * ÉCART ASSUMÉ AVEC iOS, ET LA MESURE QUI LE MOTIVE.
 * `ConversationScrollControlsView.swift:150-152` bascule à `luminance > 0,6`.
 * Sur le PREMIER accent du jeu de fixtures (`#46BDCA`, L = 0,4196) cette
 * règle élit le BLANC — mesuré pendant la revue de #5774 : 1,98:1 en schéma
 * clair et 2,98:1 en sombre sur la teinte à 85 % du bouton « revenir en
 * bas », sous la barre AA (4,5:1) ET sous celle des objets graphiques
 * (3:1) ; l'encre noire y vaut 10,61:1 et 7,04:1. L'INTENTION d'iOS est de
 * servir l'encre LISIBLE ; `0,6` en est une implémentation qui se trompe sur
 * toute la plage 0,179 → 0,6. La v3.1 garde l'intention et corrige le seuil,
 * comme #5625 l'a fait pour `textSecondary` — le défaut iOS correspondant
 * est à ouvrir en issue compagnon (revue #5774).
 */
const INK_SWITCH_LUMINANCE = Math.sqrt(0.05 * 1.05) - 0.05;

/**
 * L'ENCRE LISIBLE SUR UNE SURFACE PEINTE À L'ACCENT — le noir ou le blanc,
 * celui des deux qui contraste le PLUS. Un seul site : toute surface teintée
 * par `--accent` (bouton « revenir en bas », badges, capsules à venir) lit
 * `var(--accent-ink)` plutôt que d'écrire `#fff` en dur — c'est le motif que
 * les trente écrans qui suivent copieront.
 */
export const inkOnAccent = (accent: string): string =>
  relativeLuminance(accent) > INK_SWITCH_LUMINANCE ? '#000000' : '#FFFFFF';

export function withAccent(accent: string, rest?: CSSProperties): CSSProperties {
  return { ...rest, '--accent': accent, '--accent-ink': inkOnAccent(accent) } as CSSProperties;
}
