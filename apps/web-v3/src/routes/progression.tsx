import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { GLYPHS } from '@/components/glyphs';
import { GlassSurface, GlassBack } from '@/components/glass-surface';
import { ProgressBar } from '@/components/progress-bar';
import { httpTransport, unwrap } from '@/lib/api/client';
import { apiConfig } from '@/lib/api/config';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress, mintMeesh } from '@/lib/api/engagement';
import { useOnline } from '@/lib/net/online';
import { Link } from '@/routes/route-table';
import {
  ACHIEVEMENT_COPY,
  FAMILY_LABELS,
  generatedAchievementLabel,
  levelTitle,
  scoreLabel,
  streakLabel,
  streakRecordLabel,
} from '@/lib/view/progression';
import {
  BRAND,
  CARD,
  INK,
  INK_2,
  MEESH_TINT,
  STREAK_TINT,
  UNLOCKED_TINT,
  ProgressionError,
  ProgressionSkeleton,
} from '@/routes/progression-parts';

import { progressionLayout, lastAchievement } from '@meeshy/shared/utils/progression-layout';
import type { ProgressionSection } from '@meeshy/shared/utils/progression-layout';
import type { EngagementProgress, EngagementMeeshProgress } from '@meeshy/shared/utils/engagement-progress';
import { ENGAGEMENT_AXIS_WEIGHTS, engagementAxisFamily } from '@meeshy/shared/types/engagement';
import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';

export { ProgressionError, ProgressionSkeleton };

/**
 * « PROGRESSION » EST UN HUB — trois heros, trois portes (#5838, #5843).
 *
 * L'écran était un défilement unique où badges, défis et succès s'empilaient :
 * on n'y trouvait plus rien, et l'iOS natif empilait les mêmes pièces dans un
 * AUTRE ordre, sans que rien ne rougisse. La séquence est désormais déclarée
 * dans `packages/shared` (`progressionLayout`) et les deux clients l'obéissent.
 *
 * Ce fichier ne décide donc plus de l'ordre : il le PARCOURT. C'est la
 * différence qui empêche la divergence de revenir — un client qui compose sa
 * propre séquence finit toujours par la faire dériver.
 */

const dateCourte = (iso: string): string =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Le libellé du dernier succès, quelle que soit sa provenance. */
function libelleDernierSucces(progress: EngagementProgress): { titre: string; quand: string } | null {
  const dernier = lastAchievement(progress);
  if (dernier === null) return null;

  if (dernier.kind === 'named') {
    const copie = ACHIEVEMENT_COPY[dernier.key as keyof typeof ACHIEVEMENT_COPY];
    return { titre: copie?.title ?? dernier.key, quand: dateCourte(dernier.reachedAt) };
  }

  const entree = (progress.achievementSections ?? [])
    .flatMap((s) => s.entries)
    .find((e) => e.key === dernier.key);
  return {
    titre: entree === undefined ? dernier.key : generatedAchievementLabel(entree.family, entree.tier),
    quand: dateCourte(dernier.reachedAt),
  };
}

/**
 * LE HERO DU DERNIER SUCCÈS — ce qu'on vient de décrocher (#5840).
 *
 * Sur un compte qui n'a rien décroché il ne DISPARAÎT pas : il dit ce qu'on
 * peut viser. Une section qui s'efface au premier lancement rend muet le seul
 * moment où l'utilisateur a besoin qu'on lui parle.
 */
