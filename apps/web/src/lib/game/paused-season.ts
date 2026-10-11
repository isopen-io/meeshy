import { seasonDefinitionOf, type SeasonSchedule } from '@meeshy/shared/utils/game/season-schedule';

/**
 * LA SAISON MISE EN PAUSE (#10232) — la première du calendrier servi (les suivantes sont en pause avec elle, la loi
 * retire leurs dates). `null` quand rien n'est en pause. Une saison en pause est toujours FUTURE (l'administration ne
 * met jamais en pause une saison ouverte ou passée), donc la page « saison » peut la dire à la place de « aucune
 * saison ouverte ».
 */
export function pausedSeasonOf(schedule: SeasonSchedule): { readonly number: number; readonly themeKey: string } | null {
  const first = schedule.seasons.filter((definition) => definition.status === 'paused').sort((a, b) => a.number - b.number)[0];
  if (first === undefined) return null;
  const definition = seasonDefinitionOf(schedule, first.number);
  return definition === null ? null : { number: first.number, themeKey: definition.themeKey };
}
