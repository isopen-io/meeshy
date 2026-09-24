import { useEffect, useState } from 'react';

import { GLYPHS } from '@/components/glyphs';
import { DISCOVER_GLYPHS } from '@/components/glyphs-discover';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { JourneyRecap } from '@/lib/onboarding/journey';

import { CardFrame, type CardHost } from './onboarding-cards';
import { PrimaryButton, RecapTiles, SecondaryButton, TrophyIllustration, type RecapTile } from './onboarding-visuals';

/**
 * **LE RÉCAPITULATIF** (#7729) — « +N pts · niveau · série · badges », puis
 * deux sorties : « Continuer à explorer » (Meeshy Global) et « C'est bon pour
 * aujourd'hui ». Toujours la possibilité de s'arrêter (§ 5 du parcours).
 *
 * **Les chiffres sont RELUS du serveur** (`GET /me/engagement`), comme
 * `OnboardingViewModel.loadRecap` sur iOS : la pastille de session ne
 * contredit jamais la progression. Sans réponse, le récapitulatif retombe sur
 * ce que CE client a vu se confirmer : les points, la série et les badges que
 * les règles du serveur ont crédités à ces accusés (`journey.ts § recapOf`).
 */

export type RecapNumbers = {
  readonly points: number;
  readonly level: number;
  readonly streakDays: number;
  readonly badges: number;
};

function streakText(lang: InterfaceLanguage, days: number): string {
  const key = new Intl.PluralRules(lang).select(days) === 'one' ? 'onboarding.recap.streak.one' : 'onboarding.recap.streak.other';
  return translateOnboarding(lang, key, { days: String(days) });
}

export function recapTiles(host: CardHost, numbers: RecapNumbers, pendingFriends: number): readonly RecapTile[] {
  const lang = host.lang;
  const tiles: readonly (RecapTile | null)[] = [
    { id: 'points', glyph: PROGRESSION_GLYPHS.star, text: translateOnboarding(lang, 'onboarding.recap.points', { points: String(numbers.points) }) },
    numbers.level > 0 ? { id: 'level', glyph: PROGRESSION_GLYPHS.medal, text: translateOnboarding(lang, 'onboarding.recap.level', { level: String(numbers.level) }) } : null,
    numbers.streakDays > 0
      ? { id: 'streak', glyph: PROGRESSION_GLYPHS.fire, text: streakText(lang, numbers.streakDays), tone: 'warm' }
      : null,
    numbers.badges > 0 ? { id: 'badges', glyph: GLYPHS.trophy, text: translateOnboarding(lang, 'onboarding.recap.badges', { count: String(numbers.badges) }) } : null,
    pendingFriends > 0 ? { id: 'friends', glyph: DISCOVER_GLYPHS.userPlus, text: translateOnboarding(lang, 'onboarding.recap.friends', { count: String(pendingFriends) }) } : null,
  ];
  return tiles.filter((tile): tile is RecapTile => tile !== null);
}

export function RecapCard({
  host,
  session,
  load,
  onExplore,
  onDone,
}: {
  readonly host: CardHost;
  readonly session: JourneyRecap;
  readonly load: () => Promise<RecapNumbers | null>;
  readonly onExplore: () => void;
  readonly onDone: () => void;
}) {
  const lang = host.lang;
  const fallback: RecapNumbers = { points: session.points, level: session.levelReached ? 1 : 0, streakDays: session.streakDays, badges: session.badges };
  const [served, setServed] = useState<RecapNumbers | null>(null);

  useEffect(() => {
    let alive = true;
    void load().then((numbers) => {
      if (alive) setServed(numbers);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const numbers = served ?? fallback;
  const calm = numbers.points === 0;
  const body = calm
    ? translateOnboarding(lang, 'onboarding.recap.calm')
    : numbers.streakDays > 0
      ? translateOnboarding(lang, 'onboarding.recap.tomorrow', { next: String(numbers.streakDays + 1) })
      : translateOnboarding(lang, 'onboarding.recap.calm');

  return (
    <CardFrame
      step="recap"
      title={translateOnboarding(lang, 'onboarding.recap.title')}
      body={body}
      illustration={<TrophyIllustration />}
      actions={
        <>
          <PrimaryButton id="recap.explore" onClick={onExplore}>
            {translateOnboarding(lang, 'onboarding.recap.explore')}
          </PrimaryButton>
          <SecondaryButton id="recap.done" onClick={onDone}>
            {translateOnboarding(lang, 'onboarding.recap.done')}
          </SecondaryButton>
        </>
      }
    >
      <RecapTiles tiles={recapTiles(host, numbers, session.pendingFriends)} />
    </CardFrame>
  );
}
