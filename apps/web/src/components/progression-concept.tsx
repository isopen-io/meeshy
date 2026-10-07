import type { ReactNode } from 'react';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import {
  AtlasStamp,
  Chest,
  Flame,
  GameBadge,
  LeagueGem,
  LevelRing,
  MeeshCoin,
  RankBlason,
  Signature,
  Trophy,
} from '@/components/game';
import { SealMark } from '@/components/game/seal-mark';
import { GlyphSvg } from '@/components/glyph';
import { PROGRESSION_GLYPHS } from '@/components/glyphs-progression';
import { ProgressBar } from '@/components/progress-bar';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { gameText } from '@/lib/view/game-copy';
import type { ConceptFact, ConceptView } from '@/lib/view/progression-concepts';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from './game-surface';

/**
 * LES PIÈCES D'UN CONCEPT DE « PROGRESSION » (#9563) — l'emblème, la chip, la
 * carte de la première page et la table de données. La première page, la fiche
 * et le tableau de bord les partagent : un concept se reconnaît au même dessin
 * et se lit dans les mêmes mots aux trois endroits.
 *
 * L'emblème est un dessin du jeu (anneau, blason, pièce, gemme…) ou, pour les
 * concepts sans dessin propre, la Signature Meeshy dans sa teinte — jamais une
 * bulle. Il est DÉCORATIF : le nom et la valeur disent tout.
 */

function SignatureEmblem({ size, tint }: { readonly size: number; readonly tint: string }) {
  return (
    <span
      className="grid place-items-center rounded-card"
      style={{ width: size, height: size, backgroundColor: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
    >
      <Signature size={Math.round(size * 0.62)} />
    </span>
  );
}

export function ConceptEmblem({ concept, view, size }: { readonly concept: ProgressionConcept; readonly view: EngagementWithGame; readonly size: number }) {
  const game = view.game;
  switch (concept) {
    case 'level':
      return game === undefined ? (
        <SignatureEmblem size={size} tint={GAME_BRAND} />
      ) : (
        <LevelRing level={game.level.level} tier={game.level.tier} progress={game.level.progress} size={size} prestige={game.level.prestige} />
      );
    case 'points':
      return <SignatureEmblem size={size} tint={GAME_BRAND} />;
    case 'meesh':
      return <MeeshCoin side="obverse" size={size} edition="silver" />;
    case 'glory':
      return game === undefined ? <SignatureEmblem size={size} tint={GAME_WARM} /> : <RankBlason rank={game.glory.rank} division={game.glory.division} size={size} />;
    case 'flame': {
      const flame = game?.flame;
      if (flame === undefined) return <Flame form="braise" size={size} out={view.streak.currentDays === 0} />;
      return <Flame form={flame.form ?? 'braise'} size={size} out={flame.status === 'out' || flame.form === null} />;
    }
    case 'missions':
      return <Chest state={game?.chest.status === 'claimed' ? 'open' : 'closed'} size={size} />;
    case 'league':
      return <LeagueGem league={game?.league?.current?.league ?? 'quartz'} size={size} />;
    case 'season':
      return <SealMark owned reached size={size} />;
    case 'prestige':
      return <Trophy kind="prestige" size={size} />;
    case 'elans':
      return <SignatureEmblem size={size} tint={GAME_WARM} />;
    case 'badges':
      return <GameBadge shape="accumulation" size={size} />;
    case 'defis':
      return <GameBadge shape="record" size={size} />;
    case 'succes':
      return <GameBadge shape="collection" size={size} collected={view.achievements.filter((a) => a.unlocked).length} total={view.achievements.length} />;
    case 'showcase':
      return <Trophy kind="league" size={size} material="gold" />;
    case 'atlas':
      return <AtlasStamp code={game?.atlas?.stamps[0]?.language ?? null} size={size} />;
  }
}

/**
 * UNE CHIP NE SE COUPE JAMAIS (#9563) : `whitespace-nowrap` sur la chip,
 * `flex-wrap` sur sa rangée — une rangée trop longue passe à la ligne ENTRE deux
 * chips. Un libellé trop long se raccourcit dans le catalogue.
 */
export function ConceptChip({ children, tint = 'var(--color-ios-ink-3)' }: { readonly children: ReactNode; readonly tint?: string }) {
  return (
    <span
      data-chip=""
      className="inline-flex items-center whitespace-nowrap rounded-chip px-2.5 py-1 text-check font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: GAME_INK }}
    >
      {children}
    </span>
  );
}

export function ConceptChips({ chips }: { readonly chips: readonly string[] }) {
  if (chips.length === 0) return null;
  return (
    <span data-chips="" className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <ConceptChip key={chip}>{chip}</ConceptChip>
      ))}
    </span>
  );
}

