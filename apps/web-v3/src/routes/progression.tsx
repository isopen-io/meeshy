import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Glyph, GlyphSvg, type GlyphShape } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { ProgressBar } from '@/components/progress-bar';
import { httpTransport, unwrap } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress, mintMeesh } from '@/lib/api/engagement';
import { useOnline } from '@/lib/net/online';
import {
  ACHIEVEMENT_COPY,
  AXIS_GLYPHS,
  AXIS_LABELS,
  BADGE_UNIT,
  FAMILY_LABELS,
  LEVEL_UNIT,
  STREAK_UNIT,
  levelTitle,
  nextStepLabel,
  reachedAtLabel,
  scoreLabel,
  streakLabel,
  streakRecordLabel,
  type ProgressionGlyph,
} from '@/lib/view/progression';
import { Link } from '@/routes/route-table';
import {
  axesByFamily,
  type EngagementAxisProgress,
  type EngagementMeeshProgress,
  type EngagementProgress,
  type EngagementTier,
} from '@meeshy/shared/utils/engagement-progress';

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

const BRAND = 'var(--color-ios-brand)';
const STREAK_TINT = 'var(--ios-warning)';
/** L'ambre des Meeshes — la même famille que les badges, distincte de la marque. */
const MEESH_TINT = 'var(--ios-warning)';
const UNLOCKED_TINT = 'var(--ios-success)';
const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const CARD = 'var(--color-ios-card)';

/** Les glyphes d'axe viennent des DEUX jeux — le socle (`user`, `smiley`, `microphone`) et celui de l'écran. */
function axisGlyph(name: ProgressionGlyph): GlyphShape {
  return name in PROGRESSION_GLYPHS ? PROGRESSION_GLYPHS[name as keyof typeof PROGRESSION_GLYPHS] : GLYPHS[name as keyof typeof GLYPHS];
}

