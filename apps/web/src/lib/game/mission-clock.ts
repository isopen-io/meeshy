/**
 * LE MINUTEUR D'UNE MISSION DU JOUR (#9539, directive porteur 2026-10-06) — « CHAQUE carte de mission porte un
 * minuteur jusqu'à la fin de sa plage ; passé la fin, la carte dit Terminée ou Manquée et l'action disparaît ».
 * La plage d'une mission du jour est son JOUR : elle se ferme à minuit LOCAL du lendemain de `dayKey`. La mission
 * personnelle a sa propre plage (`personal-mission-clock.ts`).
 *
 *   · en cours  : le décompte court jusqu'à la fin, l'action (changer la mission) est ouverte ;
 *   · faite     : plus de décompte, plus d'action ;
 *   · terminée  : la fin est passée et elle était faite ;
 *   · manquée   : la fin est passée et elle ne l'était pas.
 *
 * Pure fonction de dates. Une clé de jour illisible ne fabrique aucune fin : la carte reste sans minuteur.
 * Miroir de `GameMissionClock` (iOS), mot pour mot.
 */
export type DailyMissionPhase = 'active' | 'done' | 'finished' | 'missed';

export type DailyMissionClock = {
  readonly phase: DailyMissionPhase;
  /** Millisecondes avant la fin du jour, tant que la mission reste à faire ; `null` sinon. */
  readonly remainingMs: number | null;
  /** L'action de la carte n'existe que tant que la plage court. */
  readonly actionable: boolean;
};

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Minuit local du lendemain de `AAAA-MM-JJ` ; `null` pour une clé qui n'est pas un jour du calendrier. */
export function endOfGameDay(dayKey: string): Date | null {
  const match = DAY_KEY.exec(dayKey);
  if (match === null) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  return new Date(year, month - 1, day + 1);
}

export function dailyMissionClock(params: { readonly dayKey: string; readonly completed: boolean; readonly now: Date }): DailyMissionClock | null {
  const end = endOfGameDay(params.dayKey);
  if (end === null) return null;
  const remainingMs = end.getTime() - params.now.getTime();
  if (!(remainingMs > 0)) return { phase: params.completed ? 'finished' : 'missed', remainingMs: null, actionable: false };
  if (params.completed) return { phase: 'done', remainingMs: null, actionable: false };
  return { phase: 'active', remainingMs, actionable: true };
}
