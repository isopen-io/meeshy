import { useId, useState } from 'react';

import { GameBird } from '@/components/game';
import { guideActionTarget } from '@/lib/game-guide/action-target';
import { guideBirds, type GuideCard } from '@/lib/game-guide/card';

import { GAME_BRAND, GAME_INK, GAME_INK_2, GameCard } from './game-surface';

/**
 * LA CARTE DU GUIDE (#9379) — Mee et Meo parlent dans une carte du jeu, à côté
 * du texte, SANS bulle de conversation (conception, partie IV : « plus aucune
 * bulle »). Chaque intervention suit la même structure : ce qui vient d'arriver
 * → ce que ça veut dire → l'étape d'après → un bouton qui y mène.
 *
 *  - la première fois la carte est COMPLÈTE, ensuite elle tient en UNE ligne ;
 *    « ? » rouvre toujours la version complète ;
 *  - c'est la LOI qui décide du moment, du locuteur et de la présentation
 *    (`chooseGuideMoment`) : la carte reçoit un `GuideCard`, elle ne décide rien ;
 *  - lecteur d'écran : une région nommée lue en entier, les dessins sont
 *    décoratifs ; ce n'est pas un dialogue, elle ne vole pas le focus ;
 *  - les boutons font 44 points, et la carte ne contient rien d'autre qu'un
 *    texte et des gestes : « Plus tard » (ou « Passer » pendant l'intégration)
 *    écarte la carte, « Passer l'intégration » écarte toutes les étapes.
 */

export type GameGuideCardProps = {
  readonly card: GuideCard;
  /** Le bouton qui mène à l'étape d'après. */
  readonly onAction: (card: GuideCard) => void;
  readonly onDismiss: (card: GuideCard) => void;
  /** Pendant l'intégration seulement : écarter toutes les étapes restantes. */
  readonly onSkipAll?: () => void;
  /** Pour les moments qui se photographient : ouvrir l'offre photo. */
  readonly onPhoto?: () => void;
};

const SPEAKER_NAMES = { mee: 'Mee', meo: 'Meo', duo: 'Mee et Meo' } as const;

const BUTTON_STYLE = { minHeight: 44 } as const;

export function GameGuideCard({ card, onAction, onDismiss, onSkipAll, onPhoto }: GameGuideCardProps) {
  const titleId = useId();
  const [reopened, setReopened] = useState(false);
  const expanded = card.presentation === 'full' || reopened;
  const birds = guideBirds(card.speaker, card.mood);
  const isStep = card.step !== undefined;
  const offersPhoto = card.photo && onPhoto !== undefined && guideActionTarget(card.action).kind !== 'photo';

  return (
    <GameCard id="game-guide" labelledBy={titleId} tint={GAME_BRAND}>
      <div data-game-guide={card.key} className="flex flex-col gap-2">
        <div className="flex items-end gap-1">
          {birds.mee === undefined ? null : <GameBird bird={birds.mee} size={card.speaker === 'duo' ? 56 : 72} />}
          <div className="min-w-0 flex-1 pb-1">
            <h2 id={titleId} className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
              {SPEAKER_NAMES[card.speaker]}
              {card.step === undefined ? '' : ` · Étape ${card.step.index} sur ${card.step.total}`}
            </h2>
            <p className="text-body font-bold" style={{ color: GAME_INK }}>
              {expanded ? card.copy.what : card.copy.short}
            </p>
          </div>
          {birds.meo === undefined ? null : <GameBird bird={birds.meo} size={card.speaker === 'duo' ? 56 : 72} flip />}
          {card.presentation === 'short' && !reopened ? (
            <button
              type="button"
              data-game-guide-help=""
              aria-expanded={false}
              aria-label="Voir l’explication complète"
              onClick={() => setReopened(true)}
              className="grid shrink-0 place-items-center rounded-chip px-3 text-body font-bold"
              style={{ ...BUTTON_STYLE, minWidth: 44, color: GAME_BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
            >
              ?
            </button>
          ) : null}
        </div>

        {expanded ? (
          <>
            <p className="text-body" style={{ color: GAME_INK }}>
              {card.copy.means}
            </p>
            <p className="text-body font-semibold" style={{ color: GAME_INK }}>
              {card.copy.next}
            </p>
          </>
        ) : null}
        {card.presentation === 'short' && reopened ? (
          <button
            type="button"
            data-game-guide-help=""
            aria-expanded
            aria-label="Replier l’explication"
            onClick={() => setReopened(false)}
            className="self-start rounded-chip px-3 text-check font-semibold"
            style={{ ...BUTTON_STYLE, color: GAME_BRAND }}
          >
            Replier
          </button>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-game-guide-action=""
            onClick={() => onAction(card)}
            className="rounded-chip px-4 text-body font-bold"
            style={{ ...BUTTON_STYLE, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }}
          >
            {card.copy.action}
          </button>
          {offersPhoto ? (
            <button
              type="button"
              data-game-guide-photo=""
              onClick={onPhoto}
              className="rounded-chip px-3 text-body font-semibold"
              style={{ ...BUTTON_STYLE, color: GAME_BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
            >
              Immortaliser
            </button>
          ) : null}
          <button
            type="button"
            data-game-guide-dismiss=""
            onClick={() => onDismiss(card)}
            className="rounded-chip px-3 text-body font-semibold"
            style={{ ...BUTTON_STYLE, color: GAME_INK_2 }}
          >
            {isStep ? 'Passer' : 'Plus tard'}
          </button>
          {isStep && onSkipAll !== undefined ? (
            <button
              type="button"
              data-game-guide-skip-all=""
              onClick={onSkipAll}
              className="rounded-chip px-3 text-check font-semibold"
              style={{ ...BUTTON_STYLE, color: GAME_INK_2 }}
            >
              Passer l’intégration
            </button>
          ) : null}
        </div>
      </div>
    </GameCard>
  );
}
