import { useEffect, useRef } from 'react';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { EngagementElanProgress } from '@meeshy/shared/utils/engagement-progress';

import { GameBird, LevelRing, RankBlason, Signature, useChoreography } from '@/components/game';
import { earnRules, type EarnRule } from '@/lib/game/earn-rules';
import { levelReading, shownLevelOf } from '@/lib/game/ladder';
import { enamelToken } from '@/lib/game/medal';
import { tierTint } from '@/lib/game/tier-emblem';
import { familyName, formatCount, gameText, levelTierName, levelTopLine, pointsLabel, rankName, standingLabel, shownRank } from '@/lib/view/game-copy';
import { levelHeldLine, levelStepLine } from '@/lib/view/level-step-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';
import { elanDetail, levelStepDetail, rankDetail, ringDetail } from '@/lib/view/game-detail';

import { GAME_CARD, GAME_INK, GAME_INK_2, GameChip } from './game-surface';
import { GameTouch } from './game-touch';

/**
 * LE HÉROS DE PROGRESSION (#5841) — pleine largeur, en deuxième position sous
 * l'en-tête. Il répond à deux questions, dans cet ordre :
 *
 *   1. où j'en suis    — l'anneau de niveau (88 pt, l'emblème du palier en
 *                         filigrane), le palier et le record, le blason et sa
 *                         division ;
 *   2. comment je gagne — UNE puce par famille du barème, triée par poids
 *                         (`earnRules`, dérivée de `ENGAGEMENT_FAMILY_TOP_POINTS` :
 *                         régler un poids change le héros sans toucher une
 *                         chaîne) ; un toucher ouvre le carnet des règles à la
 *                         ligne des gains.
 *
 * La frappe n'est PLUS ici (#9537) : il n'y a qu'UNE section de frappe, le
 * héros de frappe (`game-mint-preview.tsx`). Ce héros-ci est COURT : un titre,
 * un chiffre, des puces ; l'explication détaillée vit dans le carnet des règles.
 *
 * Fond teinté par la couleur du palier (12 %) et grande Signature en filigrane ;
 * Mee se pose sur le coin et dit la ligne courte du guide du moment (un
 * toucher ramène à la carte complète). Le héros ne calcule ni niveau, ni rang,
 * ni prix : il lit le bloc `game`, depuis le cache, sans squelette.
 *
 * Les dessins sont DÉCORATIFS ; le texte dit tout. Le niveau qui bouge joue sa
 * chorégraphie sur l'anneau, un rang ou une division nouveaux celle de l'écu :
 * rien ne se joue au premier rendu.
 */

export type GameHeroProps = {
  readonly game: GameBlock;
  /**
   * La ligne courte du guide du moment ; `null` ou absente : Mee ne se montre
   * pas — le héros vit dans la fiche du Niveau (niveau 2), et son ancien lien
   * vers les règles (autre niveau 2) était un chemin transverse que la carte de
   * navigation retire (#9563, amendement n° 4).
   */
  readonly guideLine?: string | null;
  /** Les gains énumérés ; par défaut, dérivés du barème. Injectable pour les témoins. */
  readonly rules?: readonly EarnRule[];
  /** L'élan servi : la précision d'une famille dit si elle est active ces jours-ci ; absent, elle ne le dit pas. */
  readonly elan?: EngagementElanProgress | undefined;
};


const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollToGuide = (): void => {
  document.getElementById('game-guide')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
};

const BIRD_BUTTON = 'flex min-w-0 flex-1 items-center gap-2 text-start';

function MeeCorner({ line }: { readonly line: string }) {
  return (
    <button type="button" data-game-hero-guide="" data-game-guide-target="game-guide" onClick={scrollToGuide} className={BIRD_BUTTON} style={{ minHeight: 44 }}>
      <span className="min-w-0 flex-1 text-caption font-semibold" style={{ color: GAME_INK }}>
        {line}
      </span>
      <span aria-hidden="true" className="shrink-0">
        <GameBird bird="meeGuide" size={56} flip />
      </span>
    </button>
  );
}

/**
 * L'ÉTAPE du prochain palier (#9706) — faite ou à faire ; elle se touche et ouvre ses précisions, dont la
 * fiche du geste qui la fait. Rien au-delà de 100, ni devant un serveur d'avant les étapes.
 */
function LevelStepChip({ game }: { readonly game: GameBlock }) {
  const step = game.level.ladder?.step ?? null;
  if (step === null) return null;
  return (
    <GameTouch
      detail={levelStepDetail(game, step)}
      marker={{ 'data-game-level-step': step.met ? 'done' : 'todo' }}
      className="flex max-w-full items-center gap-1.5 self-start rounded-card text-caption font-semibold"
      style={{ minHeight: 44, color: GAME_INK }}
    >
      <span aria-hidden="true" style={{ color: step.met ? 'var(--color-success)' : GAME_INK_2 }}>
        {step.met ? '✓' : '○'}
      </span>
      <span className="min-w-0">{levelStepLine(step)}</span>
    </GameTouch>
  );
}

