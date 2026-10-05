import { useCallback } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { GameGuideCard } from '@/components/game-guide-card';
import { GamePhotoFlow } from '@/components/game-photo-flow';
import { GamePhotoOffer } from '@/components/game-photo-offer';
import type { EngagementWithGame } from '@/lib/api/engagement';
import type { HttpTransport } from '@/lib/api/http';
import { guideActionTarget } from '@/lib/game-guide/action-target';
import type { GuideCard } from '@/lib/game-guide/card';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { photoMomentFromCard, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import { useGameGuide } from '@/routes/progression-guide';
import { GAME_MUTATION_KEY } from '@/routes/progression-game-actions';
import { usePhotoMoments } from '@/routes/progression-photo';
import { href, navigate } from '@/routes/route-table';

/**
 * LE GUIDE ET LES PHOTOS SUR « PROGRESSION » (#9379, #9382) — l'assemblage de
 * ce qui se pose AU-DESSUS des jauges : la carte de Mee et Meo (jamais plus
 * d'UNE), la proposition de photo après une célébration, et le déroulé de la
 * photo quand on l'ouvre.
 *
 * Une proposition de photo ne double pas la carte du guide : quand la carte
 * affichée propose déjà ce moment-là (« Immortaliser »), la proposition se
 * tait. Le bouton d'une carte mène où la loi le dit (`guideActionTarget`) :
 * défiler jusqu'à la carte visée, ouvrir une autre page, ou ouvrir la photo.
 *
 * `env`, `transport`, `navigateTo` et `scrollTo` sont injectables : l'écran
 * passe les vrais, les témoins des doubles.
 */

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const defaultScrollTo = (id: string): void => {
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  });
};

const defaultNavigateTo = (to: 'list' | 'progressionBadges'): void => navigate(href(to));

export function GameLead({
  view,
  env = appPhotoEnv,
  transport,
  navigateTo = defaultNavigateTo,
  scrollTo = defaultScrollTo,
}: {
  readonly view: EngagementWithGame;
  readonly env?: () => PhotoEnv;
  readonly transport?: HttpTransport;
  readonly navigateTo?: (to: 'list' | 'progressionBadges') => void;
  readonly scrollTo?: (id: string) => void;
}) {
  const settled = useIsMutating({ mutationKey: GAME_MUTATION_KEY }) === 0;
  const guide = useGameGuide({ view, settled, ...(transport === undefined ? {} : { transport }) });
  const photo = usePhotoMoments({ view, env, settled });
  const game = view.game;

  const cardMoment = useCallback(
    (card: GuideCard): PhotoMoment | null => {
      if (card.action === 'take-start-photo') return startMoment();
      return game === undefined ? null : photoMomentFromCard(card.key as Parameters<typeof photoMomentFromCard>[0], game);
    },
    [game],
  );

  const act = useCallback(
    (card: GuideCard) => {
      const target = guideActionTarget(card.action);
      /* Une étape qui ATTEND son geste n'est pas consommée par son bouton : il
         y mène, et la carte avance quand le geste a eu lieu (`gesture.ts`). */
      if (card.awaiting !== true) guide.dismiss();
      if (target.kind === 'scroll') scrollTo(target.id);
      else if (target.kind === 'route') navigateTo(target.to);
      else {
        const moment = cardMoment(card);
        if (moment !== null) photo.start(moment);
      }
    },
    [guide, scrollTo, navigateTo, photo, cardMoment],
  );

  const card = guide.card;
  const cardPhoto = card === null || !card.photo ? null : cardMoment(card);
  const offers = photo.offers.filter((offer) => offer.id !== cardPhoto?.id);

  const later = useCallback(
    (moment: PhotoMoment) => {
      photo.dismiss(moment.id);
      void env().notebook.defer(moment);
    },
    [photo, env],
  );

  return (
    <>
      {card === null ? null : (
        <GameGuideCard
          card={card}
          onAction={act}
          onDismiss={guide.dismiss}
          {...(card.step === undefined ? {} : { onSkipAll: guide.skipAll })}
          {...(cardPhoto === null ? {} : { onPhoto: () => photo.start(cardPhoto) })}
        />
      )}
      {offers.map((offer) => (
        <GamePhotoOffer key={offer.id} moment={offer} onStart={photo.start} onLater={later} />
      ))}
      {photo.active === null ? null : <GamePhotoFlow moment={photo.active} env={env()} onClose={photo.close} />}
    </>
  );
}
