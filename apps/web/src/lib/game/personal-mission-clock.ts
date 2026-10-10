import { isPersonalMissionOpen, personalMissionState } from '@meeshy/shared/utils/game/personal-mission';

/**
 * LE MINUTEUR DE LA MISSION PERSONNELLE (#9539) — où en est la plage à CET instant. La loi est celle de la
 * passerelle (`personalMissionState`, `isPersonalMissionOpen` de `@meeshy/shared`) : l'écran ne réécrit pas
 * la borne, il la rejoue sur l'horloge locale — l'état servi date du chargement, la fin arrive pendant que
 * la carte est ouverte.
 *
 *   · à venir : le décompte court jusqu'au DÉBUT, rien à faire encore ;
 *   · en cours : le décompte court jusqu'à la FIN, l'action est ouverte ;
 *   · terminée : faite, elle le reste — jamais « manquée » une fois la fin passée ;
 *   · manquée : la fin est passée, plus de décompte, plus d'action.
 *
 * Miroir de `PersonalMissionClock` (iOS).
 */

export type PersonalMissionPhase = 'upcoming' | 'active' | 'completed' | 'missed';

export type PersonalMissionClock = {
  readonly phase: PersonalMissionPhase;
  /** Millisecondes avant le début (à venir) ou la fin (en cours) ; `null` sinon. */
  readonly remainingMs: number | null;
  /** L'action de la carte n'existe que dans la plage. */
  readonly actionable: boolean;
};

const MISSED: PersonalMissionClock = { phase: 'missed', remainingMs: null, actionable: false };

export function personalMissionClock(params: {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly completedAt: string | null;
  readonly now: Date;
}): PersonalMissionClock {
  const startsAt = new Date(params.startsAt);
  const endsAt = new Date(params.endsAt);
  const completedAt = params.completedAt === null ? null : new Date(params.completedAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return MISSED;
  const phase = personalMissionState({ startsAt, endsAt, completedAt, now: params.now });
  if (phase === 'completed') return { phase, remainingMs: null, actionable: false };
  if (phase === 'upcoming') return { phase, remainingMs: startsAt.getTime() - params.now.getTime(), actionable: false };
  if (phase === 'missed') return MISSED;
  return { phase, remainingMs: endsAt.getTime() - params.now.getTime(), actionable: isPersonalMissionOpen({ startsAt, endsAt, now: params.now }) };
}
