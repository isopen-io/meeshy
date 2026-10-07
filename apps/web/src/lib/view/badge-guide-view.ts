import { engagementAxisWhatCounts } from '@meeshy/shared/utils/engagement-labels';
import type { BadgeGuide, BadgeRung } from '@meeshy/shared/utils/game/badge-guide';

import { webMaterial } from '@/lib/game/badge-guide-link';
import type { GameMaterial } from '@/lib/game/materials';
import { translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatCount, materialName } from '@/lib/view/game-copy';
import { awardedDate } from '@/lib/view/game-copy-v2';

/**
 * CE QU'UN BADGE DIT DE LUI-MÊME (#9639) — la loi partagée (`badgeGuide`) mise
 * en mots : ce qui compte pour CE badge (la phrase de l'AXE, jamais celle de la
 * famille), sa matière et pourquoi, ses étoiles sur sept, ses sept paliers
 * (atteints datés, à venir avec leur seuil), ce qu'il manque pour la prochaine
 * étoile. La fiche (`game-detail.ts#badgeDetail`) et la page des badges le
 * lisent : un badge dit la même chose partout.
 *
 * Et le lien « Comprendre les badges » : UNE adresse, celle de la section
 * badges du carnet des règles (`routes/progression-rules.tsx`), ancrée.
 */

export { BADGES_GUIDE_LINK, BADGES_SECTION_ID, isBadgesSection, webMaterial } from '@/lib/game/badge-guide-link';

export type BadgeRungState = 'reached' | 'next' | 'upcoming';

export type BadgeRungView = {
  readonly threshold: number;
  readonly thresholdLabel: string;
  readonly material: GameMaterial;
  readonly materialName: string;
  readonly state: BadgeRungState;
  /** « Obtenu le 2 octobre 2026 », « Prochaine étoile · encore 13 », « À 100 ». */
  readonly line: string;
};

export type BadgeGuideView = {
  readonly counts: string;
  /** La matière atteinte ; `null` avant le premier palier. */
  readonly material: GameMaterial | null;
  /** Pourquoi cette matière : le seuil franchi (ou la trace gravée), ou ce qui allumera la première étoile. */
  readonly reason: string;
  readonly stars: { readonly lit: number; readonly max: number };
  readonly ladder: readonly BadgeRungView[];
  /** La suite du badge : les paliers à venir, dans l'ordre. */
  readonly upcoming: readonly BadgeRungView[];
  /** Ce qu'il manque pour la prochaine étoile, ou l'échelle complète. */
  readonly next: string;
};

const rungLine = (rung: BadgeRung, state: BadgeRungState, guide: BadgeGuide, language: InterfaceLanguage): string => {
  if (state === 'reached') {
    return rung.reachedAt === null || !Number.isFinite(new Date(rung.reachedAt).getTime())
      ? translateGame(language, 'game.detail.earned')
      : translateGame(language, 'game.detail.earned_on', { date: awardedDate(rung.reachedAt, language) });
  }
  if (state === 'next') return translateGame(language, 'game.badge.rung.next', { missing: formatCount(guide.next?.missing ?? 0, language) });
  return translateGame(language, 'game.badge.rung.upcoming', { threshold: formatCount(rung.threshold, language) });
};

const reasonOf = (guide: BadgeGuide, language: InterfaceLanguage): string => {
  const reached = guide.reached;
  if (reached === null) return translateGame(language, 'game.badge.reason.none');
  const material = materialName(webMaterial(reached.material), language);
  const threshold = formatCount(reached.threshold, language);
  return reached.reason === 'threshold-crossed'
    ? translateGame(language, 'game.badge.reason.crossed', { material, threshold, count: formatCount(guide.count, language) })
    : translateGame(language, 'game.badge.reason.served', { material, threshold });
};

const nextOf = (guide: BadgeGuide, language: InterfaceLanguage): string =>
  guide.next === null
    ? translateGame(language, 'game.badge.complete')
    : translateGame(language, 'game.badge.next', {
        missing: formatCount(guide.next.missing, language),
        material: materialName(webMaterial(guide.next.material), language),
        threshold: formatCount(guide.next.threshold, language),
      });

export function badgeGuideView(guide: BadgeGuide, language: InterfaceLanguage = currentInterfaceLanguage()): BadgeGuideView {
  const ladder = guide.rungs.map<BadgeRungView>((rung) => {
    const state: BadgeRungState = rung.reached ? 'reached' : guide.next?.threshold === rung.threshold ? 'next' : 'upcoming';
    const material = webMaterial(rung.material);
    return {
      threshold: rung.threshold,
      thresholdLabel: formatCount(rung.threshold, language),
      material,
      materialName: materialName(material, language),
      state,
      line: rungLine(rung, state, guide, language),
    };
  });
  return {
    counts: engagementAxisWhatCounts(language, guide.axisKey),
    material: guide.reached === null ? null : webMaterial(guide.reached.material),
    reason: reasonOf(guide, language),
    stars: { lit: guide.stars, max: guide.rungs.length },
    ladder,
    upcoming: ladder.filter((rung) => rung.state !== 'reached'),
    next: nextOf(guide, language),
  };
}
