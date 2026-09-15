/**
 * LES PIÈCES DE « PROGRESSION » — partagées par le hub et ses pages dédiées (#5843).
 *
 * L'écran était un seul long défilement ; il devient un HUB (trois heros, trois
 * entrées) plus trois pages dédiées. Ces composants servent des deux côtés : le
 * hub montre des compteurs, les pages montrent le détail, et un badge doit se
 * peindre pareil aux deux endroits.
 *
 * Extrait de `progression.tsx` sans changement de comportement — le fichier
 * passait 617 lignes, et la découpe par RESPONSABILITÉ (les pièces ici, la
 * composition là-bas) est celle que le budget de taille demande.
 */


import { Glyph, GlyphSvg, type GlyphShape } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { ProgressBar } from '@/components/progress-bar';
import { meeshMissing } from '@/lib/view/meesh-copy';
import {
  ACHIEVEMENT_COPY,
  ACHIEVEMENT_SECTION_TITLES,
  generatedAchievementLabel,
  AXIS_GLYPHS,
  AXIS_LABELS,
  BADGE_UNIT,
  nextStepLabel,
  reachedAtLabel,
  type ProgressionGlyph,
} from '@/lib/view/progression';
import {
  type EngagementAxisProgress,
  type EngagementMeeshProgress,
  type EngagementProgress,
  type EngagementTier,
} from '@meeshy/shared/utils/engagement-progress';
import type { AchievementSectionView } from '@meeshy/shared/utils/achievement-view';

/**
 * L'ÉCRAN « PROGRESSION » (#5547) — le tableau de bord des streaks & badges
 * (`docs/product/streaks-badges-modele.md` § 9) : le niveau que porte le score,
 * la série qui court et son record, les badges par famille d'axe avec le
 * palier suivant, les succès débloqués et ceux qu'il reste à débloquer.
 *
 * Anatomie iOS (#5698, dessinés ensemble) : en-tête flottant sans barre de
 * navigation système, deux cartes de résumé, puis des sections en cartes
 * teintées — la même hiérarchie que `UserStatsView` / `SettingsView`. Ce que
 * l'écran REFUSE de faire :
 *  - lire l'historique des notifications — il restitue l'ÉTAT courant, depuis
 *    `GET /me/engagement`, même si aucune notification n'a jamais été vue ;
 *  - cacher un axe à zéro — l'état vide est le catalogue ENTIER, verrouillé,
 *    avec la première action qui débloque ; un écran qui ne montrerait que
 *    l'acquis ne dirait pas ce qu'il reste à faire (dimension 8) ;
 *  - peindre un spinner — squelette à froid, données en cache sinon
 *    (`staleTime`, `main.tsx`), et hors ligne l'instantané reste affiché avec
 *    le bandeau de coupure, jamais un voile.
 *
 * `ProgressionScreen` (défaut) porte la LECTURE — la requête et ses états ;
 * `ProgressionBody` porte le RENDU, pur, testé par `progression.test.tsx`
 * sans monter TanStack Query (même découpe que `LoginScreen` / `Field`).
 */

export const BRAND = 'var(--color-ios-brand)';
export const STREAK_TINT = 'var(--ios-warning)';
/** L'ambre des Meeshes — la même famille que les badges, distincte de la marque. */
export const MEESH_TINT = 'var(--ios-warning)';
/** L'argent de la PIÈCE Meesh (#6427) — dérivé de `MeeshyColors.meeshSilver`, jamais recopié. */
export const MEESH_COIN_TINT = 'var(--ios-meesh-silver)';
export const UNLOCKED_TINT = 'var(--ios-success)';
export const INK = 'var(--color-ios-ink)';
export const INK_2 = 'var(--color-ios-ink-2)';
export const CARD = 'var(--color-ios-card)';

/** Les glyphes d'axe viennent des DEUX jeux — le socle (`user`, `smiley`, `microphone`) et celui de l'écran. */
export function axisGlyph(name: ProgressionGlyph): GlyphShape {
  return name in PROGRESSION_GLYPHS ? PROGRESSION_GLYPHS[name as keyof typeof PROGRESSION_GLYPHS] : GLYPHS[name as keyof typeof GLYPHS];
}