function Card({ tint, children, className }: { tint: string; children: React.ReactNode; className?: string }) {
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

function SectionTitle({ glyph, title, tint, trailing, id }: { glyph: GlyphShape; title: string; tint: string; trailing?: string; id: string }) {
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
function TierDots({ tiers, tint, axisLabel }: { tiers: readonly EngagementTier[]; tint: string; axisLabel: string }) {
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

function AxisRow({ axis }: { axis: EngagementAxisProgress }) {
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

function LevelCard({ progress }: { progress: EngagementProgress }) {
  const { level } = progress;
  return (
    <Card tint={BRAND}>
      <div className="flex items-center gap-2">
        <span style={{ color: BRAND }}>
          <GlyphSvg glyph={PROGRESSION_GLYPHS.star} size={16} />
        </span>
        <p className="text-title font-bold" style={{ color: INK }}>
          {levelTitle(level.level)}
        </p>
      </div>
      <p className="mt-1 text-caption" style={{ color: INK_2 }}>
        {scoreLabel(level.value)}
      </p>
      <div className="mt-3">
        <ProgressBar progress={level.progress} label={`Niveau ${level.level} — vers le niveau ${level.level + 1}`} tint={BRAND} />
      </div>
      <p className="mt-2 text-check" style={{ color: INK_2 }}>
        {nextStepLabel(level, LEVEL_UNIT, level.nextThreshold === null ? null : level.level + 1)}
      </p>
    </Card>
  );
}

function StreakCard({ progress }: { progress: EngagementProgress }) {
  const { streak } = progress;
  return (
    <Card tint={STREAK_TINT}>
      <div className="flex items-center gap-2">
        <span style={{ color: STREAK_TINT }}>
          <GlyphSvg glyph={PROGRESSION_GLYPHS.fire} size={16} />
        </span>
        <p className="text-title font-bold" style={{ color: INK }}>
          {streakLabel(streak.currentDays)}
        </p>
      </div>
      <p className="mt-1 text-caption" style={{ color: INK_2 }}>
        {streakRecordLabel(streak.longestDays)}
      </p>
      <div className="mt-3">
        <ProgressBar progress={streak.progress} label="Série de jours actifs — vers le prochain jalon" tint={STREAK_TINT} />
      </div>
      <p className="mt-2 text-check" style={{ color: INK_2 }}>
        {nextStepLabel(streak, STREAK_UNIT)}
      </p>
    </Card>
  );
}

function AchievementsSection({ progress }: { progress: EngagementProgress }) {
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
 * LE HÉROS DES MEESHES (#5743) — la première chose qu'on voit sur l'écran.
 *
 * Trois refus, tous délibérés :
 *
 *  - **rien du tout** quand la passerelle ne sert pas le bloc (`meesh`
 *    absent) : un client déployé avant ce lot ne doit pas peindre un solde
 *    inventé ;
 *  - **pas de bouton grisé** — directive porteur : « le bouton pour convertir
 *    quand les points le permettent, sinon pas de bouton ». Un contrôle qui
 *    existe sans effet est un contrôle qui ment (loi 4) ;
 *  - **la barre se mesure sur les points DÉBITABLES**, jamais sur le score
 *    total. Une barre nourrie par le plancher conversationnel promettrait une
 *    Meesh qui n'arriverait jamais.
 *
 * Et quand la frappe est impossible, l'écran DIT pourquoi — le plancher est
 * une promesse (« ce qu'on a bâti en parlant aux autres ne se vend pas »), et
 * une promesse muette ne rassure personne.
 */
function MeeshHero({ meesh, onMint, isMinting }: { meesh: EngagementMeeshProgress; onMint: () => void; isMinting: boolean }) {
  const soldeLabel = meesh.balance === 0 ? 'Aucune Meesh' : meesh.balance === 1 ? '1 Meesh' : `${meesh.balance} Meeshes`;
  return (
    <section aria-labelledby="progression-meesh" className="flex flex-col gap-3 rounded-card px-4 py-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--ios-warning) 12%, transparent)',
        border: '1px solid color-mix(in srgb, var(--ios-warning) 30%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: MEESH_TINT }} aria-hidden="true">
          <GlyphSvg glyph={PROGRESSION_GLYPHS.medal} size={18} />
        </span>
        <h2 id="progression-meesh" className="text-headline font-bold" style={{ color: INK }}>
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
        <button
          type="button"
          onClick={onMint}
          disabled={isMinting}
          aria-busy={isMinting}
          className="min-h-11 rounded-chip px-4 text-body font-semibold disabled:opacity-60"
          style={{ backgroundColor: MEESH_TINT, color: 'var(--color-ios-surface)' }}
        >
          {isMinting ? 'Frappe en cours…' : `Convertir ${meesh.mintCost} points en une Meesh`}
        </button>
      ) : (
        <p className="text-check" style={{ color: INK_2 }}>
          Encore {meesh.missingPoints} points convertibles avant une Meesh.
          {meesh.floorPoints > 0
            ? ` Vos ${meesh.floorPoints} points de conversation comptent dans votre niveau et ne se dépensent jamais.`
            : ''}
        </p>
      )}
    </section>
  );
}

export function ProgressionBody({
  progress,
  onMint,
  isMinting = false,
}: {
  progress: EngagementProgress;
  onMint?: () => void;
  isMinting?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 px-4 py-3">
      {progress.meesh !== undefined ? (
        <MeeshHero meesh={progress.meesh} onMint={onMint ?? (() => {})} isMinting={isMinting} />
      ) : null}

      {progress.isEmpty ? (
        <p
          role="status"
          className="rounded-card px-4 py-3 text-caption"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 10%, transparent)', color: INK }}
        >
          Aucune activité comptée pour l’instant. Envoyez un message, publiez une story… votre premier badge tombe dès la
          première action.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <LevelCard progress={progress} />
        <StreakCard progress={progress} />
      </div>

      <section aria-labelledby="progression-badges" className="flex flex-col gap-4">
        <SectionTitle
          id="progression-badges"
          glyph={PROGRESSION_GLYPHS.medal}
          title="Badges"
          tint={BRAND}
          trailing={`${progress.badgesEarned} / ${progress.badgesTotal}`}
        />
        {axesByFamily(progress.axes).map((group) => (
          <section key={group.family} aria-labelledby={`progression-family-${group.family}`} className="flex flex-col gap-2">
            <h3 id={`progression-family-${group.family}`} className="px-1 text-caption font-semibold" style={{ color: INK_2 }}>
              {FAMILY_LABELS[group.family]}
            </h3>
            <Card tint={BRAND} className="py-1">
              <ul className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)' }}>
                {group.axes.map((axis) => (
                  <AxisRow key={axis.axisKey} axis={axis} />
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </section>

      <AchievementsSection progress={progress} />
    </div>
  );
}

/** Le squelette de démarrage à froid — la FORME de l'écran, jamais un spinner. */
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

export default function ProgressionScreen() {
  const online = useOnline();
  const queryClient = useQueryClient();
  /**
   * L'identifiant d'idempotence est généré UNE fois par intention de frappe,
   * jamais par requête : sinon un retry deviendrait une seconde frappe, ce que
   * cet identifiant est justement là pour empêcher (#5743). Il n'est renouvelé
   * qu'après une frappe RÉUSSIE.
   */
  const requestIdRef = useRef<string>(crypto.randomUUID());

  const mint = useMutation({
    mutationFn: async () => unwrap(await mintMeesh(httpTransport, requestIdRef.current)),
    onSuccess: () => {
      requestIdRef.current = crypto.randomUUID();
      void queryClient.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
    },
  });

  const query = useQuery({
    queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
    queryFn: async ({ signal }) =>
      unwrap(await loadEngagementProgress({ source: apiConfig.source, transport: httpTransport, signal })),
  });

  return (
    /* `pt-safe` sur la racine `h-dvh` : l'encoche haute est portée par le
       CADRE de l'écran, jamais par la coquille (#5604, `safe-area.test.ts`). */
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="list" className="grid size-11 shrink-0 place-items-center rounded-chip" style={{ color: BRAND }} aria-label="Retour">
            <Glyph name="caretLeft" size={22} />
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: INK }}>
            Progression
          </h1>
          <span className="grid size-11 shrink-0 place-items-center" style={{ color: STREAK_TINT }} aria-hidden="true">
            <Glyph name="trophy" size={20} />
          </span>
        </div>
        {online ? null : (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, transparent)', color: INK }}
          >
            <Glyph name="warningCircle" size={11} />
            Hors ligne — progression telle qu’à la dernière ouverture
          </p>
        )}
      </header>

      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        {query.data !== undefined ? (
          <ProgressionBody progress={query.data} onMint={() => mint.mutate()} isMinting={mint.isPending} />
        ) : query.isError ? (
          <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
        ) : (
          <ProgressionSkeleton />
        )}
      </main>
    </div>
  );
}
