import type { ConversationEngagementSnapshot } from '@meeshy/shared/types/engagement-scale';

import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { engagementPillModel, localDayOf } from '@/lib/view/engagement-pill';
import { useMinute } from '@/lib/view/use-minute';
import { Link } from '@/routes/route-table';

import { Glyph } from './glyph';

/**
 * LA PASTILLE D'ENGAGEMENT D'UNE CONVERSATION (#8906, #9044) — « 🔥 4 · 120 ».
 *
 * La flamme, la série en jours, un point central, puis les points que cette
 * conversation a rapportés au LECTEUR depuis toujours. Posée sous le titre de
 * l'en-tête DÉPLIÉ, où elle mène à la Progression ; replié, c'est la flamme du
 * jour sous l'avatar (`HeaderFlame`) qui parle. La liste porte la série en
 * rouge à côté de l'heure (`ConversationStreakMark`, 2026-10-01).
 *
 * Le texte visible est masqué au lecteur d'écran, qui lit la phrase entière
 * (« Série de 4 jours, 120 points dont 12 aujourd'hui »).
 *
 * Le jour est relu à la MINUTE (`useMinute`, l'horloge partagée) : passé
 * minuit, la série tombe sans attendre le serveur.
 */
export function EngagementPill({
  snapshot,
  opensProgression = false,
  language,
  now,
}: {
  readonly snapshot: ConversationEngagementSnapshot | undefined;
  /** `true` ⇒ la pastille est un lien vers `/me/progression`. */
  readonly opensProgression?: boolean;
  readonly language?: InterfaceLanguage;
  /** Horloge injectable — jamais `Date.now()` lu dans un témoin. */
  readonly now?: () => number;
}) {
  const minute = useMinute();
  const today = localDayOf(now === undefined ? minute * 60_000 : now());
  const model = engagementPillModel(snapshot, today, language ?? currentInterfaceLanguage());
  if (model === null) return null;

  const body = (
    <>
      <span aria-hidden="true" className="flex items-center gap-1 whitespace-nowrap">
        <Glyph name="flame" size={12} style={{ color: 'var(--ios-warning)' }} />
        <span data-engagement-streak={model.streakDays}>{model.streakDays}</span>
        <span>·</span>
        <span data-engagement-points>{model.totalPoints}</span>
      </span>
      <span className="sr-only">{model.label}</span>
    </>
  );
  const className = 'inline-flex shrink-0 items-center rounded-chip px-1.5 text-check font-semibold tabular-nums';
  const style = { backgroundColor: 'color-mix(in srgb, var(--ios-warning) 16%, transparent)', color: 'var(--color-ios-ink)' };

  return opensProgression ? (
    <Link to="progression" data-engagement-pill className="inline-flex min-h-11 shrink-0 items-center">
      <span className={className} style={style}>
        {body}
      </span>
    </Link>
  ) : (
    <span data-engagement-pill className={className} style={style}>
      {body}
    </span>
  );
}
