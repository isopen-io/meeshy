import type { LanguageDay, TranslationAccuracyRow } from '@/lib/api/admin-languages';
import { interpretTranslationQuality } from '@/lib/admin/interpret/enums';
import type { AdminGlyphName } from '@/components/glyphs-admin';
import { languageName, sentenceCase } from '@/lib/admin/interpret/language';
import { formatPercent } from '@/lib/admin/interpret/numbers';
import type { AdminTone, Interpreted } from '@/lib/admin/interpret/types';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES LANGUES, MISES EN FORME** (#8876, #6728) — les fonctions pures de
 * l'écran Langues et traductions : la paire « français → anglais », les deux
 * échelles de confiance, la croissance lue sans la confondre avec la couleur, le
 * repli de la chronologie sur les langues principales.
 */

// --- Les noms ------------------------------------------------------------------------

/** Un nom de langue posé SEUL (carte, légende, cellule) ouvre par une majuscule : « Français » ; dans une phrase ou une paire, il reste « français ». */
export const languageTitle = (code: string, language: InterfaceLanguage): string => sentenceCase(languageName(code, language), language);

// --- Les paires et la confiance ---------------------------------------------------

export const pairLabel = (from: string, to: string, language: InterfaceLanguage): string =>
  translateAdmin(language, 'admin.lang.pair', { from: languageName(from, language), to: languageName(to, language) });

const notMeasured = (language: InterfaceLanguage): string => translateAdmin(language, 'admin.lang.confidence.none');

/**
 * **Les DEUX échelles de confiance servies** — `languagesStats` (les paires de la
 * période) sert une PART (0–1), `languagesTranslationAccuracy` un POURCENTAGE
 * (0–100) ; les deux champs s'appellent `avgConfidence`. L'échelle est écrite ICI,
 * une fois par route, jamais devinée depuis la valeur (0,8 se lirait 0,8 %).
 *
 * Zéro signifie « aucun score mesuré » côté serveur, pas « confiance nulle » :
 * il se dit « Non mesurée ».
 */
export const pairConfidenceText = (value: number, language: InterfaceLanguage): string =>
  value > 0 ? formatPercent(value, 'ratio', language) : notMeasured(language);

export const accuracyConfidenceText = (value: number, language: InterfaceLanguage): string =>
  value > 0 ? formatPercent(value, 'hundred', language) : notMeasured(language);

/**
 * La qualité d'une paire. Le serveur sert `poor` dès que la confiance vaut zéro —
 * donc aussi quand RIEN n'est mesuré : on ne l'affiche pas comme une mauvaise
 * traduction, c'est l'absence de mesure.
 */
export function accuracyQuality(row: Pick<TranslationAccuracyRow, 'avgConfidence' | 'quality'>, language: InterfaceLanguage): Interpreted {
  if (row.avgConfidence <= 0) return { label: notMeasured(language), tone: 'neutral', explain: null, raw: '' };
  return interpretTranslationQuality(row.quality, language);
}

// --- L'évolution ---------------------------------------------------------------------

export type GrowthView = { readonly text: string; readonly tone: AdminTone; readonly glyph: AdminGlyphName };

/**
 * La variation servie, en pourcentage signé (« +12 % », « −8 % »). Le sens se lit
 * au signe ET au glyphe, jamais à la seule couleur. `null` — aucune donnée — rend
 * `null` : pas de « 0 % » fabriqué.
 */
export function growthView(growth: number | null, language: InterfaceLanguage): GrowthView | null {
  if (growth === null) return null;
  const text = new Intl.NumberFormat(language, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 0 }).format(growth / 100);
  if (growth > 0) return { text, tone: 'success', glyph: 'trendUp' };
  if (growth < 0) return { text, tone: 'warning', glyph: 'trendDown' };
  return { text, tone: 'neutral', glyph: 'minus' };
}

// --- La chronologie ---------------------------------------------------------------------

export const OTHERS_KEY = 'others';

export type LanguageSeries = {
  /** Le code de langue, ou `OTHERS_KEY` pour les langues regroupées. */
  readonly key: string;
  readonly points: readonly number[];
  readonly total: number;
};

export type FoldedTimeline = { readonly dates: readonly string[]; readonly series: readonly LanguageSeries[] };

/**
 * Garde les `named` langues de plus fort total sur la fenêtre et somme toutes les
 * autres dans « Autres » (absente s'il n'y a rien à regrouper). À égalité, l'ordre
 * alphabétique des codes : une chronologie qui se redessine dans un ordre différent
 * à chaque lecture repeindrait les couleurs, que le kit attribue par RANG.
 */
export function foldLanguageTimeline(days: readonly LanguageDay[], named: number): FoldedTimeline {
  const totals = days
    .flatMap((day) => Object.entries(day.counts))
    .reduce<Readonly<Record<string, number>>>((accumulated, [code, count]) => ({ ...accumulated, [code]: (accumulated[code] ?? 0) + count }), {});

  const ranked = Object.entries(totals)
    .filter(([, total]) => total > 0)
    .sort(([leftCode, left], [rightCode, right]) => right - left || leftCode.localeCompare(rightCode));
  const keptCodes = ranked.slice(0, named).map(([code]) => code);
  const foldedCodes = ranked.slice(named).map(([code]) => code);

  const namedSeries = keptCodes.map((code) => {
    const points = days.map((day) => day.counts[code] ?? 0);
    return { key: code, points, total: points.reduce((sum, value) => sum + value, 0) };
  });
  const otherPoints = days.map((day) => foldedCodes.reduce((sum, code) => sum + (day.counts[code] ?? 0), 0));
  const others = foldedCodes.length === 0 ? [] : [{ key: OTHERS_KEY, points: otherPoints, total: otherPoints.reduce((sum, value) => sum + value, 0) }];

  return { dates: days.map((day) => day.date), series: [...namedSeries, ...others] };
}
