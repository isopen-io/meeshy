import { useEffect, useRef } from 'react';

import type { GameBlock } from '@meeshy/shared/types/game';

import { Flame, LevelRing, MeeshCoin, RankBlason, useChoreography } from '@/components/game';
import {
  boundedPercent,
  daysLabel,
  flameFormName,
  formatCount,
  gameText,
  levelTierName,
  meeshCount,
  pointsLabel,
  rankLabel,
  rankName,
  treasuryName,
} from '@/lib/view/game-copy';

import { GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM, GameChip } from './game-surface';

/**
 * LES TROIS JAUGES, ET LA FLAMME (#9383) — l'en-tête de Progression :
 * niveau, rang, trésor, Flamme. Conception, partie I : « un haut niveau, un
 * haut rang et un gros trésor en même temps » — aucune action ne fait monter
 * les trois, c'est pourquoi on les montre côte à côte.
 *
 * Les dessins sont DÉCORATIFS (`aria-hidden`) : chaque tuile dit en toutes
 * lettres ce qu'elle montre. Le niveau qui bouge (une frappe l'a fait
 * redescendre, une mission l'a fait monter) joue sa chorégraphie sur l'anneau ;
 * un rang ou une division nouveaux jouent celle de l'écu. Rien ne se joue au
 * premier rendu : un écran qu'on ouvre ne rejoue pas ce qui est déjà arrivé.
 */

const nextRankText = (glory: GameBlock['glory']): string | null =>
  glory.next === null || glory.gloryMissing === null
    ? null
    : gameText('game.rank.next', { missing: formatCount(glory.gloryMissing), rank: rankLabel(glory.next.rank, glory.next.division) });

function Tile({ id, title, titleId, drawing, children }: { id: string; title: string; titleId: string; drawing: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col items-center gap-2 rounded-card px-3 py-4 text-center"
      style={{ backgroundColor: GAME_CARD }}
    >
      <div className="grid place-items-center" style={{ height: 76 }}>
        {drawing}
      </div>
      <h2 id={titleId} className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function LevelTile({ game }: { readonly game: GameBlock }) {
  const { level, boosts } = game;
  const { ref, play } = useChoreography<HTMLDivElement>();
  const previous = useRef(level.level);
  useEffect(() => {
    if (level.level === previous.current) return;
    play(level.level > previous.current ? 'levelGain' : 'levelLoss');
    previous.current = level.level;
  }, [level.level, play]);

  const atTop = level.nextThreshold === null;
  return (
    <Tile
      id="game-level"
      title={gameText('game.gauge.level')}
      titleId="game-level-title"
      drawing={
        <div ref={ref}>
          <LevelRing level={level.level} tier={level.tier} progress={level.progress} size={72} record={level.record} showTier />
        </div>
      }
    >
      <p className="text-title font-bold" style={{ color: GAME_INK }}>
        {gameText('game.level.title', { level: formatCount(level.level), tier: levelTierName(level.tier) })}
      </p>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {atTop
          ? gameText('game.level.top')
          : gameText('game.level.to_next', { points: pointsLabel(level.pointsToNext), level: formatCount(level.level + 1) })}
      </p>
      {level.record > level.level ? (
        <GameChip tint={GAME_WARM}>
          {gameText('game.level.record', { level: formatCount(level.record) })}
          {boosts.tailwind > 1 ? gameText('game.level.tailwind', { factor: formatCount(boosts.tailwind) }) : ''}
        </GameChip>
      ) : null}
    </Tile>
  );
}

function RankTile({ game }: { readonly game: GameBlock }) {
  const { glory } = game;
  const { ref, play } = useChoreography<HTMLDivElement>();
  const previous = useRef(`${glory.rank}/${glory.division ?? 0}`);
  useEffect(() => {
    const now = `${glory.rank}/${glory.division ?? 0}`;
    if (now === previous.current) return;
    play('rank');
    previous.current = now;
  }, [glory.rank, glory.division, play]);

  const next = nextRankText(glory);
  return (
    <Tile
      id="game-rank"
      title={gameText('game.gauge.rank')}
      titleId="game-rank-title"
      drawing={
        <div ref={ref}>
          <RankBlason rank={glory.rank} division={glory.division} size={80} label={rankName(glory.rank)} />
        </div>
      }
    >
      <p className="text-title font-bold" style={{ color: GAME_INK }}>
        {rankLabel(glory.rank, glory.division)}
      </p>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.rank.glory', { glory: formatCount(glory.glory) })}
      </p>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {next ?? gameText('game.rank.top')}
      </p>
    </Tile>
  );
}

function TreasuryTile({ game }: { readonly game: GameBlock }) {
  const { treasury } = game;
  return (
    <Tile
      id="game-treasury"
      title={gameText('game.gauge.treasury')}
      titleId="game-treasury-title"
      drawing={<MeeshCoin side="obverse" size={64} edition="silver" />}
    >
      <p className="text-title font-bold" style={{ color: GAME_INK }}>
        {meeshCount(treasury.held)}
      </p>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {treasury.tier === null ? gameText('game.treasury.hint') : treasuryName(treasury.tier)}
      </p>
      {treasury.next === null ? null : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.treasury.next', { missing: meeshCount(treasury.next.missing), tier: treasuryName(treasury.next.key) })}
        </p>
      )}
    </Tile>
  );
}

const flameStatusText = (status: GameBlock['flame']['status']): string | null => {
  switch (status) {
    case 'none':
      return gameText('game.flame.status.none');
    case 'lit':
      return null;
    case 'at-risk':
      return gameText('game.flame.status.at_risk');
    case 'covered':
      return gameText('game.flame.status.covered');
    case 'out':
      return gameText('game.flame.status.out');
  }
};

function FlameTile({ game }: { readonly game: GameBlock }) {
  const { flame } = game;
  const out = flame.status === 'out';
  const status = flameStatusText(flame.status);
  return (
    <Tile
      id="game-flame"
      title={gameText('game.gauge.flame')}
      titleId="game-flame-title"
      drawing={<Flame form={flame.form ?? 'braise'} size={64} out={out || flame.form === null} />}
    >
      <p className="text-title font-bold" style={{ color: GAME_INK }}>
        {flame.days === 0 ? gameText('game.flame.no_streak') : daysLabel(flame.days)}
      </p>
      <p className="text-caption" style={{ color: GAME_INK_2 }}>
        {flame.form === null
          ? gameText('game.flame.out_line')
          : gameText('game.flame.form_line', { form: flameFormName(flame.form), bonus: formatCount(boundedPercent(flame.bonusPercent)) })}
      </p>
      {status === null ? null : (
        <p className="text-caption font-semibold" style={{ color: flame.status === 'at-risk' || out ? GAME_WARM : GAME_INK_2 }}>
          {status}
        </p>
      )}
    </Tile>
  );
}

export function GameGauges({ game }: { readonly game: GameBlock }) {
  return (
    <div data-game-gauges className="grid grid-cols-2 gap-3">
      <LevelTile game={game} />
      <RankTile game={game} />
      <TreasuryTile game={game} />
      <FlameTile game={game} />
    </div>
  );
}
