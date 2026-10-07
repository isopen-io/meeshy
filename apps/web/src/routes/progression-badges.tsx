import { medalOfAxis } from '@/lib/game/medal';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { medalLabel } from '@/lib/view/game-copy';
import { ProgressionPage } from '@/routes/progression-page';
import { AxisRow, BRAND, INK_2 } from '@/routes/progression-parts';
import { FAMILY_LABELS } from '@/lib/view/progression';
import { engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';
import { axesByFamily } from '@meeshy/shared/utils/engagement-progress';

/**
 * LA PAGE DÉDIÉE DES BADGES (#5843) — un badge par axe et par palier.
 *
 * Le hub n'en annonce que le COMPTE ; le détail vit ici, où il a la place de
 * respirer. Les axes restent rangés par famille, comme dans le modèle : c'est
 * le même vocabulaire que sur le hero du niveau, qui énumère ces familles.
 *
 * Chaque badge est une MÉDAILLE (#9466), dite en toutes lettres dans la langue
 * de l'interface (le catalogue `game.*` se charge avec la route).
 */
export default function ProgressionBadgesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  return (
    <ProgressionPage
      concept="badges"
      titre="Badges"
      teinte={BRAND}
      compte={(p) => `${p.badgesEarned} / ${p.badgesTotal}`}
    >
      {(progress) =>
        axesByFamily(progress.axes).map((groupe) => (
          <section key={groupe.family} aria-labelledby={`badges-${groupe.family}`} className="flex flex-col gap-2">
            <h2
              id={`badges-${groupe.family}`}
              className="text-check font-semibold uppercase tracking-wide"
              style={{ color: INK_2 }}
            >
              {FAMILY_LABELS[groupe.family]}
            </h2>
            <div className="flex flex-col rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
              {groupe.axes.map((axe) => (
                <AxisRow
                  key={axe.axisKey}
                  axis={axe}
                  medalLabel={medalLabel(medalOfAxis(axe), engagementAxisLabel(currentInterfaceLanguage(), axe.axisKey))}
                />
              ))}
            </div>
          </section>
        ))
      }
    </ProgressionPage>
  );
}
