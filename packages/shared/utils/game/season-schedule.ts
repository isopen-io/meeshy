/**
 * LE CALENDRIER DES SAISONS SERVI (#10016, décision du porteur du 2026-10-11).
 *
 * Les saisons ne sont plus seulement une constante : la passerelle sert un
 * CALENDRIER — une définition par saison programmée (numéro, LUNDI de début,
 * statut, thème, récompenses bornées, textes en sept langues) — et cette loi le
 * lit. Ce qui n'est pas défini se DÉRIVE : la saison 1 ouvre le `SEASON_ONE_START`,
 * chaque saison suit la précédente de 56 jours, le thème tourne sur
 * `SEASON_THEME_KEYS`. Le calendrier vide (`DEFAULT_SEASON_SCHEDULE`) et le seed
 * de la migration (saison 1 au 2026-12-21) rendent donc EXACTEMENT `season.ts`.
 *
 * - Décaler une saison future pose une ANCRE : elle ouvre à son lundi, laisse un
 *   intervalle sans saison derrière la précédente, et les suivantes s'enchaînent
 *   depuis elle.
 * - Mettre en PAUSE une saison future retire ses dates, et celles des suivantes,
 *   jusqu'à sa reprise.
 * - Une saison en cours ou passée ne se réécrit pas (`applySeasonEdit`).
 *
 * Les ligues restent hebdomadaires et indépendantes (`LEAGUE_FIRST_WEEK`).
 * Une donnée de CALENDRIER, la même pour tous : rien de la présence de quiconque.
 */

import { addDays, dayDiff, dayNumber, isDayKey } from './day-prng.js';
import { leagueWeekOfMoment, weekdayIndex, type LeagueMoment } from './league.js';
import {
  SEASON_DAYS,
  SEASON_ONE_START,
  SEASON_STEP_POINTS,
  SEASON_THEME_KEYS,
  SEASON_WEEKS,
  seasonTenseAt,
  type SeasonCalendar,
  type SeasonThemeKey,
} from './season.js';

/** Les bornes de la loi pour les points d'une étape ordinaire (par pas de 10). */
export const SEASON_STEP_POINTS_MIN = 50;
export const SEASON_STEP_POINTS_MAX = 200;
export const SEASON_STEP_POINTS_STEP = 10;

/**
 * Une saison se fige SEPT jours avant son ouverture : son événement in-app App Store est alors publié
 * (`season-app-events.ts`, publication J-7) — la décaler ou la mettre en pause ensuite mentirait à l'App Store.
 */
export const SEASON_EDIT_FREEZE_DAYS = 7;

/** Les sept langues de la fiche — arabe en miroir. */
export const SEASON_COPY_LOCALES = ['fr', 'en', 'es', 'de', 'it', 'pt-BR', 'ar'] as const;
export type SeasonCopyLocale = (typeof SEASON_COPY_LOCALES)[number];

/**
 * Les textes d'une saison dans une langue. Les limites sont celles d'un
 * événement in-app App Store (nom 30, description courte 50, longue 120) : le
 * même texte sert l'app et l'événement.
 */
export const SEASON_COPY_LIMITS = { title: 30, tagline: 50, description: 120 } as const;
export type SeasonCopy = { readonly title: string; readonly tagline: string; readonly description: string };
export type SeasonCopyByLocale = Readonly<Record<SeasonCopyLocale, SeasonCopy>>;

export type SeasonDefinitionStatus = 'scheduled' | 'paused';

export type SeasonDefinition = {
  readonly number: number;
  /** Un lundi, `AAAA-MM-JJ`. Pour une saison en pause : la date proposée, ignorée. */
  readonly startDay: string;
  readonly status: SeasonDefinitionStatus;
  readonly themeKey: SeasonThemeKey;
  /** Les points d'une étape ordinaire, dans `[SEASON_STEP_POINTS_MIN, SEASON_STEP_POINTS_MAX]`. */
  readonly stepPoints: number;
  readonly copy: SeasonCopyByLocale | null;
};

export type SeasonSchedule = {
  /** Croît à chaque écriture : l'ETag de la lecture servie, la clé du cache hors ligne. */
  readonly revision: number;
  readonly seasons: readonly SeasonDefinition[];
};