function Chevron() {
  return (
    <span className="shrink-0" style={{ color: GAME_INK_2 }} aria-hidden="true">
      <GlyphSvg glyph={PROGRESSION_GLYPHS.caretRight} size={16} className="rtl:-scale-x-100" />
    </span>
  );
}

/** La tête d'une carte ou d'une ligne : emblème, nom, valeur sur UNE ligne, chevron. */
function Head({ emblem, name, value }: { readonly emblem: ReactNode; readonly name: string; readonly value?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center" aria-hidden="true">
        {emblem}
      </span>
      <span data-concept-name="" className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: GAME_INK }}>
        {name}
      </span>
      {value === undefined ? null : (
        <span data-concept-value="" className="max-w-[60%] shrink-0 truncate text-body font-bold" style={{ color: GAME_BRAND }}>
          {value}
        </span>
      )}
      <Chevron />
    </span>
  );
}

/**
 * LA CARTE D'UN CONCEPT sur la première page — trois étages, et la carte
 * entière ouvre la fiche : la tête ; les données importantes en chips (et la
 * jauge fine quand il y a une étape suivante) ; à quoi ça sert et comment ça
 * marche, deux lignes au plus chacune. Aucun geste ici : ils vivent dans la fiche.
 */
export function ConceptCard({ concept, view }: { readonly concept: ConceptView; readonly view: EngagementWithGame }) {
  return (
    <Link
      to="progressionConcept"
      params={{ concept: concept.key }}
      data-concept-card={concept.key}
      className="flex flex-col gap-2 rounded-card px-4 py-3"
      style={{ minHeight: 44, backgroundColor: GAME_CARD }}
    >
      <Head emblem={<ConceptEmblem concept={concept.key} view={view} size={36} />} name={concept.name} value={concept.value} />
      <ConceptChips chips={concept.chips} />
      {concept.gauge === null ? null : <ProgressBar progress={concept.gauge} tint={GAME_BRAND} label={`${concept.name} — ${concept.value}`} />}
      <span data-concept-why="" className="line-clamp-2 text-caption" style={{ color: GAME_INK }}>
        <span className="font-semibold">{gameText('game.concept.why_label')} : </span>
        {concept.why}
      </span>
      <span data-concept-how="" className="line-clamp-2 text-caption" style={{ color: GAME_INK_2 }}>
        <span className="font-semibold">{gameText('game.concept.how_label')} : </span>
        {concept.how}
      </span>
    </Link>
  );
}

type RowTarget =
  | { readonly to: 'progressionTableau' | 'progressionCarnet' | 'progressionRegles' | 'progressionReglages' }
  | { readonly to: ConceptView['more'][number]['to'] }
  | { readonly to: 'progressionConcept'; readonly concept: ProgressionConcept };

/** Une ligne de la même forme que la tête d'une carte : le tableau de bord, le carnet, les règles, les réglages, les sous-pages. */
export function ProgressionRow({
  target,
  emblem,
  name,
  value,
  marker,
}: {
  readonly target: RowTarget;
  readonly emblem: ReactNode;
  readonly name: string;
  readonly value?: string;
  readonly marker: string;
}) {
  const className = 'flex flex-col rounded-card px-4 py-3';
  const style = { minHeight: 44, backgroundColor: GAME_CARD } as const;
  const head = <Head emblem={emblem} name={name} {...(value === undefined ? {} : { value })} />;
  return target.to === 'progressionConcept' ? (
    <Link to="progressionConcept" params={{ concept: target.concept }} data-progression-row={marker} className={className} style={style}>
      {head}
    </Link>
  ) : (
    <Link to={target.to} data-progression-row={marker} className={className} style={style}>
      {head}
    </Link>
  );
}

export function RowEmblem({ tint = GAME_BRAND }: { readonly tint?: string }) {
  return <SignatureEmblem size={36} tint={tint} />;
}

/** Les données d'un concept, libellé → valeur : la fiche (« Où j'en suis ») et le tableau de bord. */
export function ConceptFacts({ facts }: { readonly facts: readonly ConceptFact[] }) {
  if (facts.length === 0) return null;
  return (
    <dl data-concept-facts="" className="flex flex-col">
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0"
          style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink) 8%, transparent)' }}
        >
          <dt className="text-caption" style={{ color: GAME_INK_2 }}>
            {fact.label}
          </dt>
          <dd className="text-end text-caption font-semibold" style={{ color: GAME_INK }}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
