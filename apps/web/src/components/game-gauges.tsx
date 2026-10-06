import type { GameBlock } from '@meeshy/shared/types/game';

import { Flame, MeeshCoin } from '@/components/game';
import {
  boundedPercent,
  daysLabel,
  flameFormName,
  formatCount,
  gameText,
  meeshCount,
  treasuryName,
} from '@/lib/view/game-copy';

import { GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from './game-surface';

/**
 * LE TRÉSOR ET LA FLAMME (#9383) — les deux jauges qui restent côte à côte sous
 * le héros. Conception, partie I : « un haut niveau, un haut rang et un gros
 * trésor en même temps » — aucune action ne fait monter les trois. Le niveau et
 * le rang ont quitté ces tuiles pour le HÉROS pleine largeur (`game-hero.tsx`,
 * #5841), qui porte leurs ancres `game-level` et `game-rank`.
 *
 * Les dessins sont DÉCORATIFS (`aria-hidden`) : chaque tuile dit en toutes
 * lettres ce qu'elle montre.
 */

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
      <TreasuryTile game={game} />
      <FlameTile game={game} />
    </div>
  );
}
