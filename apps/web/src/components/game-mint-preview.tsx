import type { GameMintPreview as MintPreview } from '@meeshy/shared/types/game';
import { meeshDisplayEdition, meeshEdition, type MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { GameBird } from '@/components/game';
import { MintStrike } from '@/components/game-mint-strike';
import { divisionLabel, editionName, formatCount, gameText, pointsLabel, rankName } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_ON_WARM, GAME_WARM, GameCard } from './game-surface';

/**
 * LE CADRE DE LA FRAPPE (#9537 ; épopée § 5, #11178) — LA section de frappe de Progression, et la seule. Dans la fiche
 * de l'Héritage, il suit la tête (ce que tu gardes) et dit, dans cet ordre :
 *
 *   1. la SCÈNE, sur toute la largeur : Mee, l'enclume, le flan, Meo et son marteau (`MintStrike`) ;
 *   2. « La Meesh n° 92 » ;
 *   3. UNE phrase, où le prix paraît UNE fois : « Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. » ;
 *   4. le bouton « Frapper avec Mee et Meo », avec « +1 000 de gloire » en petit DANS le bouton ;
 *   5. une phrase de Mee, sous l'action.
 *
 * Aucun calcul (ni « Restera », ni niveau d'après, ni prix de base) : il vit dans les règles. Quand la frappe n'est pas
 * possible, aucun bouton grisé (directive du porteur) : ce qu'il manque, ou ce qui la ferme (l'Ombre, un rang). La
 * frappe confirmée par la passerelle retourne la pièce sur son revers numéroté ; le lecteur d'écran entend « Meesh n° 4
 * frappée, argent » (le dessin est décoratif). La phrase nomme l'édition DESSINÉE (`meeshDisplayEdition`, #11483) :
 * « Meesh n° 247 frappée, or » — un texte qui nomme l'édition d'une pièce montrée parle comme le dessin.
 *
 * Chaque chiffre porte son identité (`data-fact`, `data-facts`) : un fait ne paraît qu'une fois par écran.
 */

export type MintCelebration = {
  readonly number: number;
  readonly edition: MeeshEdition;
  /** Incrémenté à chaque frappe confirmée. */
  readonly key: number;
};

export type GameMintPreviewProps = {
  readonly mint: MintPreview;
  /** TA LUMIÈRE (les étincelles en poche) : la frappe en fige une part, toutes sont dépensables (porteur, 2026-10-16). */
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
      <p role="status" data-game-mint-blocked="debt" data-fact="sparks_debt" className="text-caption font-semibold" style={{ color: GAME_ERROR }}>
        {gameText('game.mint.blocked_by_debt', { debt: formatCount(debt) })}
      </p>
    );
  }
  const lock = mint.locked ?? null;
  if (lock === null) return null;
  const rank = `${rankName(lock.requires.rank)} ${divisionLabel(lock.requires.division5)}`;
  return (
    <p role="status" data-game-mint-blocked="locked" data-fact="treasury_locked" className="text-caption font-semibold" style={{ color: GAME_ERROR }}>
      {gameText('game.mint.locked', { tier: gameText(`game.treasury.${lock.tier}`), rank })}
    </p>
  );
}

/**
 * LA PHRASE DE MEE, sous l'action (épopée § 5) : la pièce qui vient, quand elle est d'or ou de prisme ; sinon la
 * prochaine qui le sera ; et, frappe impossible, l'envie d'y revenir.
 */
function meeLine(mint: MintPreview): { readonly text: string; readonly fact: string | null } {
  if (!mint.canMint) return { text: gameText('game.fiche.mint.mee.wait'), fact: null };
  if (mint.edition === 'gold') return { text: gameText('game.fiche.mint.mee.gold'), fact: null };
  if (mint.edition === 'prism') return { text: gameText('game.fiche.mint.mee.prism'), fact: null };
  const special = Math.ceil(mint.number / 100) * 100;
  const key = meeshEdition(special) === 'prism' ? 'game.fiche.mint.mee.next_prism' : 'game.fiche.mint.mee.next_gold';
  return { text: gameText(key, { number: formatCount(special) }), fact: 'mint_next_special' };
}

export function GameMintPreview(props: GameMintPreviewProps) {
  const { mint, held, online, minting, error, celebration, strikeKey = 0, onMint } = props;
  const mee = meeLine(mint);

  return (
    <GameCard id="game-mint" labelledBy="game-mint-title" tint={GAME_WARM}>
      <div data-game-mint-band="" className="grid w-full place-items-center py-1">
        <MintStrike size={112} strikeKey={strikeKey} next={{ number: mint.number, edition: mint.edition }} confirmed={celebration} />
      </div>

      <h2 id="game-mint-title" data-fact="mint_next" className="text-body font-bold" style={{ color: GAME_INK }}>
        {gameText('game.mint.next_title', { number: formatCount(mint.number) })}
      </h2>

      {celebration === null ? null : (
        <p role="status" className="text-body font-bold" style={{ color: GAME_BRAND }}>
          {gameText('game.mint.minted_line', { number: formatCount(celebration.number), edition: editionName(meeshDisplayEdition(celebration.number)) })}
        </p>
      )}

      <p data-game-mint-sentence="" data-facts="mint_price sparks_pocket" className="text-caption" style={{ color: GAME_INK }}>
        {gameText('game.fiche.mint.sentence', { price: pointsLabel(mint.price), held: formatCount(held) })}
      </p>

      {mint.canMint || mint.missingPoints <= 0 ? null : (
        <p data-game-mint-missing="" data-fact="mint_missing" className="text-caption font-semibold" style={{ color: GAME_INK }}>
          {gameText('game.fiche.mint.missing', { missing: formatCount(mint.missingPoints) })}
        </p>
      )}

      <BlockedLine mint={mint} />

      {mint.canMint ? (
        <>
          <button
            type="button"
            data-game-mint-action=""
            disabled={!online || minting}
            aria-busy={minting}
            onClick={onMint}
            className="flex flex-col items-center rounded-chip px-4 py-2 text-body font-bold disabled:opacity-80"
            style={{ minHeight: 44, backgroundColor: GAME_WARM, color: GAME_ON_WARM }}
          >
            <span>{minting ? gameText('game.mint.minting') : gameText('game.mint.action')}</span>
            <span data-fact="mint_glory" className="text-title font-semibold opacity-80">
              {gameText('game.hero.mint_glory', { glory: formatCount(mint.gloryGained) })}
            </span>
          </button>
          {online ? null : (
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {gameText('game.mint.offline')}
            </p>
          )}
        </>
      ) : null}

      <p data-game-mint-mee="" {...(mee.fact === null ? {} : { 'data-fact': mee.fact })} className="flex items-start gap-2 text-caption italic" style={{ color: GAME_INK_2 }}>
        <span aria-hidden="true" className="shrink-0">
          <GameBird bird="meeGuide" size={24} />
        </span>
        <span className="min-w-0">{mee.text}</span>
      </p>

      {error === undefined || minting ? null : (
        <p role="alert" className="text-caption" style={{ color: GAME_ERROR }}>
          {error}
        </p>
      )}
    </GameCard>
  );
}