export function Card({ tint, children, className }: { tint: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card p-4 ${className ?? ''}`}
      style={{
        backgroundColor: CARD,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 22%, transparent)`,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ glyph, title, tint, trailing, id }: { glyph: GlyphShape; title: string; tint: string; trailing?: string; id: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span style={{ color: tint }}>
        <GlyphSvg glyph={glyph} size={13} />
      </span>
      <h2 id={id} className="flex-1 text-check font-bold tracking-[0.08em] uppercase" style={{ color: tint }}>
        {title}
      </h2>
      {trailing !== undefined ? (
        <span className="text-check font-semibold" style={{ color: INK_2 }}>
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

/** Les cinq pastilles d'un axe — une par palier, pleine quand il est atteint, datée quand il a été gravé. */
export function TierDots({ tiers, tint, axisLabel }: { tiers: readonly EngagementTier[]; tint: string; axisLabel: string }) {
  return (
    <ol className="flex items-center gap-1" aria-label={`Paliers de ${axisLabel}`}>
      {tiers.map((tier) => {
        const dated = reachedAtLabel(tier.reachedAt);
        return (
          <li
            key={tier.threshold}
            className="size-2.5 rounded-chip"
            style={{
              backgroundColor: tier.reached ? tint : 'transparent',
              boxShadow: `inset 0 0 0 1.5px ${tier.reached ? tint : 'color-mix(in srgb, var(--color-ios-ink-3) 55%, transparent)'}`,
            }}
            aria-label={
              tier.reached ? `Palier ${tier.threshold} atteint${dated ? ` — ${dated.toLowerCase()}` : ''}` : `Palier ${tier.threshold} à atteindre`
            }
          />
        );
      })}
    </ol>
  );
}

export function AxisRow({ axis }: { axis: EngagementAxisProgress }) {
  const label = AXIS_LABELS[axis.axisKey];
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-field"
        style={{ color: BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
      >
        <GlyphSvg glyph={axisGlyph(AXIS_GLYPHS[axis.axisKey])} size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-body font-semibold" style={{ color: INK }}>
            {label}
          </span>
          <span className="shrink-0 text-caption font-semibold tabular-nums" style={{ color: INK_2 }}>
            {axis.value}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <TierDots tiers={axis.tiers} tint={BRAND} axisLabel={label} />
          <span className="truncate text-check" style={{ color: INK_2 }}>
            {nextStepLabel(axis, BADGE_UNIT)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function AchievementsSection({ progress }: { progress: EngagementProgress }) {
  const unlocked = progress.achievements.filter((a) => a.unlocked).length;
  return (
    <section aria-labelledby="progression-achievements" className="flex flex-col gap-2">
      <SectionTitle
        id="progression-achievements"
        glyph={GLYPHS.trophy}
        title="Succès"
        tint={UNLOCKED_TINT}
        trailing={`${unlocked} / ${progress.achievements.length}`}
      />
      <Card tint={UNLOCKED_TINT} className="py-1">
        <ul className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)' }}>
          {progress.achievements.map((achievement) => {
            const copy = ACHIEVEMENT_COPY[achievement.key];
            const dated = reachedAtLabel(achievement.reachedAt);
            return (
              <li key={achievement.key} className="flex items-center gap-3 py-2.5">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-field"
                  style={{
                    color: achievement.unlocked ? UNLOCKED_TINT : INK_2,
                    backgroundColor: achievement.unlocked
                      ? 'color-mix(in srgb, var(--ios-success) 14%, transparent)'
                      : 'color-mix(in srgb, var(--color-ios-ink-3) 18%, transparent)',
                  }}
                >
                  {achievement.unlocked ? <Glyph name="trophy" size={16} /> : <Glyph name="lock" size={16} />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body font-semibold" style={{ color: achievement.unlocked ? INK : INK_2 }}>
                    {copy.title}
                  </span>
                  <span className="text-check" style={{ color: INK_2 }}>
                    {achievement.unlocked ? (dated ?? 'Débloqué') : copy.condition}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/**
 * LE CORPS — pur. `online` vient de l'écran : hors ligne, l'instantané reste
 * peint tel quel, le bandeau de l'en-tête dit le reste.
 */
/**
 * LES SUCCÈS GÉNÉRÉS, EN RANGÉES HORIZONTALES (#5759).
 *
 * Une section = une rangée qui défile latéralement. Trois propriétés que le
 * catalogue impose et que ce rendu doit respecter :
 *
 *  - **l'ordre est celui de la difficulté**, calculé par la loi partagée — le
 *    rendu ne trie RIEN, sans quoi le web et iOS pourraient diverger ;
 *  - **la fenêtre est déjà appliquée** (`max(7, acquis + 2)`) : les entrées
 *    reçues sont exactement celles à montrer, donc le prochain objectif est
 *    toujours le dernier de la rangée ;
 *  - **aucun palier inatteignable n'arrive ici** — il a été retiré en amont,
 *    pas masqué en CSS : un objectif qu'on ne peut pas tenir ne doit pas
 *    exister dans l'arbre, même invisible.
 *
 * La rangée défile dans SON conteneur (`overflow-x`), jamais le document : la
 * page ne défile jamais horizontalement.
 */
export function GeneratedAchievements({ sections }: { sections: readonly AchievementSectionView[] }) {
  if (sections.length === 0) return null;
  return (
    <section aria-labelledby="progression-generated" className="flex flex-col gap-4">
      <SectionTitle
        id="progression-generated"
        glyph={PROGRESSION_GLYPHS.medal}
        title="Défis"
        tint={BRAND}
      />
      {sections.map((vue) => (
        <div key={vue.section} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-caption font-semibold" style={{ color: INK }}>
              {ACHIEVEMENT_SECTION_TITLES[vue.section]}
            </h3>
            <span className="text-check" style={{ color: INK_2 }}>
              {vue.unlockedCount} / {vue.attainableCount}
            </span>
          </div>
          <ul
            className="scrollbar-none flex gap-2 overflow-x-auto pb-1"
            aria-label={`${ACHIEVEMENT_SECTION_TITLES[vue.section]} — ${vue.unlockedCount} sur ${vue.attainableCount}`}
          >
            {vue.entries.map((entry) => (
              <li
                key={entry.key}
                className="flex min-w-36 shrink-0 flex-col gap-1 rounded-card px-3 py-2"
                style={{
                  backgroundColor: entry.unlocked
                    ? 'color-mix(in srgb, var(--color-ok) 14%, transparent)'
                    : 'color-mix(in srgb, var(--color-ios-ink) 6%, transparent)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: entry.unlocked ? 'var(--color-ok)' : INK_2 }}
                >
                  <GlyphSvg glyph={entry.unlocked ? PROGRESSION_GLYPHS.star : PROGRESSION_GLYPHS.medal} size={13} />
                </span>
                <span className="text-check font-semibold" style={{ color: INK }}>
                  {generatedAchievementLabel(entry.family, entry.tier)}
                </span>
                {entry.unlocked ? (
                  <span className="text-check" style={{ color: INK_2 }}>
                    Obtenu
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function MeeshHero({
  meesh,
  onMint,
  isMinting,
  mintError,
}: {
  meesh: EngagementMeeshProgress;
  onMint: () => void;
  isMinting: boolean;
  /** L'ÉCHEC de la frappe (#6470) — même loi que `MeeshDetail`. */
  mintError?: string | undefined;
}) {
  const soldeLabel = meesh.balance === 0 ? 'Aucune Meesh' : meesh.balance === 1 ? '1 Meesh' : `${meesh.balance} Meeshes`;
  return (
    <section aria-labelledby="progression-meesh" className="flex flex-col gap-3 rounded-card px-4 py-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--ios-warning) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--ios-warning) 30%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: MEESH_COIN_TINT }} aria-hidden="true">
          <GlyphSvg glyph={PROGRESSION_GLYPHS.coinFill} size={18} />
        </span>
        <h2 id="progression-meesh" className="text-large-title font-bold" style={{ color: INK }}>
          {soldeLabel}
        </h2>
      </div>

      {meesh.mintedLifetime > 0 ? (
        <p className="text-check" style={{ color: INK_2 }}>
          {meesh.mintedLifetime === 1 ? '1 frappée depuis toujours' : `${meesh.mintedLifetime} frappées depuis toujours`}
        </p>
      ) : null}

      <ProgressBar
        progress={meesh.progress}
        label={`Vers la prochaine Meesh — ${meesh.debitablePoints} points sur ${meesh.mintCost}`}
        tint={MEESH_TINT}
      />

      {meesh.canMint ? (
        // Le bouton RESTE pendant la frappe, avec son état dit : le faire
        // disparaître au moment du tap donnerait l'impression que l'action a
        // échoué, alors qu'elle est en cours.
        <>
          <button
            type="button"
            onClick={onMint}
            disabled={isMinting}
            aria-busy={isMinting}
            data-meesh-mint
            className="flex min-h-11 items-center justify-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-80"
            style={{ backgroundColor: MEESH_TINT, color: 'var(--color-ios-surface)' }}
          >
            {/* MÊME loi que `MeeshDetail` (#6470) : l'activité se VOIT, pas
                seulement se lit. Deux surfaces qui portent la même action
                doivent porter le même état, sinon l'une des deux ment. */}
            {isMinting ? (
              <span
                aria-hidden="true"
                data-meesh-mint-spinner
                className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            {isMinting ? 'Frappe en cours…' : `Convertir ${meesh.mintCost} points en une Meesh`}
          </button>
          {mintError !== undefined && !isMinting ? (
            <p role="alert" data-meesh-mint-error className="text-caption" style={{ color: 'var(--ios-error)' }}>
              {mintError}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-check" style={{ color: INK_2 }}>
          {/* SITE UNIQUE (#6478) — la phrase vivait en double, donc fausse deux
              fois : « Vos 1 points de conversation ». */}
          {meeshMissing(meesh.missingPoints, meesh.floorPoints)}
        </p>
      )}
    </section>
  );
}


export function ProgressionSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-4 py-3" aria-busy="true" aria-label="Progression en cours de chargement">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 rounded-card" style={{ backgroundColor: CARD }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 rounded-card" style={{ backgroundColor: CARD }} />
      ))}
    </div>
  );
}

/** L'échec — nommé, avec sa reprise ; hors ligne sans instantané, c'est la coupure qui est nommée. */
export function ProgressionError({ message, online, onRetry }: { message: string; online: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: INK }}>
        {online ? 'La progression n’a pas pu être chargée' : 'Hors ligne — aucune progression en mémoire'}
      </p>
      <p className="text-caption" style={{ color: INK_2 }}>
        {online ? message : 'Elle s’affichera à la reconnexion.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: BRAND, minHeight: 44 }}
      >
        Réessayer
      </button>
    </div>
  );
}

