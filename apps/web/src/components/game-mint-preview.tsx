import type { GameMintPreview as MintPreview } from '@meeshy/shared/types/game';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MintStrike } from '@/components/game-mint-strike';
import { mintLevels } from '@/lib/game/ladder';
import { divisionLabel, editionName, formatCount, gameText, pointsLabel, rankName } from '@/lib/view/game-copy';
import { factDetail } from '@/lib/view/game-detail';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard } from './game-surface';
import { GameSpendLine, GameTouch } from './game-touch';

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
 *
 * AVANT le geste, la ligne de dépense (#9705) dit les points en poche, le prix
 * et ce qui restera — ou, frappe impossible, les points À CONVERTIR qui
 * manquent, dits avec leur cible (« pour la Meesh n° 79 », #10540) : la frappe
 * se retranche du score, mais seuls les points à convertir la paient, et le
 * verdict reste celui du serveur (`mint.canMint`).
 */

export type MintCelebration = {
  readonly number: number;
  readonly edition: MeeshEdition;
  /** Incrémenté à chaque frappe confirmée. */
  readonly key: number;
};

export type GameMintPreviewProps = {
  readonly mint: MintPreview;
  /**
   * Les ÉTINCELLES en poche : la frappe s'en retranche, TOUTES sont dépensables (porteur, 2026-10-16 — plus de « points à
   * convertir »). La frappe n'éteint aucun badge et ne fait pas baisser le niveau : rien de cela ne se promet plus.
   */
  readonly held: number;
  readonly online: boolean;
  readonly minting: boolean;
  readonly error?: string | undefined;
  readonly celebration: MintCelebration | null;
  /** Incrémenté à chaque intention de frappe : fait jouer Mee et Meo. */
  readonly strikeKey?: number;
  readonly onMint: () => void;
};

/**
 * Pourquoi la frappe est fermée, quand ce n'est PAS faute d'étincelles (porteur, 2026-10-16) : une DETTE d'étincelles à
 * rembourser (elle se déduit des prochains gains), ou une réserve du trésor que le rang n'ouvre pas encore.
 */
function BlockedLine({ mint }: { readonly mint: MintPreview }) {
  const debt = mint.sparksDebt ?? 0;
  if (mint.blockedBy === 'debt' && debt > 0) {
    return (
      <p role="status" data-game-mint-blocked="debt" className="text-caption font-semibold" style={{ color: GAME_ERROR }}>
        {gameText('game.mint.blocked_by_debt', { debt: formatCount(debt) })}
      </p>
    );
  }
  const lock = mint.locked ?? null;
  if (lock === null) return null;
  const rank = `${rankName(lock.requires.rank)} ${divisionLabel(lock.requires.division5)}`;
  return (
    <p role="status" data-game-mint-blocked="locked" className="text-caption font-semibold" style={{ color: GAME_ERROR }}>
      {gameText('game.mint.locked', { tier: gameText(`game.treasury.${lock.tier}`), rank })}
    </p>
  );
}

/** Le niveau d'après la frappe (#10892) : la poche paie et fait le niveau. Rien quand la frappe n'en fait perdre aucun. */
const levelDrop = (mint: MintPreview): readonly string[] => {
  const { levelBefore, levelAfter, levelsLost } = mintLevels(mint);
  if (levelsLost <= 0) return [];
  return [`${gameText('game.mint.row.level')} ${gameText('game.fmt.from_to', { from: formatCount(levelBefore), to: formatCount(levelAfter) })}`];
};

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
  const { mint, held, online, minting, error, celebration, strikeKey = 0, onMint } = props;
  const impact = [gameText('game.hero.mint_glory', { glory: formatCount(mint.gloryGained) }), ...levelDrop(mint)];

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

      <GameSpendLine
        concept="meesh"
        held={held}
        cost={mint.price}
        spendable={mint.canMint ? mint.price : mint.price - mint.missingPoints}
        format={pointsLabel}
        formatMissing={pointsLabel}
        heldFact="score"
        missing={{ fact: 'mint_missing', line: (missing) => gameText('game.spend.missing.mint', { missing, number: formatCount(mint.number) }) }}
      />

      <BlockedLine mint={mint} />

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
      ) : null}

      {error === undefined || minting ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
    </GameCard>
  );
}
