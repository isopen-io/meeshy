import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { ReadingModeStore } from './store';

/**
 * UN SEUL IDENTIFIANT PERSISTANT PAR CONVERSATION (revue-correction #5793,
 * défaut majeur) — extrait de `routes/thread.tsx`, qui lisait/écrivait le
 * mode collant et `lastOpenedAt` sous `threadData.conversationId`
 * (`conversation.data?.id ?? id`, `lib/api/query.ts`). Ce repli fait de
 * l'IDENTIFIANT DE ROUTE une clé de persistance à part entière tant que la
 * conversation n'est pas résolue : sur un lien `/c/<identifiant>` (les
 * coques, `MEESHY_SHELL_START_PATH`), le PREMIER rendu lisait sous
 * l'identifiant, et toute écriture postérieure à la résolution (l'utilisateur
 * ne peut choisir un mode qu'une fois l'écran interactif, donc après
 * résolution) partait sous l'ObjectId — DEUX clés `localStorage` pour une
 * seule conversation.
 *
 * Ce hook ne lit ni n'écrit RIEN tant que `conversationId` est `undefined` —
 * l'écran est de toute façon en `pending` à cet instant
 * (`threadData.status === 'pending' || conversation === undefined` dans
 * `thread.tsx`) : `conversation?.id` (jamais `threadData.conversationId`,
 * qui replie sur le paramètre de route) est le SEUL identifiant qui atteint
 * ce hook, et il ne devient non-`undefined` qu'une fois la passerelle
 * elle-même redue l'ObjectId canonique (`GET /conversations/:id`,
 * `core-detail.ts:244-358`, « ID or identifier »).
 *
 * La lecture (préférence + `lastOpenedAt`) et l'écriture (`noteOpened`) ne se
 * produisent qu'UNE fois par (scope, conversationId) résolu — `seededKey`
 * (une paire, jamais une simple chaîne concaténée : un scope qui contiendrait
 * `::` casserait un test d'égalité sur chaîne, jamais une comparaison de
 * paire) le garde, y compris à travers les re-rendus que le virtualiseur du
 * fil déclenche à chaque image de défilement.
 */
export type PersistedReadingMode = {
  readonly stickyMode: ConversationReadingMode | null;
  readonly lastOpenedAt: Date | null;
  readonly selectMode: (mode: ConversationReadingMode) => void;
  readonly resetToAuto: () => void;
};

export function usePersistedReadingMode(params: {
  readonly store: ReadingModeStore;
  readonly scope: string;
  /** `conversation?.id` — jamais un repli sur le paramètre de route. */
  readonly conversationId: string | undefined;
  readonly openedAt: Date;
}): PersistedReadingMode {
  const { store, scope, conversationId, openedAt } = params;
  const [stickyMode, setStickyMode] = useState<ConversationReadingMode | null>(null);
  const [lastOpenedAt, setLastOpenedAt] = useState<Date | null>(null);
  const seededKey = useRef<{ readonly scope: string; readonly conversationId: string } | null>(null);

  useEffect(() => {
    if (conversationId === undefined) return;
    const already =
      seededKey.current !== null &&
      seededKey.current.scope === scope &&
      seededKey.current.conversationId === conversationId;
    if (already) return;
    seededKey.current = { scope, conversationId };
    setStickyMode(store.getPreference(scope, conversationId));
    setLastOpenedAt(store.lastOpenedAt(scope, conversationId));
    store.noteOpened(scope, conversationId, openedAt);
  }, [store, scope, conversationId, openedAt]);

  const selectMode = useCallback(
    (mode: ConversationReadingMode) => {
      if (conversationId === undefined) return;
      store.setPreference(scope, conversationId, mode);
      setStickyMode(mode);
    },
    [store, scope, conversationId],
  );

  const resetToAuto = useCallback(() => {
    if (conversationId === undefined) return;
    store.setPreference(scope, conversationId, null);
    setStickyMode(null);
  }, [store, scope, conversationId]);

  return { stickyMode, lastOpenedAt, selectMode, resetToAuto };
}