export function LastAchievementHero({ progress }: { progress: EngagementProgress }) {
  const dernier = libelleDernierSucces(progress);

  return (
    <section
      aria-labelledby="progression-dernier"
      className="flex items-center gap-3 rounded-card px-4 py-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${UNLOCKED_TINT} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${UNLOCKED_TINT} 28%, transparent)`,
      }}
    >
      <span
        className="grid size-12 shrink-0 place-items-center rounded-card"
        style={{ backgroundColor: `color-mix(in srgb, ${UNLOCKED_TINT} 22%, transparent)`, color: UNLOCKED_TINT }}
        aria-hidden="true"
      >
        <Glyph name="trophy" size={24} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="progression-dernier" className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
          {dernier === null ? 'Premier succès' : 'Dernier succès'}
        </h2>
        {dernier === null ? (
          <p className="text-body font-bold" style={{ color: INK }}>
            Envoyez un message — le premier tombe tout de suite.
          </p>
        ) : (
          <>
            <p className="truncate text-body font-bold" style={{ color: INK }}>
              {dernier.titre}
            </p>
            <p className="text-caption" style={{ color: INK_2 }}>
              Décroché le {dernier.quand}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * LE HERO DU NIVEAU — pleine largeur, et il ÉNUMÈRE (#5841).
 *
 * Le barème est dérivé de `ENGAGEMENT_AXIS_WEIGHTS`, jamais recopié dans une
 * chaîne : le porteur l'a réglé trois fois le 2026-09-09, et une phrase en dur
 * se serait périmée au premier réglage sans qu'aucun témoin ne rougisse — c'est
 * exactement ce qui est arrivé à la fixture de démonstration (#5762).
 */
export function LevelHero({ progress, mintCost }: { progress: EngagementProgress; mintCost: number | null }) {
  const bareme = (Object.keys(FAMILY_LABELS) as EngagementAxisFamily[])
    .map((famille) => {
      const axe = (Object.keys(ENGAGEMENT_AXIS_WEIGHTS) as (keyof typeof ENGAGEMENT_AXIS_WEIGHTS)[]).find(
        (a) => engagementAxisFamily(a) === famille,
      );
      return axe === undefined ? null : { famille, poids: ENGAGEMENT_AXIS_WEIGHTS[axe] };
    })
    .filter((x): x is { famille: EngagementAxisFamily; poids: number } => x !== null)
    .sort((a, b) => b.poids - a.poids);

  const manque = progress.level.nextThreshold === null ? null : progress.level.nextThreshold - progress.level.value;

  return (
    <section aria-labelledby="progression-niveau" className="flex flex-col gap-3 rounded-card px-4 py-4" style={{ backgroundColor: CARD }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progression-niveau" className="text-large-title font-bold" style={{ color: INK }}>
          {levelTitle(progress.level.level)}
        </h2>
        <p className="text-title font-bold" style={{ color: BRAND }}>
          {scoreLabel(progress.level.value)}
        </p>
      </div>

      <ProgressBar progress={progress.level.progress} tint={BRAND} label="Progression vers le niveau suivant" />

      {manque === null ? null : (
        <p className="text-caption" style={{ color: INK_2 }}>
          Encore {scoreLabel(manque)} avant le niveau {progress.level.level + 1}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)' }}>
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
          Comment gagner des points
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {bareme.map(({ famille, poids }) => (
            <li key={famille} className="text-caption" style={{ color: INK }}>
              {FAMILY_LABELS[famille]} <span style={{ color: BRAND, fontWeight: 700 }}>+{poids}</span>
            </li>
          ))}
        </ul>
        {mintCost === null ? null : (
          <p className="text-caption" style={{ color: INK_2 }}>
            {mintCost} points se convertissent en une Meesh — la monnaie rare de Meeshy.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * LE HERO DES ÉLANS EN COURS (#5842).
 *
 * L'élan était UN facteur global affiché en bannière ; le porteur le veut au
 * pluriel — ce sur quoi on est en train de tenir. Tant que `content.mood`
 * n'existe pas comme axe (#5735), le hero se compose sans lui et l'accueillera
 * sans renumérotation : il lit les familles ACTIVES, jamais une liste écrite.
 *
 * **Les chips servent `elan.activeFamilies` — la fenêtre glissante, jamais
 * `axes.filter(value > 0)` (#5897).** Le score cumulé reste `> 0` pour une
 * famille abandonnée depuis des mois ; les deux nombres divergent alors que
 * la phrase juste en dessous cite `activeFamilyCount`, mesuré sur la MÊME
 * fenêtre que la liste. Un serveur qui ne sert pas encore le champ rend une
 * liste vide : aucune chip plutôt qu'une liste fausse.
 */
export function ElansHero({ progress }: { progress: EngagementProgress }) {
  const elan = progress.elan;
  const familles = elan?.activeFamilies ?? [];

  return (
    <section
      aria-labelledby="progression-elans"
      className="flex flex-col gap-2 rounded-card px-4 py-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${BRAND} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${BRAND} 24%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: BRAND }} aria-hidden="true">
          <GlyphSvg glyph={PROGRESSION_GLYPHS.magicWand} size={18} />
        </span>
        <h2 id="progression-elans" className="flex-1 text-body font-bold" style={{ color: INK }}>
          {elan?.isAccelerated === true ? `Élan ×${elan.factor}` : 'Vos élans'}
        </h2>
      </div>

      {familles.length === 0 ? (
        <p className="text-caption" style={{ color: INK_2 }}>
          Publiez une story, un post, un réel ou lancez une conversation : chaque famille tenue en même temps multiplie
          vos points.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {familles.map((famille) => (
              <li
                key={famille}
                className="rounded-chip px-2.5 py-1 text-check font-semibold"
                style={{ backgroundColor: `color-mix(in srgb, ${BRAND} 16%, transparent)`, color: INK }}
              >
                {FAMILY_LABELS[famille]}
              </li>
            ))}
          </ul>
          {elan?.isAccelerated === true ? (
            <p className="text-caption" style={{ color: INK_2 }}>
              {elan.activeFamilyCount === 1 ? '1 famille active' : `${elan.activeFamilyCount} familles actives`} sur{' '}
              {elan.windowDays} jours{elan.hasStanding ? ', plus votre assise' : ''} — vos prochains gestes rapportent{' '}
              {elan.factor} fois plus.
            </p>
          ) : (
            <p className="text-caption" style={{ color: INK_2 }}>
              Tenez une famille de plus en même temps pour déclencher le multiplicateur.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * LE HERO DE LA FLAMME — la série de jours, seule (directive porteur, #5838).
 *
 * Elle était repliée dans le hero du niveau. Le porteur a tranché : « 1 Hero
 * Niveau, 1 Hero Élan, 1 Hero Flamme » (`packages/shared/utils/progression-layout.ts`,
 * qui déclare désormais le bloc `flamme` séparément) — trois questions
 * distinctes, où j'en suis / ce qui multiplie / ce que je tiens, méritent
 * trois blocs. Miroir de `ProgressionFlammeHero` (iOS, `ProgressionHub.swift`).
 */
export function FlammeHero({ progress }: { progress: EngagementProgress }) {
  return (
    <section
      aria-labelledby="progression-flamme"
      className="flex items-center gap-3 rounded-card px-4 py-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${STREAK_TINT} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${STREAK_TINT} 28%, transparent)`,
      }}
    >
      <span
        className="grid size-12 shrink-0 place-items-center rounded-card"
        style={{ backgroundColor: `color-mix(in srgb, ${STREAK_TINT} 22%, transparent)`, color: STREAK_TINT }}
        aria-hidden="true"
      >
        <GlyphSvg glyph={PROGRESSION_GLYPHS.fire} size={24} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="progression-flamme" className="text-check font-semibold uppercase tracking-wide" style={{ color: INK_2 }}>
          Série
        </h2>
        <p className="text-body font-bold" style={{ color: INK }}>
          {streakLabel(progress.streak.value)}
        </p>
        <p className="text-caption" style={{ color: INK_2 }}>
          {streakRecordLabel(progress.streak.longestDays)}
        </p>
      </div>
    </section>
  );
}

/** Les trois glyphes du jeu d'écran, résolus une fois — `Glyph` ne connaît que le socle. */
const GLYPHE_SECTION = {
  medal: PROGRESSION_GLYPHS.medal,
  star: PROGRESSION_GLYPHS.star,
  trophy: GLYPHS.trophy,
} as const;

const SECTION_META: Record<
  ProgressionSection,
  { titre: string; glyphe: 'medal' | 'star' | 'trophy'; teinte: string; route: 'progressionBadges' | 'progressionDefis' | 'progressionSucces' }
> = {
  badges: { titre: 'Badges', glyphe: 'medal', teinte: BRAND, route: 'progressionBadges' },
  defis: { titre: 'Défis', glyphe: 'star', teinte: STREAK_TINT, route: 'progressionDefis' },
  succes: { titre: 'Succès', glyphe: 'trophy', teinte: UNLOCKED_TINT, route: 'progressionSucces' },
};

/** Le compte que l'entrée annonce — c'est lui qui donne envie d'ouvrir. */
function compteDe(section: ProgressionSection, progress: EngagementProgress): { fait: number; total: number } {
  if (section === 'badges') return { fait: progress.badgesEarned, total: progress.badgesTotal };
  if (section === 'succes') {
    return { fait: progress.achievements.filter((a) => a.unlocked).length, total: progress.achievements.length };
  }
  const sections = progress.achievementSections ?? [];
  return {
    fait: sections.reduce((n, s) => n + s.unlockedCount, 0),
    total: sections.reduce((n, s) => n + s.attainableCount, 0),
  };
}

export function SectionLink({ section, progress }: { section: ProgressionSection; progress: EngagementProgress }) {
  const meta = SECTION_META[section];
  const { fait, total } = compteDe(section, progress);

  return (
    <Link
      to={meta.route}
      className="flex items-center gap-3 rounded-card px-4 py-3"
      style={{ backgroundColor: CARD, minHeight: 44 }}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-chip"
        style={{ backgroundColor: `color-mix(in srgb, ${meta.teinte} 16%, transparent)`, color: meta.teinte }}
        aria-hidden="true"
      >
        <GlyphSvg glyph={GLYPHE_SECTION[meta.glyphe]} size={18} />
      </span>
      <span className="flex-1 text-body font-semibold" style={{ color: INK }}>
        {meta.titre}
      </span>
      <span className="text-body font-bold" style={{ color: meta.teinte }}>
        {fait} / {total}
      </span>
      <span style={{ color: INK_2 }} aria-hidden="true">
        <GlyphSvg glyph={PROGRESSION_GLYPHS.caretRight} size={16} />
      </span>
    </Link>
  );
}

/**
 * L'ENTRÉE MEESH — le solde en haut à droite, le détail en verre (#5839).
 *
 * Elle remplace une coupe qui ne disait rien. Le solde se lit SANS ouvrir : un
 * indicateur qu'il faut toucher pour savoir ce qu'il vaut n'informe pas, il
 * intrigue.
 *
 * Le sous-menu ne propose la frappe QUE si les points la permettent — la
 * directive du porteur est une NÉGATION, et une négation se prouve par un
 * témoin qui cherche l'absence.
 */
function MeeshEntry({
  meesh,
  onMint,
  isMinting,
}: {
  meesh: EngagementMeeshProgress;
  onMint: () => void;
  isMinting: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        aria-label={`${meesh.balance} Meesh — voir le détail`}
        className="flex items-center gap-1.5 rounded-chip px-2.5"
        style={{
          minHeight: 44,
          backgroundColor: `color-mix(in srgb, ${MEESH_TINT} 16%, transparent)`,
          color: MEESH_TINT,
        }}
      >
        <span className="text-body font-bold">{meesh.balance}</span>
        <GlyphSvg glyph={PROGRESSION_GLYPHS.medal} size={20} />
      </button>

      {ouvert ? (
        <GlassSurface prominent role="dialog" aria-label="Détail des Meeshes" className="absolute right-0 top-12 z-20 w-64 p-4">
          <MeeshDetail meesh={meesh} onMint={onMint} isMinting={isMinting} />
        </GlassSurface>
      ) : null}
    </div>
  );
}

/**
 * LE CONTENU du sous-menu, séparé de son bouton.
 *
 * Deux raisons, et la seconde compte plus : l'état d'OUVERTURE est une affaire
 * de bouton, pas de contenu ; et un contenu qui n'existe qu'à l'intérieur d'un
 * `useState` ne se mesure qu'en simulant un clic — ce qui fait tester le geste
 * quand on voulait tester ce qui est DIT.
 */
export function MeeshDetail({
  meesh,
  onMint,
  isMinting,
}: {
  meesh: EngagementMeeshProgress;
  onMint: () => void;
  isMinting: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Les formulations viennent du hero d'origine : « Aucune Meesh » plutôt
          que « 0 Meesh », « Convertir » plutôt que « Frapper ». Une refonte de
          DISPOSITION ne réécrit pas la langue en passant — l'utilisateur
          reconnaît les mots, c'est à ça qu'il sait que c'est la même chose. */}
      <p className="text-title font-bold" style={{ color: INK }}>
        {meesh.balance === 0 ? 'Aucune Meesh' : meesh.balance === 1 ? '1 Meesh' : `${meesh.balance} Meeshes`}
      </p>
      {/* À zéro, la ligne dirait « 0 frappées depuis toujours » juste au-dessus
          de « Aucune frappe pour l'instant » — deux fois la même absence. Le
          natif applique la même garde : c'est la STRUCTURE qui est unifiée, pas
          seulement la disposition. */}
      {meesh.mintedLifetime > 0 ? (
        <p className="text-caption" style={{ color: INK_2 }}>
          {meesh.mintedLifetime === 1 ? '1 frappée depuis toujours' : `${meesh.mintedLifetime} frappées depuis toujours`}
        </p>
      ) : null}

            {meesh.firstMintedAt === null ? (
              <p className="text-caption" style={{ color: INK_2 }}>
                Aucune frappe pour l’instant.
              </p>
            ) : (
              <dl className="flex flex-col gap-1 text-caption" style={{ color: INK_2 }}>
                <div className="flex justify-between gap-2">
                  <dt>Première frappe</dt>
                  <dd style={{ color: INK }}>{dateCourte(meesh.firstMintedAt)}</dd>
                </div>
                {/* Une frappe unique a la même date des deux côtés : la répéter
                    n'apprend rien et fait douter de la seconde ligne. */}
                {meesh.lastMintedAt !== null && meesh.lastMintedAt !== meesh.firstMintedAt ? (
                  <div className="flex justify-between gap-2">
                    <dt>Dernière frappe</dt>
                    <dd style={{ color: INK }}>{dateCourte(meesh.lastMintedAt)}</dd>
                  </div>
                ) : null}
              </dl>
            )}

            {meesh.canMint ? (
              <button
                type="button"
                onClick={onMint}
                disabled={isMinting}
                className="mt-1 rounded-chip px-4 text-body font-bold"
                style={{ minHeight: 44, backgroundColor: MEESH_TINT, color: 'var(--color-ios-surface)' }}
              >
                {isMinting ? 'Frappe en cours…' : `Convertir ${meesh.mintCost} points en une Meesh`}
              </button>
            ) : (
              <p className="text-caption" style={{ color: INK_2 }}>
                Encore {meesh.missingPoints} points convertibles avant une Meesh.
                {/* Le PLANCHER inaliénable se dit ici, pas ailleurs : sans lui,
                    l'utilisateur compte ses points de conversation dans ce qui
                    manque et ne comprend pas pourquoi le compte ne tombe pas
                    juste. */}
                {meesh.floorPoints > 0
                  ? ` Vos ${meesh.floorPoints} points de conversation seront repris en dernier, sans éteindre aucun badge.`
                  : ''}
              </p>
            )}
    </div>
  );
}

/**
 * Le CORPS du hub — il parcourt la séquence partagée, il ne la compose pas.
 *
 * La frappe a quitté ce composant : elle vit dans l'entrée Meesh de l'en-tête
 * (#5839), où le solde se lit sans défiler. Le corps n'a donc plus besoin ni
 * de `onMint` ni de `isMinting` — les garder « au cas où » aurait laissé deux
 * chemins vers la même action, dont un mort.
 */
export function ProgressionBody({ progress }: { progress: EngagementProgress }) {
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {progressionLayout(progress).map((bloc) => {
        if (bloc.kind === 'last-achievement') return <LastAchievementHero key="dernier" progress={progress} />;
        if (bloc.kind === 'level') {
          return <LevelHero key="niveau" progress={progress} mintCost={progress.meesh?.mintCost ?? null} />;
        }
        if (bloc.kind === 'elans') return <ElansHero key="elans" progress={progress} />;
        if (bloc.kind === 'flamme') return <FlammeHero key="flamme" progress={progress} />;
        return <SectionLink key={bloc.section} section={bloc.section} progress={progress} />;
      })}
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

  const meesh = query.data?.meesh;

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="list" className="grid size-11 shrink-0 place-items-center" style={{ color: BRAND }} aria-label="Retour">
            <GlassBack>
              <Glyph name="caretLeft" size={22} />
            </GlassBack>
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: INK }}>
            Progression
          </h1>
          {meesh === undefined ? null : (
            <MeeshEntry meesh={meesh} onMint={() => mint.mutate()} isMinting={mint.isPending} />
          )}
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
          <ProgressionBody progress={query.data} />
        ) : query.isError ? (
          <ProgressionError message={query.error.message} online={online} onRetry={() => void query.refetch()} />
        ) : (
          <ProgressionSkeleton />
        )}
      </main>
    </div>
  );
}
