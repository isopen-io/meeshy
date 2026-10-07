import type { GameMintPreview as MintPreview } from '@meeshy/shared/types/game';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MintStrike } from '@/components/game-mint-strike';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { convertiblePointsLabel, editionName, formatCount, gameText, levelsLabel, pointsLabel } from '@/lib/view/game-copy';
import { factDetail } from '@/lib/view/game-detail';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard } from './game-surface';
import { GameTouch } from './game-touch';

/**
 * LE HÉROS DE FRAPPE (#9537) — LA section de frappe de Progression, et la seule
 * (conception, parties VII et XII). Courte : une ligne de titre, un chiffre
 * fort (le prix), une action ; aucun paragraphe. Ce que la frappe coûte et
 * rapporte tient en UNE ligne de puces (« coûte 5 niveaux · +100 Gloire »,
 * « 2 badges redescendent ») : la frappe fait redescendre, c'est la règle, et
 * une règle qu'on découvre après coup est un piège. L'explication détaillée
 * vit dans le carnet des règles.
 *
 * Mee et Meo FRAPPENT sur la scène (`MintStrike`) : le compteur de Meeshes ne
 * monte qu'à la fin du geste. Quand la frappe n'est pas possible : aucun
 * bouton grisé (directive du porteur, `EngagementMeeshProgress.canMint`),
 * seulement ce qu'il manque. La frappe confirmée par la passerelle retourne la
 * pièce sur son revers numéroté ; le lecteur d'écran entend « Meesh n° 4
 * frappée, argent » (le dessin est décoratif). `badgesLost` est ABSENT quand
 * le serveur ne sert pas de quoi le calculer : « inconnu » ne se dit pas
 * « aucun ».
 */

export type MintCelebration = {
  readonly number: number;
  readonly edition: MeeshEdition;
  /** Incrémenté à chaque frappe confirmée. */
  readonly key: number;
};

export type GameMintPreviewProps = {
  readonly mint: MintPreview;
  readonly badgesLost?: number | undefined;
  readonly online: boolean;
  readonly minting: boolean;
  readonly error?: string | undefined;
  readonly celebration: MintCelebration | null;
  /** Incrémenté à chaque intention de frappe : fait jouer Mee et Meo. */
  readonly strikeKey?: number;
  readonly onMint: () => void;
};

const badgesLine = (lost: number): string =>
  lost === 0 ? gameText('game.mint.badges.none') : translateGamePlural(currentInterfaceLanguage(), 'game.mint.badges', lost);

function Chips({ lines }: { readonly lines: readonly string[] }) {
  return (
    <ul data-game-mint-impact="" className="flex flex-wrap gap-1.5">
      {lines.map((line) => (
        <li key={line} data-chip="" className="max-w-full truncate whitespace-nowrap rounded-chip px-2.5 py-1 text-check font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)', color: GAME_INK }}>
          {line}
        </li>
      ))}
    </ul>
  );
}

export function GameMintPreview(props: GameMintPreviewProps) {
  const { mint, badgesLost, online, minting, error, celebration, strikeKey = 0, onMint } = props;
  const impact = [
    mint.levelsLost > 0 ? gameText('game.hero.mint_cost', { levels: levelsLabel(mint.levelsLost) }) : null,
    gameText('game.hero.mint_glory', { glory: formatCount(mint.gloryGained) }),
    badgesLost === undefined || badgesLost === 0 ? null : badgesLine(badgesLost),
  ].filter((line): line is string => line !== null);

  return (
    <GameCard id="game-mint" labelledBy="game-mint-title" tint={GAME_WARM}>
      <div className="flex items-center gap-3">
        <MintStrike size={64} strikeKey={strikeKey} next={{ number: mint.number, edition: mint.edition }} confirmed={celebration} />
        {/* Le prix se touche : pourquoi il monte (#9563). */}
        <GameTouch
          detail={factDetail('meesh', 'mint_price', gameText('game.mint.row.price'), pointsLabel(mint.price))}
          className="flex min-w-0 flex-col justify-center rounded-chip"
          style={{ minHeight: 44 }}
        >
          <h2 id="game-mint-title" className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText('game.mint.next_title', { number: formatCount(mint.number) })}
          </h2>
          <span data-game-mint-price="" className="text-title font-bold" style={{ color: GAME_INK }}>
            {pointsLabel(mint.price)}
          </span>
        </GameTouch>
      </div>

      {celebration === null ? null : (
        <p role="status" className="text-body font-bold" style={{ color: GAME_BRAND }}>
          {gameText('game.mint.minted_line', { number: formatCount(celebration.number), edition: editionName(celebration.edition) })}
        </p>
      )}

      {mint.canMint ? (
        <>
          <Chips lines={impact} />
          <button
            type="button"
            data-game-mint-action=""
            disabled={!online || minting}
            aria-busy={minting}
            onClick={onMint}
            className="rounded-chip px-4 text-body font-bold disabled:opacity-80"
            style={{ minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
          >
            {minting ? gameText('game.mint.minting') : gameText('game.mint.action')}
          </button>
          {online ? null : (
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.mint.offline')}
            </p>
          )}
        </>
      ) : (
        <p data-game-mint-missing="" className="text-body font-bold" style={{ color: GAME_INK }}>
          {gameText('game.hero.mint_missing', { missing: convertiblePointsLabel(mint.missingPoints) })}
        </p>
      )}

      {error === undefined || minting ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
    </GameCard>
  );
}