/** Le repli : aucune définition, la constante de `season.ts`. */
export const DEFAULT_SEASON_SCHEDULE: SeasonSchedule = Object.freeze({ revision: 0, seasons: Object.freeze([]) as readonly SeasonDefinition[] });

const themeOf = (n: number): SeasonThemeKey => SEASON_THEME_KEYS[(n - 1) % SEASON_THEME_KEYS.length]!;
const isMonday = (day: string): boolean => weekdayIndex(day) === 0;
const isPositiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1;

export const isSeasonThemeKey = (value: unknown): value is SeasonThemeKey =>
  typeof value === 'string' && (SEASON_THEME_KEYS as readonly string[]).includes(value);

export const isLawfulStepPoints = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= SEASON_STEP_POINTS_MIN &&
  value <= SEASON_STEP_POINTS_MAX &&
  value % SEASON_STEP_POINTS_STEP === 0;

/** Aucun lien, domaine ni adresse dans un texte de saison (il devient un événement App Store). */
export const SEASON_COPY_LINK_PATTERN = /[a-z][a-z0-9+.-]*:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,}(?:\/|\b)|@[a-z0-9-]+\./i;
/** Aucune devise : une saison ne promet jamais d'argent. */
export const SEASON_COPY_MONEY_PATTERN = /[$€£¥₹₦₩₽¢]|\b(?:USD|EUR|XAF|XOF|FCFA|GBP|CFA)\b/i;
/** Ni contrôle, ni contrôle bidirectionnel, ni caractère sans chasse : rien qui retourne ou cache un texte. */
const HIDDEN_PATTERN = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

const lawfulText = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim() === value &&
  [...value].length <= max &&
  !HIDDEN_PATTERN.test(value) &&
  !SEASON_COPY_LINK_PATTERN.test(value) &&
  !SEASON_COPY_MONEY_PATTERN.test(value);

/** Sept langues, trois textes chacune, dans les limites ; rien d'autre. */
export function isLawfulSeasonCopy(value: unknown): value is SeasonCopyByLocale {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== SEASON_COPY_LOCALES.length) return false;
  return SEASON_COPY_LOCALES.every((locale) => {
    const copy = record[locale];
    if (typeof copy !== 'object' || copy === null) return false;
    const c = copy as Record<string, unknown>;
    return (
      Object.keys(c).length === 3 &&
      lawfulText(c.title, SEASON_COPY_LIMITS.title) &&
      lawfulText(c.tagline, SEASON_COPY_LIMITS.tagline) &&
      lawfulText(c.description, SEASON_COPY_LIMITS.description)
    );
  });
}

function definitionFromUnknown(raw: unknown): SeasonDefinition | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isPositiveInt(r.number)) return null;
  if (typeof r.startDay !== 'string' || !isDayKey(r.startDay) || !isMonday(r.startDay)) return null;
  if (r.status !== 'scheduled' && r.status !== 'paused') return null;
  if (!isSeasonThemeKey(r.themeKey) || !isLawfulStepPoints(r.stepPoints)) return null;
  // Des textes devenus illisibles (une loi des textes durcie) ne retirent QUE les textes : jamais les dates
  // d'une saison, qui se décalerait sinon en silence.
  const copy = r.copy !== undefined && r.copy !== null && isLawfulSeasonCopy(r.copy) ? r.copy : null;
  return { number: r.number, startDay: r.startDay, status: r.status, themeKey: r.themeKey, stepPoints: r.stepPoints, copy };
}

type Plan = {
  readonly anchors: readonly { readonly number: number; readonly startDay: string }[];
  readonly pausedFrom: number | null;
  readonly byNumber: ReadonlyMap<number, SeasonDefinition>;
};

const plans = new WeakMap<SeasonSchedule, Plan>();

