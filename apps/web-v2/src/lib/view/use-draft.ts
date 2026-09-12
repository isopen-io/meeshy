import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { ComposeProtection } from '@/lib/send/compose-protection';
import type { ComposerDraft, DraftStore } from '@/lib/send/draft-store';

/** `DRAFT_DEBOUNCE_MS` — miroir `ConversationComposerTextModel.swift:19-78`
 * (« milieu de mot ⇒ 400 ms »). */
export const DRAFT_DEBOUNCE_MS = 400;

export type ComposerDraftReport = {
  readonly text: string;
  readonly language: string;
  readonly protection: ComposeProtection;
  readonly replyToId?: string;
};

/**
 * LA PERSISTANCE DU BROUILLON (#6175) — miroir de la politique
 * `ConversationComposerTextModel.swift:19-78` : fin de mot (espace, retour)
 * ou champ VIDÉ ⇒ persistance IMMÉDIATE ; milieu de mot ⇒ 400 ms ; sortie de
 * vue / perte de focus ⇒ `flush()` (miroir `flushPendingChange()`).
 *
 * LA LECTURE EST SYNCHRONE (`useMemo`), PAS DIFFÉRÉE PAR UN EFFET
 * (revue-correction interne, avant toute livraison) — `usePersistedReadingMode`
 * seed son état via un effet parce qu'elle doit aussi ÉCRIRE (`noteOpened`),
 * ce qui ne peut pas arriver PENDANT le rendu. Cette lecture-ci n'écrit
 * rien : la seeder via un effet aurait fait mentir `Composer`, qui capture
 * `draft` dans un `useState` PARESSEUX (le champ est un contrôle NON
 * contrôlé) — Composer monte pour la PREMIÈRE fois exactement au rendu où
 * `conversationId` cesse d'être `undefined` (thread.tsx ne rend le fil
 * qu'une fois la conversation résolue), donc un effet qui peuple `initial`
 * UNE image plus tard arrive trop tard pour ce montage : la graine se
 * perdrait à chaque ouverture. `useMemo` calcule la même valeur, mais DANS
 * le rendu qui monte `Composer`, jamais après.
 *
 * MÊME BORNE de fréquence que `usePersistedReadingMode` malgré tout :
 * `useMemo` ne relit `store.getDraft` que quand (scope, conversationId)
 * change, jamais à chaque re-rendu du virtualiseur — `store.getDraft` est
 * une lecture PURE (jamais une écriture), donc la mémoïsation est un choix
 * de PERFORMANCE ici, pas une garantie de correction comme pour un effet qui
 * écrirait. Ne lit RIEN tant que `conversationId` est `undefined`.
 */
export function useComposerDraft(params: {
  readonly store: DraftStore;
  readonly scope: string;
  readonly conversationId: string | undefined;
}): {
  /** La graine, lue UNE fois par (scope, conversationId) — `null` : aucun
   * brouillon (ou le magasin pas encore interrogé). */
  readonly initial: ComposerDraft | null;
  /** Appelée à CHAQUE changement (texte, langue, protection, réponse) — la
   * politique de débounce décide SEULE quand l'écriture atteint le magasin. */
  readonly report: (draft: ComposerDraftReport) => void;
  /** Écrit immédiatement toute valeur en attente — sortie de vue, perte de
   * focus, démontage. */
  readonly flush: () => void;
} {
  const { store, scope, conversationId } = params;
  const initial = useMemo(
    () => (conversationId === undefined ? null : store.getDraft(scope, conversationId)),
    [store, scope, conversationId],
  );

  const pendingRef = useRef<ComposerDraftReport | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const writeNow = useCallback(
    (draft: ComposerDraftReport) => {
      if (conversationId === undefined) return;
      store.setDraft(scope, conversationId, { text: draft.text, language: draft.language, protection: draft.protection, ...(draft.replyToId === undefined ? {} : { replyToId: draft.replyToId }) });
      pendingRef.current = null;
    },
    [store, scope, conversationId],
  );

  const flush = useCallback(() => {
    clearTimer();
    if (pendingRef.current !== null) writeNow(pendingRef.current);
  }, [clearTimer, writeNow]);

  const report = useCallback(
    (draft: ComposerDraftReport) => {
      if (conversationId === undefined) return;
      clearTimer();
      const atWordEnd = draft.text === '' || /[\s\n]$/u.test(draft.text);
      if (atWordEnd) {
        writeNow(draft);
        return;
      }
      pendingRef.current = draft;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (pendingRef.current !== null) writeNow(pendingRef.current);
      }, DRAFT_DEBOUNCE_MS);
    },
    [clearTimer, writeNow, conversationId],
  );

  useEffect(() => () => flush(), [flush]);

  return { initial, report, flush };
}
