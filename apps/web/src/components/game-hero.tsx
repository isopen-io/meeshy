import { useEffect, useRef } from 'react';

import type { GameBlock } from '@meeshy/shared/types/game';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';

import { GameBird, LevelRing, MeeshCoin, RankBlason, Signature, useChoreography } from '@/components/game';
import { earnRules, type EarnRule } from '@/lib/game/earn-rules';
import { enamelToken } from '@/lib/game/medal';
import {
  convertiblePointsLabel,
  familyName,
  formatCount,
  gameText,
  levelTierName,
  levelsLabel,
  pointsLabel,
  rankLabel,
  rankName,
} from '@/lib/view/game-copy';
import { levelRingLabelWithPrestige } from '@/lib/view/game-copy-v2';
import { Link } from '@/routes/route-table';

import { GAME_CARD, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameChip } from './game-surface';

/**
 * LE HÉROS DE PROGRESSION (#5841) — pleine largeur, en deuxième position sous
 * l'en-tête. Il répond à trois questions, dans cet ordre :
 *
 *   1. où j'en suis    — l'anneau de niveau (88 pt, l'emblème du palier en
 *                         filigrane), le palier et le record, le blason et sa
 *                         division ;
 *   2. comment je gagne — UNE puce par famille du barème, triée par poids
 *                         (`earnRules`, dérivée de `ENGAGEMENT_AXIS_WEIGHTS` :
 *                         régler un poids change le héros sans toucher une
 *                         chaîne) ; un toucher ouvre le carnet des règles à la
 *                         ligne des gains ;
 *   3. comment je frappe — le prix SERVI par le passerelle (`game.mint`), les
 *                         niveaux perdus, la Gloire, puis le bouton — ou
 *                         « Encore N points », qui reste lisible.
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
  readonly online: boolean;
  readonly minting: boolean;
  readonly mintError?: string | undefined;
  readonly onMint: () => void;
  /** La ligne courte du guide du moment ; `null` ou absente : Mee propose les règles. */
  readonly guideLine?: string | null;
  /** Les gains énumérés ; par défaut, dérivés du barème. Injectable pour les témoins. */
  readonly rules?: readonly EarnRule[];
};

/** Galaxie est un spectre : sa teinte est une des couleurs du prisme. */
const tintOf = (tier: LevelTierKey): string => (tier === 'galaxie' ? 'var(--game-prism-3)' : `var(--game-tier-${tier})`);

const nextRankText = (glory: GameBlock['glory']): string | null =>
  glory.next === null || glory.gloryMissing === null
    ? null
    : gameText('game.rank.next', { missing: formatCount(glory.gloryMissing), rank: rankLabel(glory.next.rank, glory.next.division) });

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollToGuide = (): void => {
  document.getElementById('game-guide')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
};

const BIRD_BUTTON = 'flex min-w-0 flex-1 items-center gap-2 text-start';

function MeeCorner({ line }: { readonly line: string | null }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-caption font-semibold" style={{ color: GAME_INK }}>
        {line ?? gameText('game.hero.mee_idle')}
      </span>
      <span aria-hidden="true" className="shrink-0">
        <GameBird bird="meeGuide" size={56} flip />
      </span>
    </>
  );
  const style = { minHeight: 44 } as const;
  return line === null ? (
    <Link to="progressionRegles" data-game-hero-guide="" className={BIRD_BUTTON} style={style}>
      {body}
    </Link>
  ) : (
    <button type="button" data-game-hero-guide="" data-game-guide-target="game-guide" onClick={scrollToGuide} className={BIRD_BUTTON} style={style}>
      {body}
    </button>
  );
}

function WhereIAm({ game }: { readonly game: GameBlock }) {
  const { level, glory, boosts } = game;
  const ring = useChoreography<HTMLDivElement>();
  const previousLevel = useRef(level.level);
  useEffect(() => {
    if (level.level === previousLevel.current) return;
    ring.play(level.level > previousLevel.current ? 'levelGain' : 'levelLoss');
    previousLevel.current = level.level;
  }, [level.level, ring.play]);

  const blason = useChoreography<HTMLDivElement>();
  const previousRank = useRef(`${glory.rank}/${glory.division ?? 0}`);
  useEffect(() => {
    const now = `${glory.rank}/${glory.division ?? 0}`;
    if (now === previousRank.current) return;
    blason.play('rank');
    previousRank.current = now;
  }, [glory.rank, glory.division, blason.play]);

  const atTop = level.nextThreshold === null;
  const next = nextRankText(glory);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div ref={ring.ref} className="shrink-0">
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
      <div className="flex min-w-40 flex-1 flex-col gap-0.5">
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {levelTierName(level.tier)}
        </p>
        <h2 id="game-hero-title" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.level.title', { level: formatCount(level.level), tier: levelTierName(level.tier) })}
        </h2>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {atTop ? gameText('game.level.top') : gameText('game.level.to_next', { points: pointsLabel(level.pointsToNext), level: formatCount(level.level + 1) })}
        </p>
        {level.record > level.level ? (
          <span className="mt-1 self-start">
            <GameChip tint="var(--color-warn)">
              {gameText('game.level.record', { level: formatCount(level.record) })}
              {boosts.tailwind > 1 ? gameText('game.level.tailwind', { factor: formatCount(boosts.tailwind) }) : ''}
            </GameChip>
          </span>
        ) : null}
      </div>
      <div id="game-rank" className="flex shrink-0 flex-col items-center gap-0.5 text-center">
        <div ref={blason.ref}>
          <RankBlason rank={glory.rank} division={glory.division} size={80} label={rankName(glory.rank)} />
        </div>
        <p className="text-caption font-bold" style={{ color: GAME_INK }}>
          {rankLabel(glory.rank, glory.division)}
        </p>
        <p className="text-check" style={{ color: GAME_INK_2 }}>
          {gameText('game.rank.glory', { glory: formatCount(glory.glory) })}
        </p>
        <p className="max-w-36 text-check" style={{ color: GAME_INK_2 }}>
          {next ?? gameText('game.rank.top')}
        </p>
      </div>
    </div>
  );
}

