import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { countEntries, decoded, finite, nonNegative, recordOf, textOf, withQuery } from './admin-analytics-decode';
import type { ApiResult } from './http';

/**
 * **LES LANGUES ET LES TRADUCTIONS** (#8876, #6728) — `GET /admin/languages/*` :
 * quelles langues s'écrivent, lesquelles se traduisent, avec quelle confiance.
 *
 * **Ce port n'appelle JAMAIS `adminEndpoints.translations`** (#6919) : cette
 * route rend le TEXTE des traductions de toutes les conversations. La précision
 * se lit ici par des MOYENNES de confiance, jamais par un contenu.
 *
 * ## Deux échelles de confiance, et c'est le piège du lot
 *
 * - `languagesStats.languagePairs[].avgConfidence` est une PART (0–1, deux
 *   décimales) ;
 * - `languagesTranslationAccuracy[].avgConfidence` est un POURCENTAGE (0–100,
 *   entier).
 *
 * Les deux portent le MÊME nom. Les types ci-dessous l'écrivent dans la doc de
 * chaque champ, et l'écran passe l'échelle au site d'appel de `formatPercent`
 * (`'ratio'` / `'hundred'`) — `languages-view.test.ts` mesure les deux.
 *
 * Un `avgConfidence` de zéro signifie « aucune confiance mesurée » (aucune
 * traduction de la paire ne porte de score) : l'écran ne le lit pas comme une
 * confiance nulle.
 *
 * Clés sous `['admin', 'lang']` : jamais persistées.
 */
export type LanguagesPeriod = '7d' | '30d' | '90d';
export type LanguagesTimelinePeriod = '7d' | '30d';

export const languagesKeys = {
  stats: (period: LanguagesPeriod, limit: number) => ['admin', 'lang', 'stats', period, limit] as const,
  timeline: (period: LanguagesTimelinePeriod) => ['admin', 'lang', 'timeline', period] as const,
  accuracy: (limit: number) => ['admin', 'lang', 'accuracy', limit] as const,
};

type Request = AdminDeps & { readonly signal?: AbortSignal };

const read = (params: Request, path: string): Promise<ApiResult<unknown>> =>
  params.transport.request<unknown>({ method: 'GET', path, ...(params.signal === undefined ? {} : { signal: params.signal }) });

const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

// --- Les langues de la période ---------------------------------------------------

/**
 * `percentage` est en 0–100 et se calcule sur les langues AFFICHÉES (pas sur
 * tous les messages de la plateforme). `growth` est la variation en pourcentage
 * du nombre de messages contre la période précédente de même durée ; le serveur
 * sert **100 pour une langue sans message avant** — valeur indiscernable d'un
 * volume doublé, que l'écran dit comme telle. `userCount` ne compte que des
 * comptes (les invités n'y sont pas).
 */
export type LanguageRow = {
  readonly code: string;
  readonly messageCount: number;
  readonly userCount: number;
  readonly percentage: number;
  readonly growth: number | null;
};

/** `avgConfidence` : une PART (0–1) — 0 = aucune confiance mesurée. */
export type LanguagePair = {
  readonly from: string;
  readonly to: string;
  readonly translationCount: number;
  readonly avgConfidence: number;
};

export type LanguageStats = {
  readonly languages: readonly LanguageRow[];
  readonly pairs: readonly LanguagePair[];
  /** Les comptes par langue d'interface (tous comptes, hors période), du plus grand au plus petit. */
  readonly usersByLanguage: readonly { readonly code: string; readonly count: number }[];
  readonly totalMessages: number | null;
  readonly totalLanguages: number | null;
};

function decodeLanguageRow(raw: unknown, growth: Readonly<Record<string, unknown>>): LanguageRow | null {
  const record = recordOf(raw);
  const code = textOf(record?.language);
  const messageCount = nonNegative(record?.messageCount);
  const userCount = nonNegative(record?.userCount);
  const percentage = nonNegative(record?.percentage);
  if (code === null || messageCount === null || userCount === null || percentage === null) return null;
  return { code, messageCount, userCount, percentage, growth: finite(growth[code]) };
}

