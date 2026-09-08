import { useEffect, useMemo, useState } from 'react';

import { httpTransport } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { loadConversationAnalysis, type ConversationAnalysisSummary } from '@/lib/api/conversation-analysis';
import type { Message, Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import { buildLivingSummary, resolveSkeleton } from '@/lib/summary/assembly';
import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';

import { LivingSummary } from './living-summary';

/**
 * LE MONTAGE DU RÉSUMÉ VIVANT (#5695, étape 8) — le module LAZY
 * (`export default`, chargé par `import()` depuis `thread.tsx`). Miroir de
 * `LivingSummaryHost.swift:40-52` : `now: Date.now()` figé au montage
 * (HORS des dépendances du `useMemo`, comme `LivingSummaryHost.swift:50`).
 *
 * LE PIÈGE DE L'IDENTITÉ (`ConversationView.swift:1549-1572`) — le web n'a
 * PAS besoin d'un `.id()` de vue : la mémoïsation dépend directement de
 * l'IDENTITÉ de `messages` (un `useState`/`props` React, jamais recréé sans
 * raison), qui EST le signal que le VM iOS imite par un remontage forcé.
 *
 * ÉCART DÉLIBÉRÉ AU MOTIF `progression.tsx` — la spécification #5695
 * suggérait `useQuery` (TanStack Query, comme le port lui-même). MESURÉ :
 * `progression.tsx` est le SEUL consommateur de `useQuery` avant ce lot, et
 * son code (le hook lui-même, pas seulement `QueryClient`) reste hors du
 * chunk CRITIQUE (`data-*.js`, 166 o) parce qu'un unique point d'entrée
 * lazy peut porter sa propre copie. Un SECOND consommateur lazy fait que
 * Rollup partage ce code entre les deux chunks — via le `manualChunks` de
 * `vite.config.ts`, qui force TOUT module `@tanstack/react-query` dans ce
 * même chunk `data`, RÉFÉRENCÉ par `main.tsx` (`QueryClientProvider`), donc
 * CRITIQUE. Mesuré : `first_paint_kb` passait de 29,79 à 32,91 Ko — la
 * charte de ce lot (« ne rien ajouter à la première peinture ») interdit ce
 * chemin. Ce fichier appelle donc `loadConversationAnalysis` par un effet
 * NU (`useEffect`/`useState`), qui réplique exactement le contrat utile
 * (`enabled`/`retry: false`, no-op silencieux sur erreur) sans dépendre du
 * runtime partagé. Le port (`conversation-analysis.ts`) et ses témoins ne
 * changent pas — seul CE site d'appel diffère. Issue compagnon à ouvrir :
 * séparer le chunk `data` par point d'entrée avant qu'un troisième
 * consommateur lazy de `useQuery` ne reproduise le même défaut.
 */
export function SummaryHost({
  conversationId,
  messages,
  participants,
  viewer,
  windowCoversUnread,
  locale,
  lang,
  onReplyToPerson,
  onOpenEpisode,
  onResumeThread,
}: {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly participants: readonly Participant[];
  readonly viewer: Viewer;
  readonly windowCoversUnread: boolean;
  readonly locale: string;
  readonly lang?: string;
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
}) {
  const nowRef = useMemo(() => Date.now(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(
    () =>
      buildLivingSummary({
        messages,
        viewer: { id: viewer.id ?? '', handle: viewer.handle, displayName: viewer.displayName },
        participants,
        windowCoversUnread,
        now: nowRef,
        locale,
      }),
    // `messages` gouverne la recomposition par son IDENTITÉ — le tableau
    // dépend aussi de `viewer`/`participants`/`windowCoversUnread`/`locale`,
    // jamais de `now` (figé au montage, comme iOS).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, viewer.id, viewer.handle, viewer.displayName, participants, windowCoversUnread, locale],
  );

  /**
   * L'ENRICHISSEMENT AGENT — `enabled: !viewer.isAnonymous` répliqué par la
   * garde d'entrée de l'effet ; `retry: false` répliqué en n'appelant
   * jamais deux fois ; erreur/403/404/500 ⇒ `agentSummary` reste `null`,
   * SILENCIEUSEMENT (`LivingSummaryViewModel.swift:60-74`) — jamais un état
   * d'erreur rendu. Annulé au démontage (`AbortController`), comme
   * `httpTransport` le permet déjà pour tout appelant.
   */
  const [agentSummary, setAgentSummary] = useState<ConversationAnalysisSummary | null>(null);
  useEffect(() => {
    setAgentSummary(null);
    if (viewer.isAnonymous) return;
    const controller = new AbortController();
    loadConversationAnalysis({
      source: apiConfig.source,
      transport: httpTransport,
      conversationId,
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setAgentSummary(result.ok ? result.data.summary : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAgentSummary(null);
      });
    return () => controller.abort();
  }, [conversationId, viewer.isAnonymous]);
  const showsSkeleton = resolveSkeleton({ digest: model.digest, faceRamp: model.faceRamp, agentSummary });

  return (
    <LivingSummary
      model={model}
      agentSummary={agentSummary}
      showsSkeleton={showsSkeleton}
      isComplete={model.digest.isComplete}
      onReplyToPerson={onReplyToPerson}
      onOpenEpisode={onOpenEpisode}
      onResumeThread={onResumeThread}
      {...(lang !== undefined ? { lang } : {})}
    />
  );
}

export default SummaryHost;
