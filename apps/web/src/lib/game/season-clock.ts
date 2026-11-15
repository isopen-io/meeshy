import { useEffect, useState } from 'react';

import { nextLeagueWeekClose, type LeagueMoment } from '@meeshy/shared/utils/game/league';

import { localMoment } from './local-moment';

/**
 * LE MINUTEUR DE LA BASCULE (#10225) — une page Saison restée ouverte se repeint au dimanche 20 h.
 *
 * L'état d'une saison (à venir, en cours, terminée) ne change qu'à une fermeture de semaine
 * (`nextLeagueWeekClose`, `packages/shared/utils/game/league.ts`) : un seul minuteur, calé sur la prochaine, relit
 * l'horloge locale et rend un nouveau `LeagueMoment` ; la page se repeint, sans navigation ni réseau, puis le
 * minuteur se recale sur la fermeture suivante. Miroir de `GameSeasonFlipSchedule` (iOS, `TimelineView`).
 */

export type SeasonClock = {
  readonly now: () => Date;
  readonly setTimeout: (fire: () => void, delay: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

const SYSTEM_CLOCK: SeasonClock = {
  now: () => new Date(),
  setTimeout: (fire, delay) => globalThis.setTimeout(fire, delay),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

/** Un minuteur ne dort jamais plus que ce que `setTimeout` accepte (≈ 24,8 jours) ; une semaine y tient. */
const MAX_DELAY = 2_147_483_647;

/** Les millisecondes jusqu'à la prochaine fermeture (dimanche 20 h LOCAL), toujours > 0. */
export function msUntilNextWeekClose(now: Date): number {
  const close = nextLeagueWeekClose(localMoment(now));
  const [year, month, day] = close.dayKey.split('-').map(Number) as [number, number, number];
  const at = new Date(year, month - 1, day, Math.floor(close.minuteOfDay / 60), close.minuteOfDay % 60, 0, 0);
  return Math.min(MAX_DELAY, Math.max(1, at.getTime() - now.getTime()));
}

/** L'instant qui juge l'état d'une saison, renouvelé à chaque fermeture de semaine. */
export function useWeekCloseMoment(clock: SeasonClock = SYSTEM_CLOCK): LeagueMoment {
  const [moment, setMoment] = useState<LeagueMoment>(() => localMoment(clock.now()));
  useEffect(() => {
    const handle = clock.setTimeout(() => setMoment(localMoment(clock.now())), msUntilNextWeekClose(clock.now()));
    return () => clock.clearTimeout(handle);
  }, [clock, moment]);
  return moment;
}