function planOf(schedule: SeasonSchedule): Plan {
  const cached = plans.get(schedule);
  if (cached) return cached;
  const sorted = [...schedule.seasons].sort((a, b) => a.number - b.number);
  const anchors: { number: number; startDay: string }[] = [{ number: 1, startDay: SEASON_ONE_START }];
  let pausedFrom: number | null = null;
  for (const def of sorted) {
    if (def.status === 'paused') {
      pausedFrom = def.number;
      break;
    }
    if (def.number === 1) anchors[0] = { number: 1, startDay: def.startDay };
    else anchors.push({ number: def.number, startDay: def.startDay });
  }
  const plan: Plan = { anchors, pausedFrom, byNumber: new Map(sorted.map((d) => [d.number, d])) };
  plans.set(schedule, plan);
  return plan;
}

function anchorFor(plan: Plan, n: number): { readonly number: number; readonly startDay: string } {
  let found = plan.anchors[0]!;
  for (const anchor of plan.anchors) if (anchor.number <= n) found = anchor;
  return found;
}

/** Le plan des DATES, pauses ignorées : la date prévue d'une saison en pause, ou derrière une pause. */
function datesPlanOf(schedule: SeasonSchedule): Plan {
  if (!schedule.seasons.some((d) => d.status === 'paused')) return planOf(schedule);
  return planOf({ revision: schedule.revision, seasons: schedule.seasons.map((d) => (d.status === 'paused' ? { ...d, status: 'scheduled' } : d)) });
}

/** Le lundi d'ouverture de la saison, `null` en pause (ou derrière une pause). */
function startOf(plan: Plan, n: number): string | null {
  if (plan.pausedFrom !== null && n >= plan.pausedFrom) return null;
  const anchor = anchorFor(plan, n);
  return addDays(anchor.startDay, (n - anchor.number) * SEASON_DAYS);
}

/**
 * Lit un calendrier reçu (base, réseau, cache) et en garde ce qui est conforme :
 * une définition illisible ou qui chevauche la précédente est ignorée — la saison
 * retombe alors sur la dérivation. Un calendrier illisible rend le repli.
 */
export function normalizeSeasonSchedule(raw: unknown): SeasonSchedule {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SEASON_SCHEDULE;
  const r = raw as Record<string, unknown>;
  if (typeof r.revision !== 'number' || !Number.isInteger(r.revision) || r.revision < 0 || !Array.isArray(r.seasons)) {
    return DEFAULT_SEASON_SCHEDULE;
  }
  const candidates = r.seasons
    .map(definitionFromUnknown)
    .filter((d): d is SeasonDefinition => d !== null)
    .sort((a, b) => a.number - b.number);
  const accepted: SeasonDefinition[] = [];
  for (const def of candidates) {
    if (accepted.some((d) => d.number === def.number)) continue;
    // Les dates se vérifient pauses IGNORÉES : une saison en pause garde sa date prévue, et ce qui suit
    // doit rester cohérent avec elle — sinon la reprise serait impossible sans chirurgie en base.
    if (def.number > 1) {
      const previous = startOf(datesPlanOf({ revision: 0, seasons: accepted }), def.number - 1)!;
      if (dayDiff(previous, def.startDay) < SEASON_DAYS) continue;
    }
    accepted.push(def);
  }
  return { revision: r.revision, seasons: accepted };
}

function calendarOf(plan: Plan, n: number): SeasonCalendar | null {
  const startDay = startOf(plan, n);
  if (startDay === null) return null;
  return {
    number: n,
    startDay,
    endDay: addDays(startDay, SEASON_DAYS - 1),
    weekKeys: Array.from({ length: SEASON_WEEKS }, (_, week) => addDays(startDay, week * 7)),
    themeKey: plan.byNumber.get(n)?.themeKey ?? themeOf(n),
  };
}

/** Le calendrier d'une saison selon le calendrier servi ; `null` en pause ou pour un numéro invalide. */
export function scheduledSeasonCalendar(schedule: SeasonSchedule, number: number): SeasonCalendar | null {
  if (!Number.isFinite(number) || Math.trunc(number) < 1) return null;
  return calendarOf(planOf(schedule), Math.trunc(number));
}

