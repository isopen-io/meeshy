import type { GameFlamePause } from '@meeshy/shared/types/game';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';
import { FLAME_PAUSE_MAX_DAYS, type FlamePauseRefusal } from '@meeshy/shared/utils/game/flame-pause';

import { isRec } from '@/lib/api/game-guards';
import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { daysLabel, gameErrorMessage } from '@/lib/view/game-copy';

/**
 * CE QUE LA FLAMME EN VEILLE DIT (#17372, #20509) — la veille servie, l'annonce et ses refus. Ses phrases vivent
 * dans la partie `concept` du catalogue : seule la fiche de la Flamme (Progression) les lit, jamais le profil ni le
 * carnet des règles, qui n'en chargent pas la partie.
 */

type Language = InterfaceLanguage;

const isDayKey = (field: unknown): field is string => typeof field === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(field);

/**
 * La Flamme en veille lue par le web (#20509) : `null` devant un serveur antérieur, hors de toute veille, ou une
 * forme illisible — la carte d'avant. Sur les gardes du port, comme le rallumage par l'effort (#18924).
 */
export const readFlamePause = (value: unknown): GameFlamePause | null => {
  if (!isRec(value)) return null;
  const { from, until } = value;
  return isDayKey(from) && isDayKey(until) ? { from, until } : null;
};

/** Un jour `AAAA-MM-JJ` dit dans la langue du lecteur, avec son jour de la semaine : une veille dure sept jours au plus. */
const pauseDayLabel = (dayKey: string, language: Language): string => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)),
  );
};

/** En veille : jusqu'à quand ; annoncée, qu'elle commence demain (la veille part toujours du lendemain de l'annonce). */
export const flamePauseLine = (pause: GameFlamePause, today: string, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, pause.from > today ? 'game.flame_panel.paused_soon' : 'game.flame_panel.paused', { date: pauseDayLabel(pause.until, language) });

export const flamePauseIntro = (language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.flame_panel.pause_intro', { days: daysLabel(FLAME_PAUSE_MAX_DAYS, language) });

export const flamePauseAction = (days: number, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.flame_panel.pause', { days: daysLabel(days, language) });

type PauseRefusalKey = 'game.error.flame_pause.quarterly_limit' | 'game.error.flame_pause.already_paused' | 'game.error.flame_pause.no_flame';

const PAUSE_REFUSALS: Readonly<Partial<Record<FlamePauseRefusal, PauseRefusalKey>>> = {
  'quarterly-limit': 'game.error.flame_pause.quarterly_limit',
  'already-paused': 'game.error.flame_pause.already_paused',
  'no-flame': 'game.error.flame_pause.no_flame',
};

/** Le refus d'une veille dit sa raison (`ApiError.reason`) ; une raison inconnue garde la phrase générale du refus. */
export const flamePauseRefusal = (reason: string | undefined, language: Language = currentInterfaceLanguage()): string => {
  const key = Object.entries(PAUSE_REFUSALS).find(([served]) => served === reason)?.[1];
  return key === undefined ? gameErrorMessage(GAME_ERROR_CODES.flamePauseNotAllowed, language) : translateGame(language, key);
};
