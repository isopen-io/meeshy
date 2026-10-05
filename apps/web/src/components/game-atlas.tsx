import type { GameAtlasBlock, GameVisibility } from '@meeshy/shared/types/game';

import { formatCount, gameText } from '@/lib/view/game-copy';
import { dayLabel, languageName } from '@/lib/view/game-copy-v2';

import { AtlasStamp } from './game/atlas-stamp';
import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GameCard } from './game-surface';
import { GameVisibilityPicker } from './game-visibility-picker';

/**
 * L'ATLAS DES LANGUES (#9388, conception II.8) — le passeport. Chaque langue
 * avec laquelle on a VRAIMENT échangé (un message envoyé ET un reçu avec
 * quelqu'un qui l'écrit) pose un tampon ; les échanges à moitié faits se
 * disent à part (un sens manque), et le reste est « à découvrir ».
 *
 * PRIVÉ PAR DÉFAUT (conformité E-1, E-2) : une langue minoritaire, diasporique
 * ou liturgique peut révéler une origine ou une conviction. L'écran le dit en
 * toutes lettres et porte le choix de qui le voit ; l'Atlas n'entre dans AUCUNE
 * liste ni aucun tri servi à autrui. Ni l'interlocuteur ni la conversation ne
 * sont gardés : seulement la langue, les deux sens et la date.
 *
 * Les noms de langues viennent d'`Intl.DisplayNames` dans la langue de
 * l'interface — jamais un catalogue de deux cents noms écrit à la main.
 */
export type GameAtlasProps = {
  readonly atlas: GameAtlasBlock;
  readonly visibility: GameVisibility['atlas'];
  readonly online: boolean;
  readonly savingVisibility: boolean;
  readonly error?: string | undefined;
  readonly onVisibility: (level: GameVisibility['atlas']) => void;
};

const PLACEHOLDERS = 3;

export function GameAtlas({ atlas, visibility, online, savingVisibility, error, onVisibility }: GameAtlasProps) {
  const remaining = Math.max(0, atlas.total - atlas.stamped);
  const percent = Math.min(100, Math.round((atlas.stamped / Math.max(1, atlas.total)) * 100));

  return (
    <>
      <GameCard id="game-atlas" labelledBy="game-atlas-title" tint={GAME_BRAND}>
        <h2 id="game-atlas-title" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.atlas.title')}
        </h2>
        <p className="text-body font-semibold" style={{ color: GAME_INK }}>
          {gameText('game.atlas.count', { stamped: formatCount(atlas.stamped), total: formatCount(atlas.total) })}
        </p>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={gameText('game.atlas.count', { stamped: formatCount(atlas.stamped), total: formatCount(atlas.total) })}
          className="h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--game-track)' }}
        >
          <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: GAME_BRAND }} />
        </div>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.atlas.intro')}
        </p>
      </GameCard>

      <GameCard id="game-atlas-stamps" labelledBy="game-atlas-stamps-title">
        <h2 id="game-atlas-stamps-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.atlas.stamps')}
        </h2>
        {atlas.stamps.length === 0 ? (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.atlas.empty')}
          </p>
        ) : null}
        <ul className="grid grid-cols-3 gap-3" data-game-atlas-stamps="">
          {atlas.stamps.map((stamp) => (
            <li key={stamp.language} data-game-atlas-language={stamp.language} className="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <AtlasStamp code={stamp.language} size={64} />
              <span className="text-caption font-semibold" style={{ color: GAME_INK }}>
                {languageName(stamp.language)}
              </span>
              <span className="text-check" style={{ color: GAME_INK_2 }}>
                {gameText('game.atlas.stamped_on', { date: dayLabel(stamp.stampedOn) })}
              </span>
            </li>
          ))}
          {remaining === 0
            ? null
            : Array.from({ length: Math.min(PLACEHOLDERS, remaining) }, (_, i) => (
                <li key={`to-discover-${i}`} aria-hidden="true" className="flex flex-col items-center">
                  <AtlasStamp code={null} size={64} />
                </li>
              ))}
        </ul>
        {remaining === 0 ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.atlas.remaining', { remaining: formatCount(remaining) })}
          </p>
        )}
      </GameCard>

      {atlas.pending.length === 0 ? null : (
        <GameCard id="game-atlas-pending" labelledBy="game-atlas-pending-title">
          <h2 id="game-atlas-pending-title" className="text-body font-bold" style={{ color: GAME_INK }}>
            {gameText('game.atlas.pending')}
          </h2>
          <ul className="flex flex-col gap-1">
            {atlas.pending.map((entry) => (
              <li key={entry.language} data-game-atlas-pending={entry.language} className="flex items-center gap-3" style={{ minHeight: 44 }}>
                <AtlasStamp code={null} size={36} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold" style={{ color: GAME_INK }}>
                    {languageName(entry.language)}
                  </span>
                  <span className="text-caption" style={{ color: GAME_INK_2 }}>
                    {entry.sent ? gameText('game.atlas.pending.sent') : gameText('game.atlas.pending.received')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </GameCard>
      )}

      <GameCard id="game-atlas-privacy" labelledBy="game-atlas-privacy-title">
        <h2 id="game-atlas-privacy-title" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.atlas.visibility')}
        </h2>
        <GameVisibilityPicker legend={gameText('game.visibility.field.atlas')} value={visibility} disabled={!online || savingVisibility} onChange={onVisibility} />
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.atlas.privacy')}
        </p>
        {error === undefined ? null : (
          <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
            {error}
          </p>
        )}
        {online ? null : (
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            {gameText('game.offline.action')}
          </p>
        )}
      </GameCard>
    </>
  );
}
