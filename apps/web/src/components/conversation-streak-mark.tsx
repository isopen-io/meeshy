import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { localDayOf, streakMarkModel } from '@/lib/view/engagement-pill';

import { Glyph } from './glyph';

/**
 * « 🔥4 · 120 » EN ROUGE, SANS CHIP, à côté de l'heure de la rangée
 * (directive porteur 2026-10-01). Le jour est lu au RENDU, jamais par une
 * horloge abonnée : deux cents rangées ne se re-rendent pas chaque minute pour
 * une série qui ne change qu'à minuit (`LensTime` tient la même règle).
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
  return (
    <span data-streak-mark className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap font-bold tabular-nums text-time" style={{ color: 'var(--ios-error)' }}>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        <Glyph name="flame" size={11} />
        <span>{model.streakDays}</span>
        <span>·</span>
        <span>{model.totalPoints}</span>
      </span>
      <span className="sr-only">{model.label}</span>
    </span>
  );
}
