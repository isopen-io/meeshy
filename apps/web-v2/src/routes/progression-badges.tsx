import { ProgressionPage } from '@/routes/progression-page';
import { AxisRow, BRAND, INK_2 } from '@/routes/progression-parts';
import { FAMILY_LABELS } from '@/lib/view/progression';
import { axesByFamily } from '@meeshy/shared/utils/engagement-progress';

/**
 * LA PAGE DÉDIÉE DES BADGES (#5843) — un badge par axe et par palier.
 *
 * Le hub n'en annonce que le COMPTE ; le détail vit ici, où il a la place de
 * respirer. Les axes restent rangés par famille, comme dans le modèle : c'est
 * le même vocabulaire que sur le hero du niveau, qui énumère ces familles.
 */
export default function ProgressionBadgesScreen() {
  return (
    <ProgressionPage
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
                <AxisRow key={axe.axisKey} axis={axe} />
              ))}
            </div>
          </section>
        ))
      }
    </ProgressionPage>
  );
}