function WhereIAm({ game }: { readonly game: GameBlock }) {
  const { glory, boosts } = game;
  const level = shownLevelOf(game.level);
  const ring = useChoreography<HTMLDivElement>();
  const previousLevel = useRef(level.level);
  useEffect(() => {
    if (level.level === previousLevel.current) return;
    ring.play(level.level > previousLevel.current ? 'levelGain' : 'levelLoss');
    previousLevel.current = level.level;
  }, [level.level, ring.play]);

  const shown = shownRank(glory);
  const blason = useChoreography<HTMLSpanElement>();
  const previousRank = useRef(`${shown.rank}/${shown.division ?? 0}`);
  useEffect(() => {
    const now = `${shown.rank}/${shown.division ?? 0}`;
    if (now === previousRank.current) return;
    blason.play('rank');
    previousRank.current = now;
  }, [shown.rank, shown.division, blason.play]);

  const atTop = level.nextThreshold === null;
  const step = game.level.ladder?.step ?? null;
  const held = game.level.ladder?.held === true && step !== null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <GameTouch detail={ringDetail(game.level)} named className="shrink-0 rounded-full">
      <div ref={ring.ref}>
        <LevelRing
          level={level.level}
          tier={level.tier}
          progress={level.progress}
          size={88}
          record={level.record}
          showTier
          prestige={level.prestige}
          label={levelRingLabelWithPrestige(level.level, level.tier, level.prestige)}
        />
      </div>
      </GameTouch>
      <div className="flex min-w-40 flex-1 flex-col gap-0.5">
        <h2 id="game-hero-title" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.level.title', { level: formatCount(level.level), tier: levelTierName(level.tier) })}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }} {...(held ? { 'data-game-level-held': '' } : {})}>
          {held && step !== null
            ? levelHeldLine(step)
            : atTop
              ? levelTopLine(level)
              : gameText('game.level.to_next', { points: pointsLabel(level.pointsToNext), level: formatCount(level.level + 1) })}
        </p>
        <LevelStepChip game={game} />
        {level.record > level.level ? (
          <span className="mt-1 self-start">
            <GameChip tint="var(--color-warn)">
              {gameText('game.level.record', { level: formatCount(level.record) })}
              {boosts.tailwind > 1 ? gameText('game.level.tailwind', { factor: formatCount(boosts.tailwind) }) : ''}
            </GameChip>
          </span>
        ) : null}
      </div>
      <GameTouch detail={rankDetail(glory, level.level)} className="flex shrink-0 flex-col items-center gap-0.5 rounded-card text-center">
        <span id="game-rank" className="flex flex-col items-center gap-0.5">
          <span ref={blason.ref}>
            <RankBlason rank={shown.rank} division={shown.division} mythic={shown.mythic} level={level.level} size={80} label={rankName(shown.rank)} />
          </span>
          <span className="text-caption font-bold" style={{ color: GAME_INK }}>
            {standingLabel(shown)}
          </span>
          <span className="text-check" style={{ color: GAME_INK_2 }}>
            {gameText('game.rank.glory', { glory: formatCount(glory.glory) })}
          </span>
        </span>
      </GameTouch>
    </div>
  );
}

function HowToEarn({ rules, elan }: { readonly rules: readonly EarnRule[]; readonly elan: EngagementElanProgress | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {gameText('game.hero.earn_title')}
      </h3>
      <ul className="flex flex-wrap gap-x-1.5" data-game-earn="">
        {rules.map(({ family, points }) => (
          <li key={family} className="max-w-full">
            {/* La famille se touche : ce que rapporte un geste, et si elle est active ces jours-ci (#9563). */}
            <GameTouch
              detail={elanDetail(family, elan)}
              marker={{ 'data-game-earn-chip': family }}
              className="inline-flex max-w-full items-center"
              style={{ minHeight: 44 }}
            >
              <span
                data-chip=""
                className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-chip px-3 py-1.5 text-check font-semibold"
                style={{ backgroundColor: `color-mix(in srgb, ${enamelToken(family)} 14%, transparent)`, color: GAME_INK }}
              >
                <i aria-hidden="true" className="inline-block size-2 shrink-0 rounded-chip" style={{ backgroundColor: enamelToken(family) }} />
                <span className="truncate">{gameText('game.hero.earn_chip', { family: familyName(family), points: formatCount(points) })}</span>
              </span>
            </GameTouch>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GameHero({ game, guideLine = null, rules, elan }: GameHeroProps) {
  const tier = levelReading(game.level).tier;
  const tint = tierTint(tier);
  return (
    <section
      id="game-level"
      data-game-hero={tier}
      aria-labelledby="game-hero-title"
      className="relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-card px-4 py-4"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${tint} 12%, ${GAME_CARD}), ${GAME_CARD} 60%)`,
        border: `1px solid color-mix(in srgb, ${tint} 24%, transparent)`,
      }}
    >
      <span aria-hidden="true" data-game-hero-watermark="" className="pointer-events-none absolute -end-10 -top-8 opacity-[0.07]">
        <Signature size={260} color="var(--color-ios-ink)" />
      </span>
      {guideLine === null ? null : <MeeCorner line={guideLine} />}
      <WhereIAm game={game} />
      <HowToEarn rules={rules ?? earnRules()} elan={elan} />
    </section>
  );
}

