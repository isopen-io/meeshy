import { shownRank } from '@/lib/game/served-rank';
import { useEffect, useState, type ReactNode } from 'react';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import {
  AtlasStamp,
  Chest,
  ConceptMark,
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
import type { EngagementWithGame } from '@/lib/api/engagement';
import { gameText } from '@/lib/view/game-copy';
import { progressPercent } from '@/lib/view/progression';
import type { ElementDetail } from '@/lib/view/game-detail';
import type { ConceptChipView, ConceptView } from '@/lib/view/progression-concepts';
import { Link } from '@/routes/route-table';

import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from './game-surface';
import { GameTouch, PRESS } from './game-touch';

/**
 * LES PIÈCES D'UN CONCEPT DE « PROGRESSION » (#9563) — l'emblème, la chip, la
 * carte de la première page et la table de données. La première page et la
 * fiche les partagent : un concept se reconnaît au même dessin et se lit dans
 * les mêmes mots aux deux endroits.
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
      return <ConceptMark kind="points" size={size} />;
    case 'meesh':
      return <MeeshCoin side="obverse" size={size} edition="silver" />;
    case 'glory':
      return game === undefined ? <SignatureEmblem size={size} tint={GAME_WARM} /> : <RankBlason {...shownRank(game.glory)} level={game.level.level} size={size} />;
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
      return <ConceptMark kind="elans" size={size} />;
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
 *
 * ET ELLE N'ÉLARGIT JAMAIS SA CARTE (amendement n° 3) : `max-w-full` la borne à
 * sa rangée, `truncate` la coupe d'une ellipse en DERNIER recours — un texte
 * agrandi par le système, une valeur que personne n'avait prévue.
 */
export function ConceptChip({ children, tint = 'var(--color-ios-ink-3)', urgent = false }: { readonly children: ReactNode; readonly tint?: string; readonly urgent?: boolean }) {
  return (
    <span
      data-chip=""
      {...(urgent ? { 'data-chip-urgent': '' } : {})}
      className="max-w-full truncate whitespace-nowrap rounded-chip px-2.5 py-1 text-check font-semibold"
      style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: GAME_INK }}
    >
      {children}
    </span>
  );
}

/**
 * Les pastilles d'un concept. Sur la première page elles se LISENT (la carte
 * entière est un lien vers la fiche) ; sur la fiche, `open` en fait des boutons :
 * chacune ouvre les précisions de SA donnée. Le bouton porte la cible de 44 pt,
 * la pastille garde sa taille.
 */
export function ConceptChips({
  chips,
  open,
  urgent = false,
}: {
  readonly chips: readonly ConceptChipView[];
  readonly open?: (chip: ConceptChipView) => ElementDetail | null;
  /** La première pastille demande une action : elle prend la teinte d'attention (#9563, amendement n° 4). */
  readonly urgent?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <span data-chips="" className={`flex min-w-0 max-w-full flex-wrap ${open === undefined ? 'gap-1.5' : 'justify-center gap-x-1.5'}`}>
      {chips.map((chip, index) =>
        open === undefined ? (
          urgent && index === 0 ? (
            <ConceptChip key={chip.text} tint="var(--color-warn)" urgent>
              {chip.text}
            </ConceptChip>
          ) : (
            <ConceptChip key={chip.text}>{chip.text}</ConceptChip>
          )
        ) : (
          <GameTouch key={chip.text} detail={open(chip)} className="inline-flex min-w-0 max-w-full items-center" style={{ minHeight: 44 }}>
            <ConceptChip>{chip.text}</ConceptChip>
          </GameTouch>
        ),
      )}
    </span>
  );
}

/**
 * LA JAUGE D'UN CONCEPT — elle se remplit DEPUIS SA VALEUR PRÉCÉDENTE (#9563,
 * amendement n° 2) : à la première ouverture elle monte de zéro, après un geste
 * elle avance de l'ancienne valeur à la nouvelle, et au retour arrière — même
 * valeur — elle ne rejoue rien. La valeur précédente est gardée par `gaugeKey`
 * le temps de la visite ; `prefers-reduced-motion` la pose sans transition
 * (`[data-game-gauge-fill]`, `styles/game.css`).
 *
 * `role="progressbar"` avec ses trois valeurs, comme `ProgressBar` : la jauge
 * EST une information, et `aria-valuenow` dit la valeur vraie dès le premier
 * rendu, pas celle que l'œil voit monter.
 */
const previousGauge = new Map<string, number>();

export function ConceptGauge({ gaugeKey, progress, label, tint = GAME_BRAND }: { readonly gaugeKey: string; readonly progress: number; readonly label: string; readonly tint?: string }) {
  const percent = progressPercent(progress);
  const [shown, setShown] = useState(() => previousGauge.get(gaugeKey) ?? 0);
  useEffect(() => {
    previousGauge.set(gaugeKey, percent);
    setShown(percent);
  }, [gaugeKey, percent]);
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
      className="block h-1.5 w-full overflow-hidden rounded-chip"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 28%, transparent)' }}
    >
      <span data-game-gauge-fill="" className="block h-full rounded-chip" style={{ width: `${shown}%`, backgroundColor: tint }} />
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

