import { useId } from 'react';

import { GameBird } from '@/components/game';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import { gameText } from '@/lib/view/game-copy';

import { GAME_BRAND, GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * LA PROPOSITION APRÈS LA CÉLÉBRATION (#9382) — conception, partie VI : « après
 * la célébration, Mee propose : On immortalise ? ». Une carte du jeu, sans bulle
 * de conversation : Mee à côté du texte, deux gestes. « Photographier » ouvre
 * le déroulé (selfie, carte seule, plus tard) ; « Plus tard » laisse le moment
 * en attente sept jours dans le carnet — la proposition ne revient pas, elle
 * ne s'impose jamais.
 */

export function GamePhotoOffer({
  moment,
  onStart,
  onLater,
}: {
  readonly moment: PhotoMoment;
  readonly onStart: (moment: PhotoMoment) => void;
  readonly onLater: (moment: PhotoMoment) => void;
}) {
  const titleId = useId();
  return (
    <GameCard labelledBy={titleId} tint={GAME_BRAND}>
      <div data-photo-offer={moment.id} className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <GameBird bird="meeWink" size={64} />
          <div className="min-w-0 flex-1 pb-1">
            <h2 id={titleId} className="text-body font-bold" style={{ color: GAME_INK }}>
              {gameText('game.photo.offer.title')}
            </h2>
            <p className="text-caption" style={{ color: GAME_INK_2 }}>
              {moment.title}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-photo-offer-start=""
            onClick={() => onStart(moment)}
            className="rounded-chip px-4 text-body font-bold"
            style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }}
          >
            {gameText('game.photo.offer.start')}
          </button>
          <button
            type="button"
            data-photo-offer-later=""
            onClick={() => onLater(moment)}
            className="rounded-chip px-3 text-body font-semibold"
            style={{ minHeight: 44, color: GAME_INK_2 }}
          >
            {gameText('game.photo.later')}
          </button>
        </div>
      </div>
    </GameCard>
  );
}
