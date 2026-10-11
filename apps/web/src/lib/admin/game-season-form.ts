import { addDays, dayNumber, isDayKey } from '@meeshy/shared/utils/game/day-prng';
import { leagueWeekOfMoment, weekdayIndex, type LeagueMoment } from '@meeshy/shared/utils/game/league';
import { SEASON_THEME_KEYS } from '@meeshy/shared/utils/game/season';
import {
  SEASON_COPY_LIMITS,
  SEASON_COPY_LOCALES,
  SEASON_STEP_POINTS_MAX,
  SEASON_STEP_POINTS_MIN,
  SEASON_STEP_POINTS_STEP,
  isLawfulStepPoints,
  isSeasonThemeKey,
  type SeasonCopy,
  type SeasonCopyByLocale,
  type SeasonCopyLocale,
  type SeasonDefinitionStatus,
} from '@meeshy/shared/utils/game/season-schedule';

import type { AdminSeasonRow, SeasonEditBody, SeasonProposal } from '@/lib/api/admin-game-seasons';

/**
 * **LE FORMULAIRE D'UNE SAISON** (#10232) — la loi partagée (`season-schedule.ts`) jugée AVANT l'envoi : un lundi,
 * une date à venir, un thème du catalogue, des points d'étape bornés et par pas de 10, des textes complets dans les
 * limites de l'événement App Store (30 / 50 / 120). La passerelle juge de nouveau (chevauchements, saison déjà
 * ouverte) et ses refus se lisent à l'écran ; ce module épargne l'aller-retour pour tout ce que la loi décide seule.
 *
 * Le brouillon garde les TEXTES tapés (des chaînes) : un nombre ou une date à demi tapés ne sont pas des valeurs.
 * `editBody` n'envoie que les champs CHANGÉS, avec la révision lue — c'est elle que la passerelle compare.
 */

export type CopyField = keyof SeasonCopy;
export const COPY_FIELDS: readonly CopyField[] = ['title', 'tagline', 'description'];
export const copyLimit = (field: CopyField): number => SEASON_COPY_LIMITS[field];

/** Les signes comme les compte la loi : par point de code, pas par octet ni par unité UTF-16. */
export const charCount = (text: string): number => [...text.trim()].length;

export type CopyDraft = Readonly<Record<SeasonCopyLocale, SeasonCopy>>;

export type SeasonDraft = {
  readonly startDay: string;
  readonly status: SeasonDefinitionStatus;
  readonly themeKey: string;
  readonly stepPoints: string;
  readonly copy: CopyDraft;
};

const EMPTY_COPY: SeasonCopy = { title: '', tagline: '', description: '' };

export const emptyCopyDraft = (): CopyDraft => Object.fromEntries(SEASON_COPY_LOCALES.map((locale) => [locale, EMPTY_COPY])) as CopyDraft;

const copyDraftOf = (copy: SeasonCopyByLocale | null): CopyDraft => (copy === null ? emptyCopyDraft() : { ...copy });

export const draftOfRow = (row: AdminSeasonRow): SeasonDraft => ({
  startDay: row.startDay,
  status: row.status,
  themeKey: row.themeKey,
  stepPoints: String(row.stepPoints),
  copy: copyDraftOf(row.copy),
});

export const draftOfProposal = (proposal: SeasonProposal): SeasonDraft => ({
  startDay: proposal.startDay,
  status: 'scheduled',
  themeKey: proposal.themeKey,
  stepPoints: String(proposal.stepPoints),
  copy: copyDraftOf(proposal.copy),
});

export const withCopy = (draft: SeasonDraft, locale: SeasonCopyLocale, field: CopyField, value: string): SeasonDraft => ({
  ...draft,
  copy: { ...draft.copy, [locale]: { ...draft.copy[locale], [field]: value } },
});

/**
 * Les lundis qu'on peut programmer : strictement après la semaine du moment (la semaine en cours est ouverte, la loi
 * refuse `start-not-future`), un par semaine. Le sélecteur n'offre QUE ces dates — une date qui n'est pas un lundi
 * ne s'envoie pas, faute de pouvoir la choisir.
 */
export function mondayOptions(now: LeagueMoment, weeks: number): readonly string[] {
  const first = addDays(leagueWeekOfMoment(now), 7);
  return Array.from({ length: Math.max(0, weeks) }, (_, i) => addDays(first, i * 7));
}

/** 50, 60 … 200 — les points d'une étape ordinaire. */
export const stepPointsOptions = (): readonly number[] =>
  Array.from({ length: (SEASON_STEP_POINTS_MAX - SEASON_STEP_POINTS_MIN) / SEASON_STEP_POINTS_STEP + 1 }, (_, i) => SEASON_STEP_POINTS_MIN + i * SEASON_STEP_POINTS_STEP);

export type CopyFieldIssue = { readonly locale: SeasonCopyLocale; readonly field: CopyField; readonly issue: 'empty' | 'too-long' };

export type DraftIssues = {
  readonly startDay?: 'invalid-day' | 'not-monday' | 'start-not-future' | undefined;
  readonly themeKey?: 'invalid-theme' | undefined;
  readonly stepPoints?: 'rewards-out-of-bounds' | undefined;
  readonly copy?: 'copy-invalid' | undefined;
  readonly copyFields: readonly CopyFieldIssue[];
};

