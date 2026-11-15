import { useCallback, useState } from 'react';

import { reportMessage, type ReportDeps, type ReportOutcome, type ReportReason } from '@/lib/api/reports';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { isMessagePiecesCatalogLoaded } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import type { ActionScope } from './message-action-scope';
import { reportOffered } from './message-actions';

/**
 * **SIGNALER UN MESSAGE DU FIL** (#7558) — la feuille des motifs
 * (`report-sheet.tsx`, celle des comptes, publications et commentaires) ouverte
 * depuis « Plus… », puis `POST /reports` avec `reportedType: 'message'`.
 * Composé par `useMessageMenu`.
 *
 * Choisir un motif EST la confirmation (`ReportSheet`) : la feuille se
 * referme aussitôt, l'issue se dit ensuite — envoyée, débit atteint (« pas
 * maintenant », jamais « échoué »), hors ligne, refusée.
 *
 * Rien ne s'offre tant que le catalogue du fil n'est pas chargé : le titre de
 * la feuille y vit (`message.report.title`).
 */
const NOTICE: Readonly<Record<ReportOutcome, 'report.done' | 'report.throttled' | 'media.viewer.offline' | 'report.failed'>> = {
  done: 'report.done',
  throttled: 'report.throttled',
  offline: 'media.viewer.offline',
  failed: 'report.failed',
};

export function useMessageReport(params: {
  readonly messageOf: (id: string) => Message | undefined;
  readonly scope: ActionScope;
  readonly announce: (text: string) => void;
  readonly deps: ReportDeps;
}) {
  const { messageOf, scope, announce, deps } = params;
  const [reportFor, setReportFor] = useState<string | null>(null);

  const reportOf = useCallback(
    (messageId: string): (() => void) | null => {
      const message = messageOf(messageId);
      if (message === undefined || !isMessagePiecesCatalogLoaded(currentInterfaceLanguage())) return null;
      return reportOffered(message, scope) ? () => setReportFor(messageId) : null;
    },
    [messageOf, scope],
  );

  const onPickReportReason = useCallback(
    (reason: ReportReason) => {
      if (reportFor === null) return;
      setReportFor(null);
      void reportMessage({ messageId: reportFor, reason, deps }).then((outcome) => announce(translate(currentInterfaceLanguage(), NOTICE[outcome])));
    },
    [reportFor, deps, announce],
  );

  const onDismissReport = useCallback(() => setReportFor(null), []);

  return { reportFor, reportOf, onPickReportReason, onDismissReport };
}
