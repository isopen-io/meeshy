/**
 * LES LIGNES DE TAUX DE LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176), et la règle qui les publie.
 *
 * Le seuil de dix comptes ne suffit pas cellule par cellule : une ligne publiée MOINS les lignes publiées qui la
 * composent rend le reste, et ce reste peut être un seul compte. La famille `rank` (11 comptes, 1 gardé) moins la clé
 * `rank:echo` (10 comptes, 0 gardé) disait qu'exactement un compte avait atteint Légende et immortalisé sa photo.
 *
 * D'où la règle, appliquée du plus fin au plus large — cellules (jour × surface), puis clés, puis familles : une ligne
 * de taux ne sort que si elle compte au moins dix comptes ET si, pour chacune de ses deux mesures (annoncées, gardées),
 * les moments qu'aucune ligne PUBLIÉE plus fine ne couvre sont zéro compte ou au moins dix. Un reste d'au moins dix
 * comptes ne se protège pas : la soustraction rend un groupe, jamais une personne.
 */

import type { PhotoMeasureFamily } from '@meeshy/shared/utils/game/photo-measure';

/** Un moment annoncé dans la semaine, et ce que les cellules publiées en montrent déjà. */
export type RateMoment = {
  readonly userId: string;
  readonly family: PhotoMeasureFamily;
  readonly key: string;
  /** Gardé avant la fin de la semaine. */
  readonly kept: boolean;
  /** Son annonce (présentée ou notifiée) est comptée dans une cellule publiée. */
  readonly announcementShown: boolean;
  /** Sa garde est comptée dans une cellule publiée. */
  readonly keepingShown: boolean;
};

/** Le taux d'immortalisation sur la semaine : `kept / announced` des étapes annoncées dedans ; `key: null` = la famille. */
export type PhotoMeasureRate = {
  readonly family: PhotoMeasureFamily;
  readonly key: string | null;
  readonly announced: number;
  readonly kept: number;
  readonly accounts: number;
  readonly rate: number;
};

type Coverage = (moment: RateMoment) => { readonly announcement: boolean; readonly keeping: boolean };
type Group = { readonly sortKey: string; readonly family: PhotoMeasureFamily; readonly key: string | null; readonly moments: readonly RateMoment[] };

const SEP = '\u0000';
const keyOf = (moment: RateMoment): string => `${moment.family}${SEP}${moment.key}`;
const accountsOf = (moments: readonly RateMoment[]): number => new Set(moments.map((moment) => moment.userId)).size;

const groupBy = (moments: readonly RateMoment[], level: 'family' | 'key'): readonly Group[] => [
  ...moments
    .reduce((groups, moment) => {
      const sortKey = level === 'family' ? moment.family : keyOf(moment);
      const group = groups.get(sortKey) ?? { sortKey, family: moment.family, key: level === 'family' ? null : moment.key, moments: [] };
      return groups.set(sortKey, { ...group, moments: [...group.moments, moment] });
    }, new Map<string, Group>())
    .values(),
];

const line = (group: Group): PhotoMeasureRate => {
  const kept = group.moments.filter((moment) => moment.kept).length;
  const announced = group.moments.length;
  return { family: group.family, key: group.key, announced, kept, accounts: accountsOf(group.moments), rate: Math.round((kept / announced) * 1000) / 1000 };
};

/** Les lignes de taux publiables, triées comme le rapport (famille, puis ses clés), et le nombre de lignes retenues. */
export function publishedRates(moments: readonly RateMoment[], minAccounts: number): { readonly rates: readonly PhotoMeasureRate[]; readonly withheld: number } {
  const isolates = (rest: readonly RateMoment[]): boolean => {
    const accounts = accountsOf(rest);
    return accounts > 0 && accounts < minAccounts;
  };
  const publishable = (group: Group, covered: Coverage): boolean =>
    accountsOf(group.moments) >= minAccounts &&
    !isolates(group.moments.filter((moment) => !covered(moment).announcement)) &&
    !isolates(group.moments.filter((moment) => moment.kept && !covered(moment).keeping));

  const keys = groupBy(moments, 'key');
  const families = groupBy(moments, 'family');
  const shownKeys = keys.filter((group) => publishable(group, (moment) => ({ announcement: moment.announcementShown, keeping: moment.keepingShown })));
  const shownKeyIds = new Set(shownKeys.map((group) => group.sortKey));
  const shownFamilies = families.filter((group) =>
    publishable(group, (moment) => ({
      announcement: shownKeyIds.has(keyOf(moment)) || moment.announcementShown,
      keeping: shownKeyIds.has(keyOf(moment)) || moment.keepingShown,
    })),
  );

  const rates = [...shownFamilies, ...shownKeys].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0)).map(line);
  return { rates, withheld: keys.length + families.length - rates.length };
}