const hasControl = (text: string): boolean => /[\u0000-\u001f\u007f]/.test(text);

function copyFieldIssues(copy: CopyDraft): readonly CopyFieldIssue[] {
  const filled = SEASON_COPY_LOCALES.some((locale) => COPY_FIELDS.some((field) => copy[locale][field].trim() !== ''));
  if (!filled) return [];
  const issues: CopyFieldIssue[] = [];
  for (const locale of SEASON_COPY_LOCALES) {
    for (const field of COPY_FIELDS) {
      const value = copy[locale][field];
      if (value.trim() === '') issues.push({ locale, field, issue: 'empty' });
      else if (charCount(value) > copyLimit(field) || hasControl(value)) issues.push({ locale, field, issue: 'too-long' });
    }
  }
  return issues;
}

export function validateDraft(draft: SeasonDraft, now: LeagueMoment): DraftIssues {
  const copyFields = copyFieldIssues(draft.copy);
  const points = draft.stepPoints.trim() === '' ? Number.NaN : Number(draft.stepPoints);
  const issues: {
    startDay?: DraftIssues['startDay'];
    themeKey?: DraftIssues['themeKey'];
    stepPoints?: DraftIssues['stepPoints'];
    copy?: DraftIssues['copy'];
  } = {};
  if (draft.status === 'scheduled') {
    if (!isDayKey(draft.startDay) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.startDay) || addDays(draft.startDay, 0) !== draft.startDay) issues.startDay = 'invalid-day';
    else if (weekdayIndex(draft.startDay) !== 0) issues.startDay = 'not-monday';
    else if (dayNumber(draft.startDay) <= dayNumber(leagueWeekOfMoment(now))) issues.startDay = 'start-not-future';
  }
  if (!isSeasonThemeKey(draft.themeKey)) issues.themeKey = 'invalid-theme';
  if (!isLawfulStepPoints(points)) issues.stepPoints = 'rewards-out-of-bounds';
  if (copyFields.length > 0) issues.copy = 'copy-invalid';
  return { ...issues, copyFields };
}

export const hasIssues = (issues: DraftIssues): boolean =>
  issues.startDay !== undefined || issues.themeKey !== undefined || issues.stepPoints !== undefined || issues.copy !== undefined;

/** Les textes d'un brouillon COMPLET et conforme, rognés ; `null` quand tout est vide ; `'incomplete'` sinon. */
function copyOfDraft(draft: CopyDraft): SeasonCopyByLocale | null | 'incomplete' {
  const filled = SEASON_COPY_LOCALES.some((locale) => COPY_FIELDS.some((field) => draft[locale][field].trim() !== ''));
  if (!filled) return null;
  if (copyFieldIssues(draft).length > 0) return 'incomplete';
  return Object.fromEntries(
    SEASON_COPY_LOCALES.map((locale) => [locale, { title: draft[locale].title.trim(), tagline: draft[locale].tagline.trim(), description: draft[locale].description.trim() }]),
  ) as SeasonCopyByLocale;
}

const sameCopy = (a: SeasonCopyByLocale | null, b: SeasonCopyByLocale | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Le corps d'un `PUT` (ou d'une validation) : la révision lue et les SEULS champs changés par rapport au point de
 * départ. En pause la date n'est pas envoyée (la loi l'ignore). Un brouillon invalide ne passe pas ici : l'appelant
 * a jugé `validateDraft` d'abord.
 */
export function editBody(
  baseline: Pick<AdminSeasonRow, 'startDay' | 'status' | 'themeKey' | 'stepPoints' | 'copy'>,
  draft: SeasonDraft,
  expectedRevision: number,
): SeasonEditBody {
  const copy = copyOfDraft(draft.copy);
  return {
    expectedRevision,
    ...(draft.status === 'scheduled' && draft.startDay !== baseline.startDay ? { startDay: draft.startDay } : {}),
    ...(draft.status !== baseline.status ? { status: draft.status } : {}),
    ...(draft.themeKey !== baseline.themeKey && (SEASON_THEME_KEYS as readonly string[]).includes(draft.themeKey) ? { themeKey: draft.themeKey } : {}),
    ...(Number(draft.stepPoints) !== baseline.stepPoints ? { stepPoints: Number(draft.stepPoints) } : {}),
    ...(copy !== 'incomplete' && !sameCopy(copy, baseline.copy) ? { copy } : {}),
  };
}

/**
 * La clé du calendrier servi dans le cache de requêtes, que l'administration invalide après une écriture. Elle est
 * RÉPÉTÉE ici, à dessein : l'importer de `lib/api/game-v2-queries` ferait de ce module un chunk partagé entre le Jeu et
 * l'administration, dont le nom entrerait dans le module d'entrée (`budgets.json › first_paint`). Un témoin
 * (`game-season-calendar.test.ts`) garde les deux égales.
 */
export const ADMIN_SEASON_CALENDAR_QUERY_KEY = ['me', 'game', 'season-calendar'] as const;