/** Le numéro de la dernière saison OUVERTE à ce jour (en cours ou close), `null` avant la première. */
function lastStartedAt(plan: Plan, dayKey: string): number | null {
  const day = dayNumber(dayKey);
  let index = -1;
  plan.anchors.forEach((anchor, i) => {
    if (dayNumber(anchor.startDay) <= day) index = i;
  });
  if (index < 0) return null;
  const anchor = plan.anchors[index]!;
  let n = anchor.number + Math.floor(dayDiff(anchor.startDay, dayKey) / SEASON_DAYS);
  const next = plan.anchors[index + 1];
  if (next) n = Math.min(n, next.number - 1);
  if (plan.pausedFrom !== null) n = Math.min(n, plan.pausedFrom - 1);
  return n >= 1 && startOf(plan, n) !== null ? n : null;
}

/** La saison qui contient ce jour ; `null` avant la première, dans un intervalle ou pendant une pause. */
export function scheduledSeasonAt(schedule: SeasonSchedule, dayKey: string): number | null {
  if (!isDayKey(dayKey)) return null;
  const plan = planOf(schedule);
  const n = lastStartedAt(plan, dayKey);
  if (n === null) return null;
  const calendar = calendarOf(plan, n)!;
  return dayNumber(dayKey) <= dayNumber(calendar.endDay) ? n : null;
}

/** La semaine de saison, de 1 à 8 ; `null` hors saison. */
export function scheduledSeasonWeek(schedule: SeasonSchedule, dayKey: string): number | null {
  const n = scheduledSeasonAt(schedule, dayKey);
  if (n === null) return null;
  return Math.floor(dayDiff(calendarOf(planOf(schedule), n)!.startDay, dayKey) / 7) + 1;
}

/** La saison d'un moment, la fermeture du dimanche 20 h comprise. */
export const scheduledSeasonOfMoment = (schedule: SeasonSchedule, moment: LeagueMoment): number | null =>
  scheduledSeasonAt(schedule, leagueWeekOfMoment(moment));

/**
 * La saison À VENIR : hors saison (avant la première, dans un intervalle), la
 * prochaine programmée ; `null` pendant une saison, ou quand la suivante est en pause.
 */
export function scheduledUpcomingSeason(schedule: SeasonSchedule, moment: LeagueMoment): SeasonCalendar | null {
  const week = leagueWeekOfMoment(moment);
  if (scheduledSeasonAt(schedule, week) !== null) return null;
  const plan = planOf(schedule);
  const last = lastStartedAt(plan, week);
  return calendarOf(plan, last === null ? 1 : last + 1);
}

export function seasonStatusOf(schedule: SeasonSchedule, number: number): SeasonDefinitionStatus {
  const { pausedFrom } = planOf(schedule);
  return pausedFrom !== null && Math.trunc(number) >= pausedFrom ? 'paused' : 'scheduled';
}

/**
 * La définition d'une saison : celle du calendrier, ou la dérivation (dates
 * enchaînées, thème en boucle, points de la loi, sans texte propre).
 */
export function seasonDefinitionOf(schedule: SeasonSchedule, number: number): SeasonDefinition | null {
  if (!isPositiveInt(number)) return null;
  const plan = planOf(schedule);
  const explicit = plan.byNumber.get(number);
  if (explicit) return explicit;
  const anchor = anchorFor(datesPlanOf(schedule), number);
  return {
    number,
    startDay: addDays(anchor.startDay, (number - anchor.number) * SEASON_DAYS),
    status: seasonStatusOf(schedule, number),
    themeKey: themeOf(number),
    stepPoints: SEASON_STEP_POINTS,
    copy: null,
  };
}

/** Une modification de l'admin (ou une proposition validée) : seuls les champs fournis changent. */
export type SeasonEdit = {
  readonly number: number;
  readonly startDay?: string;
  readonly status?: SeasonDefinitionStatus;
  readonly themeKey?: string;
  readonly stepPoints?: number;
  readonly copy?: unknown;
};

export type SeasonEditRefusal =
  | 'invalid-number'
  | 'invalid-status'
  | 'season-not-future'
  | 'season-announced'
  | 'invalid-day'
  | 'not-monday'
  | 'start-not-future'
  | 'start-too-soon'
  | 'overlaps-previous'
  | 'overlaps-next'
  | 'invalid-theme'
  | 'rewards-out-of-bounds'
  | 'copy-invalid';

