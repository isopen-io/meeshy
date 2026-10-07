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


import { GameMedal } from '@/components/game/medal';
import { GameRarityLine } from '@/components/game-rarity';
import { Glyph, GlyphSvg, type GlyphShape } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { milestoneGlyph } from '@/components/milestone-glyph';
import { medalOfAxis } from '@/lib/game/medal';
import { rarityRim, visibleRarity, type AchievementRarityMap } from '@/lib/game/rarity';
import { gameText } from '@/lib/view/game-copy';
import {
  ACHIEVEMENT_COPY,
  ACHIEVEMENT_SECTION_TITLES,
  generatedAchievementLabel,
  AXIS_LABELS,
  BADGE_UNIT,
  nextStepLabel,
  reachedAtLabel,
  type ProgressionGlyph,
} from '@/lib/view/progression';
import {
  type EngagementAxisProgress,
  type EngagementProgress,
  type EngagementTier,
} from '@meeshy/shared/utils/engagement-progress';
import type { EngagementAchievementKey } from '@meeshy/shared/types/engagement';
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
/* Les teintes d'ÉTAT suivent le thème (`--color-warn|ok|error`) : les jetons
   `--ios-*` bruts sont ceux du thème sombre et tombent sous 3:1 en clair
   (#9383, `progression-contrast.test.ts`). */
export const STREAK_TINT = 'var(--color-warn)';
/** L'ambre des Meeshes — la même famille que les badges, distincte de la marque. */
export const MEESH_TINT = 'var(--color-warn)';
/** L'argent de la PIÈCE Meesh (#6427) — dérivé de `MeeshyColors.meeshSilver`, jamais recopié. */
export const MEESH_COIN_TINT = 'var(--ios-meesh-silver)';
export const UNLOCKED_TINT = 'var(--color-ok)';
export const INK = 'var(--color-ios-ink)';
export const INK_2 = 'var(--color-ios-ink-2)';
export const CARD = 'var(--color-ios-card)';

/** Les glyphes d'axe — la table unique que la ligne de notification d'un badge lit aussi (`milestone-glyph.ts`, #8727). */
export const axisGlyph = (name: ProgressionGlyph): GlyphShape => milestoneGlyph(name);

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

/**
 * LA LIGNE D'UN BADGE (#9466) — un badge d'accumulation est une MÉDAILLE
 * (`components/game/medal.tsx`) : lunette de métal à la hauteur atteinte, émail
 * de la famille, pictogramme d'axe, perles de palier, arc vers le suivant ;
 * éteint, son empreinte. La ligne dit déjà l'axe, le palier et ce qui manque :
 * la médaille reste décorative sauf quand l'hôte lui passe `medalLabel`
 * (« Messages texte, Or, 100 sur 500 vers Platine »).
 */
export function AxisRow({ axis, medalLabel }: { axis: EngagementAxisProgress; medalLabel?: string }) {
  const label = AXIS_LABELS[axis.axisKey];
  const medal = medalOfAxis(axis);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="grid w-12 shrink-0 place-items-center">
        <GameMedal
          size={44}
          family={medal.family}
          pictogram={medal.pictogram}
          tier={medal.tier}
          progress={medal.progress}
          {...(medal.threshold === null ? {} : { threshold: String(medal.threshold) })}
          {...(medal.missing === null ? {} : { missing: `−${medal.missing}` })}
          {...(medalLabel === undefined ? {} : { label: medalLabel })}
        />
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

export function AchievementsSection({
  progress,
  onPhoto,
  rarities,
}: {
  progress: EngagementProgress;
  /** La rareté mesurée de chaque succès (#9390) ; absente (ancien serveur) : l'écran d'avant. */
  rarities?: AchievementRarityMap | undefined;
  /** La révélation d'un succès se photographie (#7742) ; absent : aucun bouton. */
  onPhoto?: (key: EngagementAchievementKey) => void;
}) {
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
            const entry = rarities?.[achievement.key];
            const shown = visibleRarity(entry);
            return (
              <li
                key={achievement.key}
                {...(shown === null ? {} : { 'data-game-rim': shown })}
                className="flex items-center gap-3 py-2.5"
                style={shown === null ? undefined : { ...rarityRim(shown), paddingInlineStart: 10 }}
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-field"
                  style={{
                    color: achievement.unlocked ? UNLOCKED_TINT : INK_2,
                    backgroundColor: achievement.unlocked
                      ? 'color-mix(in srgb, var(--color-ok) 14%, transparent)'
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
                  <GameRarityLine entry={entry} />
                </div>
                {achievement.unlocked && onPhoto !== undefined ? (
                  <button
                    type="button"
                    data-achievement-photo={achievement.key}
                    aria-label={`${gameText('game.photo.offer.start')} — ${copy.title}`}
                    onClick={() => onPhoto(achievement.key)}
                    className="grid size-11 shrink-0 place-items-center rounded-chip"
                    style={{ color: BRAND }}
                  >
                    <Glyph name="image" size={18} />
                  </button>
                ) : null}
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
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand"
        style={{ backgroundColor: BRAND, minHeight: 44 }}
      >
        Réessayer
      </button>
    </div>
  );
}

