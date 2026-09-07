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

export function withAccent(accent: string, rest?: CSSProperties): CSSProperties {
  return { ...rest, '--accent': accent } as CSSProperties;
}
