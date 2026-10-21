import type { GameBlock } from '@meeshy/shared/types/game';
import type { TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

import { ConceptMark, MeeshCoin } from '@/components/game';
import { sparksReading } from '@/lib/game/ladder';
import { translateGamePlural } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatCount, gameText, meeshCount, pointsLabel, sparksCumulLine } from '@/lib/view/game-copy';
import { treasuryOpensLine } from '@/lib/view/progression-concepts';

import { GAME_CARD, GAME_ERROR, GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * LA TÊTE DES FICHES DES ÉTINCELLES ET DE L'HÉRITAGE (#11178, épopée § 3.3 et § 5) — chacune répond à UNE question,
 * et son plus gros chiffre y répond : « combien d'étincelles ai-je ? » (ta lumière, la poche) et « qu'est-ce que je
 * garde ? » (les Meeshes de ton Héritage). Un nom en petit au-dessus, le chiffre en grand, puis deux tailles au plus :
 * le contenant suivant, puis le « depuis toujours ». Aucun calcul, aucun prix : le prix vit dans le cadre de la frappe,
 * une fois.
 *
 * Chaque chiffre porte son identité (`data-fact`) : un fait ne paraît qu'une fois par écran.
 */

const HEAD = 'flex flex-col items-center gap-1.5 rounded-card px-4 py-5 text-center';
const LABEL = 'text-check font-semibold uppercase tracking-wide';
const BIG = 'max-w-full break-words text-large-title font-bold leading-tight';

/**
 * TA LUMIÈRE : la poche en grand — jamais le cycle, jamais le total à vie, qui vient dessous en petit. Une Ombre
 * passe AVANT tout : tant qu'elle est là, on ne frappe pas.
 */
export function SparksHead({ level }: { readonly level: GameBlock['level'] }) {
  const sparks = sparksReading(level);
  const cumul = sparksCumulLine(sparks);
  return (
    <section aria-labelledby="fiche-light-label" className={HEAD} style={{ backgroundColor: GAME_CARD }}>
      {sparks.debt > 0 ? (
        <p role="status" data-fiche-shadow="" data-fact="sparks_debt" className="text-caption font-semibold" style={{ color: GAME_ERROR }}>
          {gameText('game.mint.blocked_by_debt', { debt: formatCount(sparks.debt) })}
        </p>
      ) : null}
      <span aria-hidden="true" className="grid place-items-center">
        <ConceptMark kind="points" size={72} />
      </span>
      <p id="fiche-light-label" data-fiche-label="" className={LABEL} style={{ color: GAME_INK_2 }}>
        {gameText('game.fiche.light.label')}
      </p>
      <p data-fiche-head="" data-fact="sparks_pocket" className={BIG} style={{ color: GAME_INK }}>
        {pointsLabel(sparks.pocket)}
      </p>
      {cumul === null ? null : (
        <p data-fact="sparks_lifetime" className="text-caption" style={{ color: GAME_INK_2 }}>
          {cumul}
        </p>
      )}
    </section>
  );
}

export type HeritageHeadProps = {
  readonly balance: number;
  readonly tier: TreasuryTierKey | null;
  readonly next: { readonly key: TreasuryTierKey; readonly minHeld: number } | null;
  /** Les Meeshes frappées depuis toujours ; `null` quand le serveur ne le sert pas. */
  readonly minted: number | null;
};

/** L'HÉRITAGE : le contenant en tête (« Ton Coffret »), les Meeshes gardées en grand, le contenant suivant, les frappées depuis toujours. */
export function HeritageHead({ balance, tier, next, minted }: HeritageHeadProps) {
  return (
    <section aria-labelledby="fiche-heritage-label" className={HEAD} style={{ backgroundColor: GAME_CARD }}>
      <span aria-hidden="true" className="grid place-items-center">
        <MeeshCoin side="obverse" size={72} edition="silver" />
      </span>
      <p id="fiche-heritage-label" data-fiche-label="" {...(tier === null ? {} : { 'data-fact': 'treasury_tier' })} className={LABEL} style={{ color: GAME_INK_2 }}>
        {gameText(`game.fiche.heritage.held.${tier ?? 'none'}`)}
      </p>
      <p data-fiche-head="" data-fact="meesh_held" className={BIG} style={{ color: GAME_INK }}>
        {meeshCount(balance)}
      </p>
      {next === null ? null : (
        <p data-fact="treasury_next" className="text-caption" style={{ color: GAME_INK }}>
          {treasuryOpensLine(next)}
        </p>
      )}
      {minted === null || minted === 0 ? null : (
        <p data-fact="minted" className="text-title" style={{ color: GAME_INK_2 }}>
          {translateGamePlural(currentInterfaceLanguage(), 'game.fiche.heritage.minted', minted)}
        </p>
      )}
    </section>
  );
}
