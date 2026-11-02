import type { PackRequirementPreview, PackRewardPreview, PackWindowPreview } from '@meeshy/shared/types/pack-unlock';
import type { GloryRankKey } from '@meeshy/shared/utils/game/glory';

import { unlockText } from './unlock-texts';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUI RESTE À DÉBLOQUER D'UN PACK, EN UNE LIGNE** (W18, #11324) — lu dans
 * `requirementPreview`, que la boutique sert (S21, #11276). Une récompense
 * remplie ne se redit pas ; une fenêtre ouverte sans fin non plus. Le nom d'un
 * rang vient du catalogue du jeu ; les phrases, de `unlock-texts.ts`, chargé à part : tant qu'il ne l'est pas, la
 * ligne dit la Gloire qui manque, sans le nom (`rankName` absent).
 *
 * Le serveur reste juge (`PackGrants`) : cette ligne MONTRE, elle n'accorde
 * rien. `packIsLocked` retient le geste tant que l'aperçu n'est pas rempli.
 */
export const packIsLocked = (preview: PackRequirementPreview | undefined): boolean => preview !== undefined && !preview.met;

const LOCALES: Readonly<Record<InterfaceLanguage, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-u-nu-latn',
};

export const formatUnlockCount = (language: InterfaceLanguage, value: number): string => new Intl.NumberFormat(LOCALES[language]).format(value);

export const formatUnlockDate = (language: InterfaceLanguage, iso: string): string | null => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(LOCALES[language], { day: 'numeric', month: 'long' }).format(date);
};

function rewardLine(reward: PackRewardPreview, language: InterfaceLanguage, rankName: ((rank: GloryRankKey) => string) | undefined): string | null {
  switch (reward.kind) {
    case 'rank': {
      if (reward.requirement.met) return null;
      const missing = formatUnlockCount(language, reward.requirement.missing);
      return rankName === undefined
        ? unlockText(language, 'glory', { missing })
        : unlockText(language, 'rank', { rank: rankName(reward.rank), missing });
    }
    case 'trophy':
      return reward.met ? null : unlockText(language, 'trophy');
    case 'season':
      return reward.met ? null : unlockText(language, 'season', { number: String(reward.number) });
  }
}

function windowLine(window: PackWindowPreview, language: InterfaceLanguage): string | null {
  if (window.state === 'closed') return unlockText(language, 'closed');
  const bound = window.state === 'upcoming' ? window.startsAt : window.endsAt;
  const date = bound === undefined ? null : formatUnlockDate(language, bound);
  if (date === null) return null;
  return unlockText(language, window.state === 'upcoming' ? 'upcoming' : 'until', { date });
}

export function packUnlockLine(params: {
  readonly preview: PackRequirementPreview;
  readonly language: InterfaceLanguage;
  readonly rankName?: (rank: GloryRankKey) => string;
}): string | null {
  const { preview, language, rankName } = params;
  const parts = [preview.reward === null ? null : rewardLine(preview.reward, language, rankName), preview.window === null ? null : windowLine(preview.window, language)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : parts.join(' · ');
}