function HowToEarn({ rules }: { readonly rules: readonly EarnRule[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {gameText('game.hero.earn_title')}
      </h3>
      <ul className="flex flex-wrap gap-1.5" data-game-earn="">
        {rules.map(({ family, points }) => (
          <li key={family}>
            <Link
              to="progressionRegles"
              search={{ regle: '1' }}
              data-game-earn-chip={family}
              aria-label={gameText('game.hero.earn_chip_a11y', { family: familyName(family), points: pointsLabel(points) })}
              className="inline-flex items-center gap-1.5 rounded-chip px-3 text-check font-semibold"
              style={{
                minHeight: 44,
                backgroundColor: `color-mix(in srgb, ${enamelToken(family)} 14%, transparent)`,
                color: GAME_INK,
              }}
            >
              <i aria-hidden="true" className="inline-block size-2 rounded-chip" style={{ backgroundColor: enamelToken(family) }} />
              {gameText('game.hero.earn_chip', { family: familyName(family), points: formatCount(points) })}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowToMint({ game, online, minting, mintError, onMint }: Pick<GameHeroProps, 'game' | 'online' | 'minting' | 'mintError' | 'onMint'>) {
  const { mint } = game;
  const summary = [
    gameText('game.hero.mint_price', { price: pointsLabel(mint.price) }),
    mint.levelsLost > 0 ? gameText('game.hero.mint_cost', { levels: levelsLabel(mint.levelsLost) }) : null,
    gameText('game.hero.mint_glory', { glory: formatCount(mint.gloryGained) }),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <div
      className="flex flex-col gap-2 rounded-card px-3 py-3"
      style={{ backgroundColor: GAME_CARD, border: '1px solid color-mix(in srgb, var(--color-ios-ink) 10%, transparent)' }}
    >
      <div className="flex items-center gap-3">
        <MeeshCoin side="obverse" size={40} edition={mint.edition} />
        <div className="min-w-0 flex-1">
          <h3 className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.hero.mint_title')}
          </h3>
          <p className="text-caption" style={{ color: GAME_INK }}>
            {summary}
          </p>
        </div>
      </div>
      {mint.canMint ? (
        <button
          type="button"
          data-game-hero-mint=""
          disabled={!online || minting}
          aria-busy={minting}
          onClick={onMint}
          className="rounded-chip px-4 text-body font-bold disabled:opacity-80"
          style={{ minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
        >
          {minting ? gameText('game.mint.minting') : gameText('game.mint.action')}
        </button>
      ) : (
        <button
          type="button"
          data-game-hero-missing=""
          aria-disabled="true"
          className="rounded-chip px-4 text-body font-bold"
          style={{ minHeight: 44, color: GAME_INK, border: `1.5px solid ${GAME_WARM}`, backgroundColor: 'transparent', cursor: 'default' }}
        >
          {gameText('game.hero.mint_missing', { missing: convertiblePointsLabel(mint.missingPoints) })}
        </button>
      )}
      {mint.canMint && !online ? (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.mint.offline')}
        </p>
      ) : null}
      {mintError === undefined || minting ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {mintError}
        </p>
      )}
    </div>
  );
}

export function GameHero({ game, online, minting, mintError, onMint, guideLine = null, rules }: GameHeroProps) {
  const tint = tintOf(game.level.tier);
  return (
    <section
      id="game-level"
      data-game-hero={game.level.tier}
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
      <MeeCorner line={guideLine} />
      <WhereIAm game={game} />
      <HowToEarn rules={rules ?? earnRules()} />
      <HowToMint game={game} online={online} minting={minting} mintError={mintError} onMint={onMint} />
    </section>
  );
}

