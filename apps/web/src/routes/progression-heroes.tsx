import { Glyph, GlyphSvg } from '@/components/glyph';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { ProgressBar } from '@/components/progress-bar';
import {
  ACHIEVEMENT_COPY,
  FAMILY_LABELS,
  generatedAchievementLabel,
  levelTitle,
  scoreLabel,
} from '@/lib/view/progression';
import { meeshMissing } from '@/lib/view/meesh-copy';
import { BRAND, CARD, INK, INK_2, MEESH_TINT, UNLOCKED_TINT } from '@/routes/progression-parts';

import { lastAchievement } from '@meeshy/shared/utils/progression-layout';
import type { EngagementMeeshProgress, EngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { ENGAGEMENT_AXIS_WEIGHTS, engagementAxisFamily } from '@meeshy/shared/types/engagement';
import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';

/**
 * LES HEROS D'AVANT LE JEU (#5838 à #5842), RANGÉS DANS LES FICHES (#9563).
 *
 * Ils composaient la première page ; elle ne porte plus que des cartes de
 * concept. Chacun vit désormais dans la fiche de SON concept : le dernier succès
 * dans « Succès », le barème du niveau dans « Niveau » devant un serveur sans
 * bloc `game`, les familles actives dans « Élans ». Rien n'est réécrit : ce qui
 * était dit l'est toujours, un geste plus loin.
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
          Tenez plusieurs familles en même temps : cela multiplie vos points.
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {familles.map((famille) => (
              <li
                key={famille}
                data-chip=""
                className="max-w-full truncate whitespace-nowrap rounded-chip px-2.5 py-1 text-check font-semibold"
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
              Une famille de plus déclenche le multiplicateur.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * LE ROUET de la frappe — le pendant CSS du `ProgressView` d'iOS.
 *
 * `aria-hidden` : l'état est déjà porté par `aria-busy` sur le bouton. Deux
 * annonces pour un même état n'en font pas un plus clair, elles le répètent.
 * `prefers-reduced-motion` est respecté par `animate-spin` (§ app.css).
 */
function MintSpinner() {
  return (
    <span
      aria-hidden="true"
      data-meesh-mint-spinner
      className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/**
 * LE DÉTAIL DES MEESHES ET LEUR FRAPPE, devant un serveur sans bloc `game`.
 *
 * Il vivait dans le sous-menu de l'entrée d'en-tête (#5839) ; la première page
 * ne porte plus aucun geste (#9563), il est donc RANGÉ dans la fiche des
 * Meeshes : le solde, les dates de frappe, le bouton quand les points le
 * permettent, l'échec dit sous l'action. Avec le bloc `game`, c'est le héros de
 * frappe (`game-mint-preview.tsx`) qui tient cette place.
 */
export function MeeshDetail({
  meesh,
  onMint,
  isMinting,
  mintError,
}: {
  meesh: EngagementMeeshProgress;
  onMint: () => void;
  isMinting: boolean;
  /** L'ÉCHEC de la frappe (#6470). Sans lui, le geste échouait en SILENCE et
   * l'on retouchait — la passerelle rejoue les conflits d'écriture (#6467),
   * mais un échec réseau reste possible. */
  mintError?: string | undefined;
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
              <>
                <button
                  type="button"
                  onClick={onMint}
                  disabled={isMinting}
                  aria-busy={isMinting}
                  data-meesh-mint
                  className="mt-1 flex items-center justify-center gap-2 rounded-chip px-4 text-body font-bold disabled:opacity-80"
                  style={{ minHeight: 44, backgroundColor: MEESH_TINT, color: 'var(--color-on-state)' }}
                >
                  {/* L'ACTIVITÉ SE VOIT, pas seulement se lit (#6470) : le
                      jumeau iOS pose un `ProgressView` à gauche du libellé, et
                      un libellé seul ne distingue pas « en cours » de « figé ».
                      `aria-hidden` parce que `aria-busy` le dit déjà — deux
                      annonces pour un état n'en font pas un plus clair. */}
                  {isMinting ? <MintSpinner /> : null}
                  {isMinting ? 'Frappe en cours…' : `Convertir ${meesh.mintCost} points en une Meesh`}
                </button>

                {/* L'ÉCHEC se lit ICI, sous l'action qu'on peut retenter — et
                    non en haut de l'écran, sous le détail qui le cache. Masqué
                    pendant la frappe : il décrirait alors un état révolu. */}
                {mintError !== undefined && !isMinting ? (
                  <p role="alert" data-meesh-mint-error className="text-caption" style={{ color: 'var(--color-error)' }}>
                    {mintError}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-caption" style={{ color: INK_2 }}>
                {/* Le PLANCHER inaliénable se dit ici, pas ailleurs : sans lui,
                    l'utilisateur compte ses points de conversation dans ce qui
                    manque et ne comprend pas pourquoi le compte ne tombe pas
                    juste. La phrase vient du SITE UNIQUE depuis #6478 — elle
                    vivait en double, donc fausse deux fois. */}
                {meeshMissing(meesh.missingPoints, meesh.floorPoints)}
              </p>
            )}
    </div>
  );
}
