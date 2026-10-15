import { appearanceFromPreferences, type ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';

import type { Conversation } from '@/lib/api/types';

/**
 * L'APPARENCE PERSONNELLE D'UNE CONVERSATION (#10631, § 5.4) — lue sur
 * l'entrée UNIQUE de `userPreferences` que la liste et le fil portent déjà
 * (cache d'abord : aucun appel de plus). Tolérante par champ : un `kind` venu
 * d'une passerelle plus récente retombe sur Signature sans perdre l'accent.
 */
export const appearanceOf = (conversation: Pick<Conversation, 'userPreferences'>): ConversationAppearance =>
  appearanceFromPreferences(conversation.userPreferences);

const entryOf = (conversation: Pick<Conversation, 'userPreferences'>): Readonly<Record<string, unknown>> => {
  const raw = conversation.userPreferences;
  const [entry] = Array.isArray(raw) ? (raw as readonly unknown[]) : [];
  return typeof entry === 'object' && entry !== null ? (entry as Readonly<Record<string, unknown>>) : {};
};

/** La conversation portant `appearance` dans son entrée de préférences (`null` = remise à Signature). */
export const withAppearance = <C extends Pick<Conversation, 'userPreferences'>>(conversation: C, appearance: ConversationAppearance | null): C => ({
  ...conversation,
  userPreferences: [{ ...entryOf(conversation), appearance }],
});

/** La valeur BRUTE stockée — pour rétablir exactement l'état d'avant un refus (y compris l'absence de la clé). */
export const rawAppearanceOf = (conversation: Pick<Conversation, 'userPreferences'>): { readonly present: boolean; readonly value: unknown } => {
  const entry = entryOf(conversation);
  return { present: 'appearance' in entry, value: entry['appearance'] };
};

export const withRawAppearance = <C extends Pick<Conversation, 'userPreferences'>>(conversation: C, raw: { readonly present: boolean; readonly value: unknown }): C => {
  const { appearance: _removed, ...rest } = entryOf(conversation);
  return { ...conversation, userPreferences: [raw.present ? { ...rest, appearance: raw.value } : rest] };
};
