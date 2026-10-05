import type { AdminBroadcastTargeting } from '@/lib/api/admin-broadcasts';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { countryName, languageName } from './interpret/language';

/**
 * **L'AUDIENCE D'UNE DIFFUSION, DITE EN UNE PHRASE** (#8876, #6731) — le ciblage
 * est un objet (`activityStatus`, `languages`, `countries`) que personne ne lit ;
 * la fiche et la feuille de composition le disent comme on le dirait à voix haute :
 * « Comptes actifs, en français et espagnol, pays d'inscription : Sénégal et
 * France ». Aucun filtre → « Tous les comptes ».
 *
 * Les langues et les pays sont NOMMÉS dans la langue d'interface (jamais un
 * code). Le pays se dit « pays d'inscription : … » et non « au Sénégal » : la
 * préposition française dépend du genre de chaque pays (au, en, aux, à), qu'aucune
 * règle ne dérive sans se tromper — une phrase neutre et exacte vaut mieux
 * qu'une phrase élégante et fausse pour Madagascar.
 */
const DEFAULT_INACTIVE_DAYS = 30;

/** Des jours, dits avec le pluriel de la langue (« 1 jour », « 30 jours », « 30 days »). */
export function formatDays(days: number, language: AdminLanguage): string {
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(days);
}

function activityPhrase(targeting: AdminBroadcastTargeting, language: AdminLanguage): string {
  switch (targeting.activity) {
    case 'active':
      return translateAdmin(language, 'admin.broadcast.audience.active');
    case 'inactive':
      return translateAdmin(language, 'admin.broadcast.audience.inactive', { duration: formatDays(targeting.inactiveDays ?? DEFAULT_INACTIVE_DAYS, language) });
    case 'new':
      return translateAdmin(language, 'admin.broadcast.audience.new');
    case 'all':
      return translateAdmin(language, 'admin.broadcast.audience.everyone');
  }
}

export function audienceSentence(targeting: AdminBroadcastTargeting, language: AdminLanguage): string {
  const list = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' });
  const languages =
    targeting.languages.length === 0
      ? []
      : [translateAdmin(language, 'admin.broadcast.audience.languages', { languages: list.format(targeting.languages.map((code) => languageName(code, language))) })];
  const countries =
    targeting.countries.length === 0
      ? []
      : [translateAdmin(language, 'admin.broadcast.audience.countries', { countries: list.format(targeting.countries.map((code) => countryName(code, language))) })];
  return [activityPhrase(targeting, language), ...languages, ...countries].join(', ');
}

type BreakdownEntry = { readonly key: string; readonly value: number };
export type BreakdownBar = { readonly key: string; readonly label: string; readonly value: number };

const OTHERS_KEY = '__others';

/**
 * UNE RÉPARTITION, LISIBLE EN BARRES — les `limit` premières entrées (déjà rangées
 * par effectif), le reste replié en UNE barre « Autres » dont la valeur est la somme
 * exacte. Une seule entrée excédentaire n'est pas cachée derrière « Autres » :
 * remplacer une barre nommée par une barre anonyme de même taille ne simplifie rien.
 */
export function breakdownBars(params: {
  readonly entries: readonly BreakdownEntry[];
  readonly labelOf: (key: string) => string;
  readonly othersLabel: string;
  readonly limit: number;
}): readonly BreakdownBar[] {
  const { entries, labelOf, othersLabel, limit } = params;
  const named = (entry: BreakdownEntry): BreakdownBar => ({ key: entry.key, label: labelOf(entry.key), value: entry.value });
  if (entries.length <= limit + 1) return entries.map(named);
  const rest = entries.slice(limit).reduce((sum, entry) => sum + entry.value, 0);
  return [...entries.slice(0, limit).map(named), { key: OTHERS_KEY, label: othersLabel, value: rest }];
}
