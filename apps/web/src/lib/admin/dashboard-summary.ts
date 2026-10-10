import type { AdminSummaryValue } from '@/components/admin/summary-card';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { DashBlock } from './dashboard-block';
import type { DashStat } from './dashboard-cards';
import { formatCount } from './interpret/numbers';

/**
 * **LES CARTES RÉSUMÉES DU HUB, EN MOTS** (spec 2026-10-04 § 2) — des fonctions
 * PURES. Une carte résumée ne réinvente aucun chiffre : elle PRÉLÈVE, par leur
 * ancre, deux à quatre des cartes que la modale de sa zone montre en entier
 * (`dashboard-cards.ts`) — même libellé, même valeur formatée, même « — » tant
 * que rien n'est lu.
 */
export function summaryValues(stats: readonly DashStat[], anchors: readonly string[]): readonly AdminSummaryValue[] {
  return anchors.flatMap((anchor) => {
    const stat = stats.find((candidate) => candidate.anchor === anchor);
    return stat === undefined ? [] : [{ label: stat.label, value: stat.value }];
  });
}

/** L'état d'une carte résumée d'après le bloc qu'elle lit. */
export const summaryStateOf = (block: DashBlock<unknown>): 'ready' | 'loading' | 'error' | 'denied' => block.status;

/** « Réessayer » d'une carte en erreur. */
export const summaryRetryOf = (block: DashBlock<unknown>): { readonly onRetry?: () => void } => (block.status === 'error' ? { onRetry: block.retry } : {});

/** La légende d'une carte prélevée, si elle existe : la phrase d'état d'une carte résumée. */
export const captionOf = (stats: readonly DashStat[], anchor: string): string | null => stats.find((stat) => stat.anchor === anchor)?.caption ?? null;

/**
 * LA BANDE « À TRAITER » — une pastille par file qui attend un geste, seulement si
 * elle n'est pas vide. `null` : la file n'est pas lue (le lecteur n'y a pas droit,
 * ou la lecture est en vol) — elle ne compte ni pour une pastille ni pour « Rien à
 * traiter ».
 */
export type TodoPill = { readonly id: 'reports' | 'broadcasts'; readonly text: string };

export function todoPills(pending: number | null, sending: number | null, language: AdminLanguage): readonly TodoPill[] {
  return [
    ...(pending !== null && pending > 0 ? [{ id: 'reports' as const, text: translateAdmin(language, 'admin.dash.todo.reports', { count: formatCount(pending, language) }) }] : []),
    ...(sending !== null && sending > 0 ? [{ id: 'broadcasts' as const, text: translateAdmin(language, 'admin.dash.todo.broadcasts', { count: formatCount(sending, language) }) }] : []),
  ];
}
