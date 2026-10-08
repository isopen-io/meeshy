import { ENGAGEMENT_AXES } from '@meeshy/shared/types/engagement';
import { engagementAxisLabel, engagementAxisWhatCounts } from '@meeshy/shared/utils/engagement-labels';
import { BADGE_MATERIALS } from '@meeshy/shared/utils/game/badge-tiers';
import { badgeGuide, badgeGuidesByFamily } from '@meeshy/shared/utils/game/badge-guide';

import { GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { GameMedal } from '@/components/game/medal';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { BADGES_SECTION_ID, pictogramOf, webMaterial } from '@/lib/game/medal';
import { familyName, formatCount, gameText, materialName } from '@/lib/view/game-copy';

/**
 * LA SECTION BADGES DU CARNET DES RÈGLES (#9639) — l'endroit unique que tous
 * les liens « Comprendre les badges » atteignent (`BADGES_GUIDE_LINK`, ancre
 * `BADGES_SECTION_ID`). Elle dit ce qu'est un badge (UN geste compté), pourquoi
 * cuivre, pourquoi bronze — les sept matières et leurs seuils, dans l'ordre —,
 * le ruban dès l'Or, l'empreinte d'un badge éteint, et les vingt badges rangés
 * par famille, chacun avec SON glyphe et ce qui compte pour lui.
 *
 * Une page qui explique, sans geste : aucun dessin n'est lu (les médailles sont
 * décoratives, le nom et la phrase les disent).
 */
export function RulesBadges() {
  const language = currentInterfaceLanguage();
  const families = badgeGuidesByFamily(ENGAGEMENT_AXES.map((axisKey) => badgeGuide({ axisKey, count: 0 })));
  return (
    <section id={BADGES_SECTION_ID} aria-labelledby={`${BADGES_SECTION_ID}-titre`} className="flex scroll-mt-4 flex-col gap-3">
      <h2 id={`${BADGES_SECTION_ID}-titre`} className="text-title font-bold" style={{ color: GAME_INK }}>
        {gameText('game.rules.badges.title')}
      </h2>
      <p className="text-body" style={{ color: GAME_INK }}>
        {gameText('game.rules.badges.intro')}
      </p>
      <p className="text-body" style={{ color: GAME_INK }}>
        {gameText('game.rules.badges.ladder')}
      </p>
      <ol className="flex flex-col rounded-card px-3 py-2" style={{ backgroundColor: GAME_CARD }}>
        {BADGE_MATERIALS.map((material, index) => {
          const name = materialName(webMaterial(material.key), language);
          return (
            <li key={material.key} className="flex items-center gap-3 py-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-5 shrink-0 rounded-full"
                style={{ background: `linear-gradient(135deg, var(--game-${webMaterial(material.key)}-0), var(--game-${webMaterial(material.key)}-1))` }}
              />
              <span data-badge-material-name={name} className="min-w-0 flex-1 text-body font-semibold" style={{ color: GAME_INK }}>
                {name}
              </span>
              <span aria-hidden="true" className="text-caption" style={{ color: GAME_INK_2 }}>
                {'★'.repeat(index + 1)}
              </span>
              <span className="w-14 shrink-0 text-end text-body tabular-nums" style={{ color: GAME_INK }}>{formatCount(material.threshold, language)}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-body" style={{ color: GAME_INK_2 }}>
        {gameText('game.rules.badges.ribbon')}
      </p>
      <p className="text-body" style={{ color: GAME_INK_2 }}>
        {gameText('game.rules.badges.imprint')}
      </p>
      <h3 className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.rules.badges.families')}
      </h3>
      {families.map((group) => (
        <div key={group.family} className="flex flex-col gap-1">
          <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {familyName(group.family, language)}
          </p>
          <ul className="flex flex-col rounded-card px-3 py-1" style={{ backgroundColor: GAME_CARD }}>
            {group.guides.map((guide) => (
              <li key={guide.axisKey} data-badge-guide-axis={guide.axisKey} className="flex items-center gap-3 py-1.5">
                <GameMedal size={32} family={guide.family} pictogram={pictogramOf(guide.axisKey)} tier={1} progress={0} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold" style={{ color: GAME_INK }}>
                    {engagementAxisLabel(language, guide.axisKey)}
                  </span>
                  <span className="text-caption" style={{ color: GAME_INK_2 }}>
                    {engagementAxisWhatCounts(language, guide.axisKey)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-body" style={{ color: GAME_INK_2 }}>
        {gameText('game.rules.badges.sheet')}
      </p>
    </section>
  );
}
