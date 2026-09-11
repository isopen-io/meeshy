/**
 * LE MODE SÉLECTION DU FIL (#5814, question 5) — MINIMAL : Annuler · compte ·
 * Copier. Miroir `ConversationView+Selection.swift:13-18` pour le PLAFOND
 * (`ConversationView.swift:88`), Transférer/Supprimer restant une issue
 * compagnon (aucun port serveur ce lot — loi 4).
 */

export const SELECTION_CAP = 100;

export type SelectionState = {
  readonly ids: readonly string[];
  readonly reason?: 'cap';
};

export type SelectionEvent =
  | { readonly type: 'begin'; readonly id: string }
  | { readonly type: 'toggle'; readonly id: string }
  | { readonly type: 'end' };

/** `null` en sortie ⇒ mode sélection quitté (`end`, ou aucune sélection). */
export function selectionReducer(state: SelectionState | null, event: SelectionEvent): SelectionState | null {
  if (event.type === 'end') return null;
  if (event.type === 'begin') return { ids: [event.id] };
  if (state === null) return { ids: [event.id] };

  if (state.ids.includes(event.id)) {
    const ids = state.ids.filter((id) => id !== event.id);
    return ids.length === 0 ? null : { ids };
  }
  if (state.ids.length >= SELECTION_CAP) return { ids: state.ids, reason: 'cap' };
  return { ids: [...state.ids, event.id] };
}

/** L'ordre du FIL, jamais l'ordre de sélection — miroir `orderedIds` de la
 * spécification : `placed` porte l'ordre canonique, `selected` filtre. */
export function orderedIds(
  placed: readonly { readonly message: { readonly id: string } }[],
  selected: ReadonlySet<string>,
): readonly string[] {
  return placed.filter((p) => selected.has(p.message.id)).map((p) => p.message.id);
}

/** Le texte à copier — les extraits SERVIS, dans l'ordre du fil, joints par
 * un saut de ligne (miroir `ConversationView.swift`, « Copier » de la barre
 * de sélection). `served` fournit le texte de CHAQUE id, `undefined` s'il
 * n'a rien à copier (message sans texte) — filtré silencieusement. */
export function copyTextOf(ids: readonly string[], served: (id: string) => string | undefined): string {
  return ids
    .map((id) => served(id))
    .filter((text): text is string => text !== undefined && text.length > 0)
    .join('\n');
}
