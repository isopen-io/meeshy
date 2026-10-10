import type { StorageLike } from '@/lib/reading-mode/store';

/**
 * **CE QUE L'EN-TÊTE D'UNE CONVERSATION RETIENT, SUR L'APPAREIL** (#9031) —
 * miroir de `ConversationHeaderMemory` (iOS) : l'en-tête DÉPLIÉ, et la flamme
 * du jour que le lecteur a touchée pour la faire disparaître. Clés scopées par
 * (lecteur, conversation), comme le mode de lecture : deux comptes sur un même
 * navigateur ne partagent rien.
 *
 * `localStorage` absent ou qui lance (navigation privée, quota) : la valeur
 * reste en mémoire pour la session, aucune exception ne fuit.
 */
export type HeaderMemoryState = {
  readonly expanded: boolean;
  readonly flameDismissed: boolean;
};

export type HeaderMemory = {
  readonly read: (scope: string, conversationId: string) => HeaderMemoryState;
  readonly write: (scope: string, conversationId: string, state: HeaderMemoryState) => void;
};

const EMPTY: HeaderMemoryState = { expanded: false, flameDismissed: false };

const keyOf = (scope: string, conversationId: string): string => `meeshy.conversation-header.${scope}.${conversationId}`;

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): HeaderMemoryState {
  if (raw === null) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY;
    const record = value as Record<string, unknown>;
    return { expanded: record.expanded === true, flameDismissed: record.flameDismissed === true };
  } catch {
    return EMPTY;
  }
}

export function createHeaderMemory(backend: StorageLike | null | undefined = browserStorage()): HeaderMemory {
  const memory = new Map<string, HeaderMemoryState>();
  return {
    read: (scope, conversationId) => {
      const key = keyOf(scope, conversationId);
      const held = memory.get(key);
      if (held !== undefined) return held;
      try {
        return parse(backend?.getItem(key) ?? null);
      } catch {
        return EMPTY;
      }
    },
    write: (scope, conversationId, state) => {
      if (conversationId === '') return;
      const key = keyOf(scope, conversationId);
      memory.set(key, state);
      try {
        if (!state.expanded && !state.flameDismissed) backend?.removeItem(key);
        else backend?.setItem(key, JSON.stringify({ expanded: state.expanded, flameDismissed: state.flameDismissed }));
      } catch {
        /* Le stockage refuse : la session garde la valeur en mémoire. */
      }
    },
  };
}

export const headerMemory: HeaderMemory = createHeaderMemory();

/**
 * Le geste du lecteur sur l'en-tête : déplier ramène la flamme qu'il avait
 * touchée — elle reparaît au repli. Miroir de `HeaderFlameVisibility`.
 */
export const afterHeaderToggle = (state: HeaderMemoryState, expanded: boolean): HeaderMemoryState => ({
  expanded,
  flameDismissed: expanded ? false : state.flameDismissed,
});

export const afterFlameDismissed = (state: HeaderMemoryState): HeaderMemoryState => ({ ...state, flameDismissed: true });

/** La flamme vit sous l'avatar de l'en-tête REPLIÉ, hors aperçu, tant que la
 * conversation a rapporté des points et que le lecteur ne l'a pas touchée. */
export const headerFlameShown = (input: {
  readonly expanded: boolean;
  readonly preview: boolean;
  readonly dismissed: boolean;
  readonly hasEngagement: boolean;
}): boolean => !input.expanded && !input.preview && !input.dismissed && input.hasEngagement;
