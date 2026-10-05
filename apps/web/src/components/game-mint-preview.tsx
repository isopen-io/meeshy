import { useEffect, useState } from 'react';

import type { GameGlory, GameMintPreview as MintPreview, GameTreasury } from '@meeshy/shared/types/game';
import { gloryStanding } from '@meeshy/shared/utils/game/glory';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MintScene } from '@/components/game';
import { convertiblePointsLabel, editionName, formatCount, meeshCount, pointsLabel, rankLabel } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_ERROR, GAME_INK, GAME_INK_2, GAME_WARM, GameCard } from './game-surface';

/**
 * L'APERÇU DE LA FRAPPE (#9383) — conception, partie VII : « la frappe garde
 * son aperçu », enrichi. Tout ce que le geste coûte et rapporte est dit AVANT
 * (prix, niveau avant → après, trésor, Gloire et rang, numéro et édition,
 * badges qui redescendent, Vent arrière) : la frappe fait redescendre, c'est la
 * règle, et une règle qu'on découvre après coup est un piège.
 *
 * Quand la frappe n'est pas possible : aucun bouton grisé (directive du
 * porteur, `EngagementMeeshProgress.canMint`), seulement ce qui manque et le
 * prix de la prochaine. Un aperçu qui promettrait un « avant → après » pour un
 * geste impossible mentirait.
 *
 * La scène (`MintScene`) montre la pièce au repos, face avers ; la frappe
 * confirmée par la passerelle la retourne sur son revers numéroté, et le
 * lecteur d'écran entend « Meesh n° 4 frappée, argent » (le dessin, lui, est
 * décoratif). `badgesLost` est ABSENT quand le serveur ne sert pas de quoi le
 * calculer : « inconnu » ne se dit pas « aucun ».
 */

export type MintCelebration = {
  readonly number: number;
  readonly edition: MeeshEdition;
  /** Incrémenté à chaque frappe confirmée : c'est ce qui rejoue la scène. */
  readonly key: number;
};

export type GameMintPreviewProps = {
  readonly mint: MintPreview;
  readonly glory: GameGlory;
  readonly treasury: GameTreasury;
  readonly levelRecord: number;
  readonly badgesLost?: number | undefined;
  readonly online: boolean;
  readonly minting: boolean;
  readonly error?: string | undefined;
  readonly celebration: MintCelebration | null;
  readonly onMint: () => void;
};

const TAILWIND_PERCENT = 25;

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: GAME_INK_2 }}>{label}</dt>
      <dd className="text-right font-semibold" style={{ color: GAME_INK }}>
        {children}
      </dd>
    </div>
  );
}

const badgesLine = (lost: number): string =>
  lost === 0 ? 'Aucun badge ne s’éteint' : lost === 1 ? '1 badge redescend' : `${lost} badges redescendent`;

function Scene({ mint, celebration }: { readonly mint: MintPreview; readonly celebration: MintCelebration | null }) {
  const [face, setFace] = useState<'obverse' | 'reverse'>('obverse');
  const [playKey, setPlayKey] = useState(0);
  const key = celebration?.key ?? 0;

  useEffect(() => {
    if (key === 0) return;
    setFace('reverse');
    setPlayKey(key);
  }, [key]);

  const shown = celebration ?? { number: mint.number, edition: mint.edition };
  return (
    <MintScene
      size={64}
      face={celebration === null ? 'obverse' : face}
      edition={shown.edition}
      number={shown.number}
      numberLabel={`N° ${shown.number}`}
      playKey={playKey}
    />
  );
}

export function GameMintPreview(props: GameMintPreviewProps) {
  const { mint, glory, treasury, levelRecord, badgesLost, online, minting, error, celebration, onMint } = props;
  const after = gloryStanding({ glory: glory.glory + mint.gloryGained, mythic: glory.rank === 'mythe' });
  const rankChanges = after.rank !== glory.rank || after.division !== glory.division;
  const tailwind = mint.canMint && mint.levelAfter < levelRecord;

  return (
    <GameCard id="game-mint" labelledBy="game-mint-title" tint={GAME_WARM}>
      <div className="flex items-center gap-3">
        <Scene mint={mint} celebration={celebration} />
        <div className="min-w-0">
          <h2 id="game-mint-title" className="text-body font-bold" style={{ color: GAME_INK }}>
            Prochaine Meesh · n° {mint.number}
          </h2>
          <p className="text-caption" style={{ color: GAME_INK_2 }}>
            Édition {editionName(mint.edition)} · {pointsLabel(mint.price)}
          </p>
        </div>
      </div>

      {celebration === null ? null : (
        <p role="status" className="text-body font-bold" style={{ color: GAME_BRAND }}>
          Meesh n° {celebration.number} frappée, {editionName(celebration.edition)}.
        </p>
      )}

      {mint.canMint ? (
        <>
          <dl className="flex flex-col gap-1 text-caption">
            <Row label="Prix">{pointsLabel(mint.price)}</Row>
            <Row label="Niveau">
              {mint.levelBefore} → {mint.levelAfter}
              {mint.levelsLost > 0 ? ` (−${mint.levelsLost})` : ''}
            </Row>
            <Row label="Trésor">
              {treasury.held} → {meeshCount(treasury.held + 1)}
            </Row>
            <Row label="Gloire">
              +{formatCount(mint.gloryGained)}
              {rankChanges ? ` · ${rankLabel(glory.rank, glory.division)} → ${rankLabel(after.rank, after.division)}` : ''}
            </Row>
            {badgesLost === undefined ? null : <Row label="Badges">{badgesLine(badgesLost)}</Row>}
            {tailwind ? (
              <Row label="Vent arrière">
                +{TAILWIND_PERCENT} % sur tes points jusqu’au niveau {levelRecord}
              </Row>
            ) : null}
          </dl>
          <button
            type="button"
            data-game-mint-action=""
            disabled={!online || minting}
            aria-busy={minting}
            onClick={onMint}
            className="mt-1 rounded-chip px-4 text-body font-bold disabled:opacity-80"
            style={{ minHeight: 44, backgroundColor: GAME_WARM, color: 'var(--color-ios-surface)' }}
          >
            {minting ? 'Frappe en cours…' : 'Frapper avec Mee et Meo'}
          </button>
          {online ? null : (
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              Hors ligne : la frappe reprendra avec la connexion.
            </p>
          )}
        </>
      ) : (
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          Encore {convertiblePointsLabel(mint.missingPoints)} avant la prochaine Meesh : elle coûte {pointsLabel(mint.price)}.
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
