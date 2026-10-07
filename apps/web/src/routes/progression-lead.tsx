import { useCallback, useEffect } from 'react';
import { useIsMutating } from '@tanstack/react-query';

import { GameGuideCard } from '@/components/game-guide-card';
import { GamePhotoFlow } from '@/components/game-photo-flow';
import { GamePhotoOffer } from '@/components/game-photo-offer';
import type { EngagementWithGame } from '@/lib/api/engagement';
import type { HttpTransport } from '@/lib/api/http';
import { guideActionTarget, type GuideRoute } from '@/lib/game-guide/action-target';
import type { GuideCard } from '@/lib/game-guide/card';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { photoMomentFromCard, photoMomentOfEmblemV2, startMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import { useGamePrefs } from '@/lib/game/preferences';
import { gameText } from '@/lib/view/game-copy';
import { useViewerId } from '@/routes/game-friends';
import { useGameGuide } from '@/routes/progression-guide';
import { GAME_MUTATION_KEY } from '@/routes/progression-game-actions';
import { usePhotoMoments } from '@/routes/progression-photo';
import { href, navigate } from '@/routes/route-table';

import type { ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

/**
 * LE GUIDE ET LES PHOTOS SUR « PROGRESSION » (#9379, #9382) — l'assemblage de
 * ce qui se pose AU-DESSUS des jauges : la carte de Mee et Meo (jamais plus
 * d'UNE), la proposition de photo après une célébration, et le déroulé de la
 * photo quand on l'ouvre.
 *
 * Une proposition de photo ne double pas la carte du guide : quand la carte
 * affichée propose déjà ce moment-là (« Immortaliser »), la proposition se
 * tait. Le bouton d'une carte mène où la loi le dit (`guideActionTarget`) :
 * ouvrir la fiche du concept visé, ouvrir une autre page, ou ouvrir la photo.
 *
 * REPLIÉ (`collapsed`, #9563) : la première page n'en montre que la ligne courte
 * (`onGuideLine`) ; la carte et les propositions de photo ne se peignent qu'une
 * fois la ligne de Mee touchée. Une photo déjà ouverte, elle, reste ouverte.
 *
 * `env`, `transport`, `navigateTo` et `openConcept` sont injectables : l'écran
 * passe les vrais, les témoins des doubles.
 */

const defaultOpenConcept = (concept: ProgressionConcept): void => navigate(href('progressionConcept', { concept }));

const defaultNavigateTo = (to: GuideRoute): void => navigate(href(to));

export function GameLead({
  view,
  env = appPhotoEnv,
  transport,
  navigateTo = defaultNavigateTo,
  openConcept = defaultOpenConcept,
  onGuideLine,
  collapsed = false,
}: {
  readonly view: EngagementWithGame;
  readonly env?: () => PhotoEnv;
  readonly transport?: HttpTransport;
  readonly navigateTo?: (to: GuideRoute) => void;
  readonly openConcept?: (concept: ProgressionConcept) => void;
  /** La ligne COURTE de la carte affichée (`null` : aucune carte) — Mee la dit sur le coin du héros (#5841). */
  readonly onGuideLine?: (line: string | null) => void;
  /** Replié : ni carte ni proposition de photo, seule la ligne courte est remontée à l'hôte. */
  readonly collapsed?: boolean;
}) {
  const settled = useIsMutating({ mutationKey: GAME_MUTATION_KEY }) === 0;
  const userId = useViewerId();
  /* Les célébrations se règlent par appareil (`lib/game/preferences.ts`) : éteintes, ou le jeu masqué, les crochets ne reçoivent
     aucune lecture — ni carte, ni proposition de photo, et rien n'est marqué « vu » à la place de la personne. */
  const prefs = useGamePrefs();
  const awake = prefs.celebrations && !prefs.hidden;
  const guide = useGameGuide({ view: awake ? view : undefined, settled, userId, ...(transport === undefined ? {} : { transport }) });
  const photo = usePhotoMoments({ view: awake ? view : undefined, env, settled });
  const game = view.game;

  const cardMoment = useCallback(
    (card: GuideCard): PhotoMoment | null => {
      if (card.action === 'take-start-photo') return startMoment();
      /* Un moment de la vague 2 porte l'emblème que la loi nomme (trophée, montée, saison, Prestige). */
      if (card.emblemV2 !== undefined) return photoMomentOfEmblemV2(card.emblemV2);
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
      if (target.kind === 'fiche') openConcept(target.concept);
      else if (target.kind === 'route') navigateTo(target.to);
      else {
        const moment = cardMoment(card);
        if (moment !== null) photo.start(moment);
      }
    },
    [guide, openConcept, navigateTo, photo, cardMoment],
  );

  const card = guide.card;
  const cardPhoto = card === null || !card.photo ? null : cardMoment(card);
  const offers = photo.offers.filter((offer) => offer.id !== cardPhoto?.id);
  /* Sans carte mais avec une photo à proposer, la ligne le dit : sinon la proposition resterait repliée sans que rien ne l'annonce. */
  const shortLine = card !== null ? card.copy.short : offers.length > 0 ? gameText('game.photo.offer.title') : null;
  useEffect(() => {
    onGuideLine?.(shortLine);
  }, [shortLine, onGuideLine]);

  const later = useCallback(
    (moment: PhotoMoment) => {
      photo.dismiss(moment.id);
      void env().notebook.defer(moment);
    },
    [photo, env],
  );

  const flow = photo.active === null ? null : <GamePhotoFlow moment={photo.active} env={env()} flameDays={game?.flame.days ?? null} onClose={photo.close} />;
  if (collapsed) return flow;

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
      {flow}
    </>
  );
}
