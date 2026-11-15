import { useCallback, useId, useState } from 'react';

import type { MentionCandidate } from '@/lib/api/mention-suggestions';

import { insertMention } from './mention-query';
import type { MentionSource } from './mention-source';
import { useMentionSuggestions, type MentionSuggestions } from './use-mention-suggestions';

/** L'identifiant d'une rangée — `aria-activedescendant` du champ le vise. */
export const mentionOptionId = (listId: string, index: number): string => `${listId}-option-${index}`;

export type MentionFieldElement = HTMLTextAreaElement | HTMLInputElement;

export type MentionKeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'preventDefault' | 'stopPropagation'>;

export type MentionFieldAria = {
  readonly 'aria-autocomplete': 'list';
  readonly 'aria-controls'?: string;
  readonly 'aria-activedescendant'?: string;
};

export type MentionField = {
  readonly suggestions: MentionSuggestions;
  readonly listId: string;
  /** Le motif « champ + liste à descendant actif », à répandre sur le champ. */
  readonly aria: MentionFieldAria;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  /** À appeler à chaque frappe, clic et flèche : la requête se lit au curseur. */
  readonly syncCaret: (el: MentionFieldElement) => void;
  /** Rend `true` quand la touche appartenait à la liste — elle est alors
   * consommée (`preventDefault` + `stopPropagation`) et le champ n'en fait rien. */
  readonly onKeyDown: (event: MentionKeyEvent) => boolean;
  readonly pick: (candidate: MentionCandidate) => void;
  /** Écrire dans le champ en y replaçant le curseur (insertion, emoji…). */
  readonly write: (next: string, caret: number) => void;
};

/**
 * LE MÉCANISME UNIQUE D'UN CHAMP QUI MENTIONNE (#7846) — ce que le composeur
 * du fil faisait pour lui seul (#7826), rendu à TOUS les champs qui écrivent
 * du texte que la passerelle lit pour ses mentions : le curseur, le focus,
 * le clavier de la liste, l'insertion de `@username `, et la liste elle-même
 * (`useMentionSuggestions`, contacts → participants → autres).
 *
 * Le champ garde son état (`text`, `onText`) : le mécanisme ne fait que le
 * lire et y écrire. Il n'a qu'une chose à savoir de son hôte, son CONTEXTE
 * (`source`) — celui que le fil publie quand elle est absente.
 *
 * LE CLAVIER — ↑/↓ déplacent la rangée active, Entrée et Tab insèrent, Échap
 * ferme. Liste ouverte, Entrée n'envoie pas : on choisit une personne, on ne
 * part pas au milieu d'un nom. Une composition IME garde ses touches.
 *
 * LE CURSEUR SUIT CE QUI A ÉTÉ INSÉRÉ — sans le rappel différé de `write`, il
 * retombait au DÉBUT du champ (la valeur est réécrite au rendu, le navigateur
 * remet la sélection à 0) et le mot suivant s'écrivait avant la phrase.
 */
export function useMentionField(input: {
  readonly text: string;
  readonly fieldRef: { readonly current: MentionFieldElement | null };
  readonly onText: (next: string) => void;
  readonly source?: MentionSource | null;
}): MentionField {
  const { text, fieldRef, onText } = input;
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(() => text.length);
  const suggestions = useMentionSuggestions({
    text,
    caret,
    enabled: focused,
    ...(input.source === undefined ? {} : { source: input.source }),
  });
  const listId = useId();

  const syncCaret = useCallback((el: MentionFieldElement) => setCaret(el.selectionStart ?? el.value.length), []);

  const write = useCallback(
    (next: string, nextCaret: number) => {
      onText(next);
      setCaret(nextCaret);
      queueMicrotask(() => {
        const el = fieldRef.current;
        if (el === null) return;
        el.focus();
        el.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [onText, fieldRef],
  );

  const pick = (candidate: MentionCandidate) => {
    if (suggestions.query === null) return;
    const inserted = insertMention(text, suggestions.query, candidate.username);
    write(inserted.text, inserted.caret);
  };

  const consumed = (event: MentionKeyEvent): true => {
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const onKeyDown = (event: MentionKeyEvent): boolean => {
    if (!suggestions.open || event.isComposing) return false;
    if (event.key === 'Escape') {
      suggestions.dismiss();
      return consumed(event);
    }
    const active = suggestions.items[suggestions.activeIndex];
    if (active === undefined) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      suggestions.move(event.key === 'ArrowDown' ? 1 : -1);
      return consumed(event);
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      pick(active);
      return consumed(event);
    }
    return false;
  };

  const listShown = suggestions.open && suggestions.items.length > 0;
  const aria: MentionFieldAria = listShown
    ? {
        'aria-autocomplete': 'list',
        'aria-controls': listId,
        'aria-activedescendant': mentionOptionId(listId, suggestions.activeIndex),
      }
    : { 'aria-autocomplete': 'list' };

  return {
    suggestions,
    listId,
    aria,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    syncCaret,
    onKeyDown,
    pick,
    write,
  };
}