function decodePair(raw: unknown): LanguagePair | null {
  const record = recordOf(raw);
  const from = textOf(record?.from);
  const to = textOf(record?.to);
  const translationCount = nonNegative(record?.translationCount);
  const avgConfidence = nonNegative(record?.avgConfidence);
  return from === null || to === null || translationCount === null || avgConfidence === null ? null : { from, to, translationCount, avgConfidence };
}

export function decodeLanguageStats(raw: unknown): LanguageStats | null {
  const payload = recordOf(raw);
  if (payload === null) return null;
  const growth = recordOf(payload.growth) ?? {};

  return {
    languages: list(payload.topLanguages).flatMap((row) => decodeLanguageRow(row, growth) ?? []),
    pairs: list(payload.languagePairs).flatMap((row) => decodePair(row) ?? []),
    usersByLanguage: countEntries(payload.usersByLanguage).map((entry) => ({ code: entry.key, count: entry.count })),
    totalMessages: nonNegative(payload.totalMessages),
    totalLanguages: nonNegative(payload.totalLanguages),
  };
}

export async function loadLanguageStats(params: Request & { readonly period: LanguagesPeriod; readonly limit: number }): Promise<ApiResult<LanguageStats>> {
  const path = withQuery(adminEndpoints.languagesStats, { period: params.period, limit: String(params.limit) });
  return decoded(await read(params, path), decodeLanguageStats, 'Langues');
}

// --- Les langues au fil des jours -------------------------------------------------

/** Un jour réel (`YYYY-MM-DD`, UTC) et les messages par langue ; une langue absente du jour n'a pas de clé. */
export type LanguageDay = { readonly date: string; readonly counts: Readonly<Record<string, number>> };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function decodeLanguageDay(raw: unknown): LanguageDay | null {
  const record = recordOf(raw);
  const date = textOf(record?.date);
  if (record === null || date === null || !DAY.test(date)) return null;
  const counts = Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const count = nonNegative(value);
      return key === 'date' || count === null ? [] : [[key, count] as const];
    }),
  );
  return { date, counts };
}

/** Les clés sont DYNAMIQUES (une par langue écrite ce jour-là) : la clé `date` est le jour, toutes les autres sont des langues. */
export function decodeLanguagesTimeline(raw: unknown): readonly LanguageDay[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((row) => decodeLanguageDay(row) ?? []);
}

export async function loadLanguagesTimeline(params: Request & { readonly period: LanguagesTimelinePeriod }): Promise<ApiResult<readonly LanguageDay[]>> {
  return decoded(await read(params, withQuery(adminEndpoints.languagesTimeline, { period: params.period })), decodeLanguagesTimeline, 'Chronologie des langues');
}

// --- La précision des traductions ---------------------------------------------------

/**
 * `avgConfidence` : un POURCENTAGE (0–100) — l'autre échelle. `quality` est le
 * code servi (`excellent` au-dessus de 90 %, `good` au-dessus de 70 %, `fair`
 * au-dessus de 50 %, `poor` sinon — donc aussi quand rien n'est mesuré).
 */
export type TranslationAccuracyRow = {
  readonly from: string;
  readonly to: string;
  readonly translationCount: number;
  readonly avgConfidence: number;
  readonly quality: string | null;
};

function decodeAccuracyRow(raw: unknown): TranslationAccuracyRow | null {
  const record = recordOf(raw);
  const from = textOf(record?.from);
  const to = textOf(record?.to);
  const translationCount = nonNegative(record?.translationCount);
  const avgConfidence = nonNegative(record?.avgConfidence);
  if (from === null || to === null || translationCount === null || avgConfidence === null) return null;
  return { from, to, translationCount, avgConfidence, quality: textOf(record?.quality) };
}

export function decodeTranslationAccuracy(raw: unknown): readonly TranslationAccuracyRow[] | null {
  return Array.isArray(raw) ? raw.flatMap((row) => decodeAccuracyRow(row) ?? []) : null;
}

export async function loadTranslationAccuracy(params: Request & { readonly limit: number }): Promise<ApiResult<readonly TranslationAccuracyRow[]>> {
  const path = withQuery(adminEndpoints.languagesTranslationAccuracy, { limit: String(params.limit) });
  return decoded(await read(params, path), decodeTranslationAccuracy, 'Précision des traductions');
}