/**
 * La tête d'une carte ou d'une ligne : emblème, nom, valeur, chevron.
 *
 * Le nom et la valeur partagent une rangée qui PASSE À LA LIGNE ENTRE EUX
 * (#9563, amendement n° 3) : « Ligue » et « Améthyste · rang 30 » ne tiennent pas
 * côte à côte à 320 px, et les serrer écrasait le nom lettre à lettre pendant que
 * la valeur se tronquait. Trop longs ensemble, la valeur descend sous le nom,
 * entière ; elle ne se tronque que si elle dépasse la rangée à elle seule.
 */
function Head({ emblem, name, value }: { readonly emblem: ReactNode; readonly name: string; readonly value?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center" aria-hidden="true">
        {emblem}
      </span>
      <span data-concept-head="" className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span data-concept-name="" className="min-w-0 max-w-full break-words text-body font-semibold leading-tight" style={{ color: GAME_INK }}>
          {name}
        </span>
        {value === undefined ? null : (
          <span data-concept-value="" className="min-w-0 max-w-full truncate text-body font-bold" style={{ color: GAME_BRAND }}>
            {value}
          </span>
        )}
      </span>
      <Chevron />
    </span>
  );
}

/**
 * LA CARTE D'UN CONCEPT sur la première page — trois étages, et la carte
 * entière ouvre la fiche : la tête ; les données importantes en chips (et la
 * jauge fine quand il y a une étape suivante) ; à quoi ça sert et comment ça
 * marche, deux lignes au plus chacune — sans libellé visible, la place manque à
 * 320 px : la première phrase est à l'encre, la seconde en retrait, et un
 * lecteur d'écran entend « à quoi ça sert » puis « comment ça marche ». Aucun
 * geste ici : ils vivent dans la fiche. Ce qui demande une action (coffre prêt,
 * Flamme en danger, frappe possible…) est la PREMIÈRE pastille, teintée.
 */
export function ConceptCard({ concept, view }: { readonly concept: ConceptView; readonly view: EngagementWithGame }) {
  return (
    <Link
      to="progressionConcept"
      params={{ concept: concept.key }}
      data-concept-card={concept.key}
      {...(concept.urgent ? { 'data-concept-urgent': '' } : {})}
      className={`${PRESS} flex flex-col gap-2 rounded-card px-4 py-3`}
      style={{ minHeight: 44, backgroundColor: GAME_CARD }}
    >
      <Head emblem={<ConceptEmblem concept={concept.key} view={view} size={36} />} name={concept.name} value={concept.value} />
      <ConceptChips chips={concept.chips} urgent={concept.urgent} />
      {concept.gauge === null ? null : <ConceptGauge gaugeKey={`card:${concept.key}`} progress={concept.gauge} label={`${concept.name} — ${concept.value}`} />}
      <span className="sr-only">{gameText('game.concept.why_label')} :</span>
      <span data-concept-why="" className="line-clamp-2 text-caption" style={{ color: GAME_INK }}>
        {concept.why}
      </span>
      <span className="sr-only">{gameText('game.concept.how_label')} :</span>
      <span data-concept-how="" className="line-clamp-2 text-caption" style={{ color: GAME_INK_2 }}>
        {concept.how}
      </span>
    </Link>
  );
}

type RowTarget =
  | { readonly to: 'progressionCarnet' | 'progressionRegles' | 'progressionReglages' }
  | { readonly to: ConceptView['more'][number]['to'] }
  | { readonly to: 'progressionConcept'; readonly concept: ProgressionConcept };

/** Une ligne de la même forme que la tête d'une carte : le carnet, les règles, les réglages, les sous-pages. */
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
  const className = `${PRESS} flex flex-col rounded-card px-4 py-3`;
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

type FactRow = { readonly label: string; readonly value: string };

/**
 * Les données d'un concept, libellé → valeur : la fiche (« Où j'en suis ») et
 * la modale. Avec `open`, chaque ligne est un bouton qui
 * ouvre les précisions de SA donnée (cible de 44 pt, la ligne entière) ; sans
 * lui (dans la modale elle-même), elle se lit.
 */
export function ConceptFacts<Fact extends FactRow>({ facts, open }: { readonly facts: readonly Fact[]; readonly open?: (fact: Fact) => ElementDetail | null }) {
  if (facts.length === 0) return null;
  const line = 'flex w-full items-baseline justify-between gap-3 py-2';
  const cells = (fact: FactRow) => (
    <>
      <span className="min-w-0 text-caption" style={{ color: GAME_INK_2 }}>
        {fact.label}
      </span>
      <span className="min-w-0 text-end text-caption font-semibold" style={{ color: GAME_INK }}>
        {fact.value}
      </span>
    </>
  );
  return (
    <ul data-concept-facts="" className="flex flex-col">
      {facts.map((fact) => (
        <li key={fact.label} className="border-b last:border-b-0" style={{ borderColor: 'color-mix(in srgb, var(--color-ios-ink) 8%, transparent)' }}>
          {open === undefined ? (
            <span className={line}>{cells(fact)}</span>
          ) : (
            <GameTouch detail={open(fact)} className={`${line} items-center`} style={{ minHeight: 44 }}>
              {cells(fact)}
            </GameTouch>
          )}
        </li>
      ))}
    </ul>
  );
}