export type SeasonEditResult =
  | { readonly ok: true; readonly schedule: SeasonSchedule; readonly definition: SeasonDefinition }
  | { readonly ok: false; readonly reason: SeasonEditRefusal };

/**
 * PROGRAMMER, DÉCALER, METTRE EN PAUSE une saison FUTURE. Refuse une saison en
 * cours ou passée, une date qui n'est pas un lundi ou déjà commencée, un
 * chevauchement, un thème hors catalogue, des récompenses hors des bornes, des
 * textes incomplets ou trop longs. Le calendrier rendu porte la révision suivante.
 */
export function applySeasonEdit(schedule: SeasonSchedule, edit: SeasonEdit, now: LeagueMoment): SeasonEditResult {
  const refuse = (reason: SeasonEditRefusal): SeasonEditResult => ({ ok: false, reason });
  if (!isPositiveInt(edit.number)) return refuse('invalid-number');
  const n = edit.number;
  const plan = planOf(schedule);
  const current = calendarOf(plan, n);
  // Une saison datée doit être à venir, et pas encore annoncée sur l'App Store (publication J-7).
  // Une saison en pause (ou derrière une pause) n'a jamais commencé : elle reste programmable.
  if (current !== null) {
    if (seasonTenseAt(current, now) !== 'upcoming') return refuse('season-not-future');
    if (dayNumber(current.startDay) - SEASON_EDIT_FREEZE_DAYS <= dayNumber(now.dayKey)) return refuse('season-announced');
  }
  const base = seasonDefinitionOf(schedule, n)!;

  if (edit.themeKey !== undefined && !isSeasonThemeKey(edit.themeKey)) return refuse('invalid-theme');
  if (edit.stepPoints !== undefined && !isLawfulStepPoints(edit.stepPoints)) return refuse('rewards-out-of-bounds');
  if (edit.copy !== undefined && edit.copy !== null && !isLawfulSeasonCopy(edit.copy)) return refuse('copy-invalid');
  if (edit.status !== undefined && edit.status !== 'scheduled' && edit.status !== 'paused') return refuse('invalid-status');
  if (edit.startDay !== undefined) {
    if (typeof edit.startDay !== 'string' || !isDayKey(edit.startDay)) return refuse('invalid-day');
    if (!isMonday(edit.startDay)) return refuse('not-monday');
  }

  const definition: SeasonDefinition = {
    number: n,
    startDay: edit.startDay ?? base.startDay,
    status: edit.status ?? base.status,
    themeKey: (edit.themeKey as SeasonThemeKey | undefined) ?? base.themeKey,
    stepPoints: edit.stepPoints ?? base.stepPoints,
    copy: edit.copy === undefined ? base.copy : ((edit.copy as SeasonCopyByLocale | null) ?? null),
  };

  if (definition.status === 'scheduled' && edit.startDay !== undefined) {
    if (dayNumber(definition.startDay) <= dayNumber(leagueWeekOfMoment(now))) return refuse('start-not-future');
    if (dayNumber(definition.startDay) - SEASON_EDIT_FREEZE_DAYS <= dayNumber(now.dayKey)) return refuse('start-too-soon');
  }
  if (definition.status === 'scheduled' && current === null && edit.startDay === undefined) {
    // Une reprise sans date : la date prévue doit encore laisser le temps de l'annonce.
    if (dayNumber(definition.startDay) - SEASON_EDIT_FREEZE_DAYS <= dayNumber(now.dayKey)) return refuse('start-too-soon');
  }
  if (n > 1) {
    const previousStart = startOf(datesPlanOf(schedule), n - 1)!;
    if (dayDiff(previousStart, definition.startDay) < SEASON_DAYS) return refuse('overlaps-previous');
  }

  const seasons = [...schedule.seasons.filter((d) => d.number !== n), definition].sort((a, b) => a.number - b.number);
  const next: SeasonSchedule = { revision: schedule.revision + 1, seasons };
  if (normalizeSeasonSchedule(next).seasons.length !== seasons.length) return refuse('overlaps-next');
  return { ok: true, schedule: next, definition };
}
