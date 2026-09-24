import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

/**
 * LE BROUILLON D'UN FIL, CITATION COMPRISE (revue-correction #6175, défaut
 * majeur — MESURÉ au navigateur avant correction).
 *
 * `Composer` ne connaît de la citation que sa forme PRÉ-ADRESSÉE
 * (`replyTo.author`/`excerpt`) : l'IDENTIFIANT n'appartient qu'à l'écran
 * (`replyTarget`, `routes/thread.tsx`). La première forme composait donc
 * `replyToId` DANS le rappel `onDraftChange` de l'écran — mais ce rappel
 * n'est appelé QUE par l'effet de `Composer`, dont les dépendances sont le
 * texte, la langue et la protection. **Choisir ou ANNULER une citation ne
 * rapportait donc rien** :
 *
 * · citer quelqu'un sans rien taper, puis quitter ⇒ la citation était perdue
 *   (mesuré : `{"text":…,"language":"en","protection":{}}` en magasin, aucun
 *   `replyToId`, et aucun bandeau au retour) ;
 * · citer, taper, puis ANNULER la citation ⇒ le magasin gardait l'ancien
 *   `replyToId`, et le bandeau RESSUSCITAIT à la réouverture — une annulation
 *   sans effet durable, la loi 4 prise à l'envers.
 *
 * iOS persiste bien à CHAQUE changement de réponse (`ConversationView.swift:324-346`).
 * Ce hook rend la citation au même rang que le texte : il POSSÈDE
 * `replyTarget`, le sème depuis le brouillon restauré et re-rapporte dès
 * qu'il change.
 *
 * LA GRAINE PASSE PAR UN EFFET, ET C'EST JUSTE ICI — contrairement au texte
 * (§ doc-comment ci-dessus, `useMemo` obligatoire parce que `Composer` capture
 * `draft.text` dans un `useState` PARESSEUX). `replyTarget` est un état de
 * l'ÉCRAN, et l'écran monte AVANT que la conversation soit résolue (retour
 * anticipé sur le squelette, `thread.tsx`) : un initialiseur paresseux y lit
 * `initial === null` et ne se rejoue JAMAIS. Le bandeau de citation se rend
 * une image plus tard — il est piloté par l'état, pas par un champ non
 * contrôlé, donc rien ne se perd.
 */
export function useThreadDraft(params: {
  readonly store: DraftStore;
  readonly scope: string;
  readonly conversationId: string | undefined;
}): {
  readonly initial: ComposerDraft | null;
  /** L'identifiant du message CITÉ, `null` quand le composeur n'est pas
   * pré-adressé — possédé ici pour que sa persistance ne dépende pas d'une
   * frappe. */
  readonly replyTarget: string | null;
  readonly setReplyTarget: (id: string | null) => void;
  /** Le rappel à passer à `Composer.onDraftChange` : il ajoute la citation
   * courante au rapport, et RETIENT ce rapport pour pouvoir le rejouer quand
   * la seule citation change. */
  readonly reportComposerDraft: (report: ComposerDraftReport) => void;
} {
  const { initial, report } = useComposerDraft(params);
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const lastComposerReport = useRef<ComposerDraftReport | null>(null);
  const replyRef = useRef<string | null>(null);
  replyRef.current = replyTarget;

  const { conversationId } = params;
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (conversationId === undefined) return;
    if (seededFor.current === conversationId) return;
    seededFor.current = conversationId;
    // Une conversation qui CHANGE remet la citation à celle de SON brouillon,
    // jamais à celle de la précédente.
    setReplyTarget(initial?.replyToId ?? null);
  }, [conversationId, initial]);

  const reportComposerDraft = useCallback(
    (composerReport: ComposerDraftReport) => {
      lastComposerReport.current = composerReport;
      report({ ...composerReport, ...(replyRef.current === null ? {} : { replyToId: replyRef.current }) });
    },
    [report],
  );

  useEffect(() => {
    const last = lastComposerReport.current;
    // Aucun rapport encore reçu : `Composer` n'est pas monté (squelette), ou
    // son effet de montage n'a pas encore couru — il rapportera de lui-même,
    // avec la citation que ce hook porte déjà.
    if (last === null) return;
    report({ ...last, ...(replyTarget === null ? {} : { replyToId: replyTarget }) });
  }, [replyTarget, report]);

  return { initial, replyTarget, setReplyTarget, reportComposerDraft };
}
