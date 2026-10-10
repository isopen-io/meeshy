import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { localDayOf, streakMarkModel } from '@/lib/view/engagement-pill';

import { Glyph } from './glyph';

/**
 * À CÔTÉ DE L'HEURE DE LA RANGÉE, SANS CHIP — « 🔥4 · 120 » en rouge tant
 * qu'une série court (directive porteur 2026-10-01), le cumul seul « 120 » à
 * l'encre tertiaire sinon, rien pour un cumul nul (#9570). Le jour est lu au
 * RENDU, jamais par une horloge abonnée : deux cents rangées ne se re-rendent
 * pas chaque minute pour une série qui ne change qu'à minuit (`LensTime`
 * tient la même règle).
 */
export function ConversationStreakMark({
  snapshot,
  now,
}: {
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  readonly now?: (() => number) | undefined;
}) {
  const model = streakMarkModel(snapshot, localDayOf(now === undefined ? Date.now() : now()), currentInterfaceLanguage());
  if (model === null) return null;
  if (model.kind === 'total') {
    return (
      <span data-points-mark className="inline-flex shrink-0 items-center whitespace-nowrap font-bold tabular-nums text-time" style={{ color: 'var(--color-ios-ink-3)' }}>
        <span aria-hidden="true">{model.totalText}</span>
        <span className="sr-only">{model.label}</span>
      </span>
    );
  }
  return (
    <span data-streak-mark className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-bold tabular-nums text-time" style={{ color: 'var(--streak-ink)' }}>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        <Glyph name="flameFill" size={12} />
        <span>{model.streakDays}</span>
        <span>·</span>
        <span>{model.totalText}</span>
      </span>
      <span className="sr-only">{model.label}</span>
    </span>
  );
}
