import { Fragment } from 'react';

import { engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';
import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { badgeGuideOfProgress, badgeGuidesByFamily } from '@meeshy/shared/utils/game/badge-guide';

import { BadgeUpcoming } from '@/components/game/badge-ladder';
import { PRESS } from '@/components/game-touch';
import { medalOfAxis } from '@/lib/game/medal';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { BADGES_GUIDE_LINK, badgeGuideView } from '@/lib/view/badge-guide-view';
import { gameText, medalLabel } from '@/lib/view/game-copy';
import { FAMILY_LABELS } from '@/lib/view/progression';
import { ProgressionPage } from '@/routes/progression-page';
import { AxisRow, BRAND, INK_2 } from '@/routes/progression-parts';
import { Link } from '@/routes/route-table';

/**
 * LA PAGE DÉDIÉE DES BADGES (#5843) — un badge par axe et par palier.
 *
 * Le hub n'en annonce que le COMPTE ; le détail vit ici, où il a la place de
 * respirer. Les badges sont rangés par famille, dans l'ordre que la loi
 * partagée déclare (`badgeGuidesByFamily`, #9639), et chacun montre la SUITE de
 * ses paliers à venir — sa matière et son seuil. Un lien « Comprendre les
 * badges » mène à la section badges du carnet des règles, la même adresse que
 * celle de la fiche d'un badge.
 *
 * Chaque badge est une MÉDAILLE (#9466), dite en toutes lettres dans la langue
 * de l'interface (le catalogue `game.*` se charge avec la route).
 */
export function BadgesBody({ progress }: { readonly progress: EngagementProgress }) {
  const language = currentInterfaceLanguage();
  const axes = new Map(progress.axes.map((axis) => [axis.axisKey, axis] as const));
  const groups = badgeGuidesByFamily(progress.axes.map(badgeGuideOfProgress));
  return (
    <>
      <Link
        to={BADGES_GUIDE_LINK.to}
        search={BADGES_GUIDE_LINK.search}
        data-badge-guide-link=""
        className={`${PRESS} flex items-center justify-center rounded-chip px-4 text-body font-semibold`}
        style={{ minHeight: 44, color: BRAND }}
      >
        {gameText('game.badge.guide_link')}
      </Link>
      {groups.map((group) => (
        <section key={group.family} aria-labelledby={`badges-${group.family}`} className="flex flex-col gap-2">
          <h2 id={`badges-${group.family}`} className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
            {FAMILY_LABELS[group.family]}
          </h2>
          <ul className="flex flex-col rounded-card px-1" style={{ backgroundColor: 'var(--color-ios-card)' }}>
            {group.guides.map((guide) => {
              const axis = axes.get(guide.axisKey);
              if (axis === undefined) return null;
              const label = engagementAxisLabel(language, guide.axisKey);
              return (
                <Fragment key={guide.axisKey}>
                  <AxisRow axis={axis} medalLabel={medalLabel(medalOfAxis(axis), label)} />
                  <li>
                    <BadgeUpcoming view={badgeGuideView(guide, language)} axisLabel={label} />
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

export default function ProgressionBadgesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  return (
    <ProgressionPage titre="Badges" teinte={BRAND} compte={(p) => `${p.badgesEarned} / ${p.badgesTotal}`}>
      {(progress) => <BadgesBody progress={progress} />}
    </ProgressionPage>
  );
}
