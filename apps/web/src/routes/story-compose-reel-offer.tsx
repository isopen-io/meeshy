import { lazy, Suspense, useState, type ReactNode } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublishChoice } from '@/lib/stories/publication-layout';
import { studioOffersReel } from '@/lib/stories/reel-offer';
import type { StudioDraft } from '@/lib/stories/studio';

const REEL: PublishChoice = { kind: 'REEL', layout: null };

const ReelOfferDialog = lazy(() => import('@/components/reel-offer-dialog').then((m) => ({ default: m.ReelOfferDialog })));

/**
 * **LE STUDIO DEMANDE « PUBLIER EN RÉEL ? »** (#8603) — tient les trois faits
 * que la règle et l'envoi lisent, hors de `story-compose.tsx` :
 *  - `formatChosen` : l'auteur a touché le chevron ⇒ plus de question ;
 *  - `open` : le modal est à l'écran ;
 *  - `promoted` : « C'est un Réel » a été choisi ⇒ le texte du post suit le
 *    réel (`studioPublicationContent`), y compris quand l'intention armée
 *    hors ligne repart au retour du réseau.
 *
 * `requestPublish` est ce que presse la capsule : il ouvre le modal dans le
 * seul cas de la règle, et publie sinon.
 */
export function useStudioReelOffer(params: {
  readonly lang: InterfaceLanguage;
  readonly draft: StudioDraft;
  readonly choice: PublishChoice;
  readonly setChoice: (choice: PublishChoice) => void;
  readonly publish: (chosen: PublishChoice, promoted: boolean) => void;
}): {
  readonly promoted: boolean;
  readonly requestPublish: () => void;
  readonly choose: (choice: PublishChoice) => void;
  readonly dialog: ReactNode;
} {
  const [formatChosen, setFormatChosen] = useState(false);
  const [open, setOpen] = useState(false);
  const [promoted, setPromoted] = useState(false);

  const requestPublish = () => {
    if (studioOffersReel({ draft: params.draft, kind: params.choice.kind, formatChosenByAuthor: formatChosen })) {
      setOpen(true);
      return;
    }
    params.publish(params.choice, promoted);
  };

  const choose = (choice: PublishChoice) => {
    setFormatChosen(true);
    setPromoted(false);
    params.setChoice(choice);
  };

  const answer = (chosen: PublishChoice, asReel: boolean) => {
    setOpen(false);
    setFormatChosen(true);
    setPromoted(asReel);
    params.publish(chosen, asReel);
  };

  const dialog = open ? (
    <Suspense fallback={null}>
      <ReelOfferDialog
        lang={params.lang}
        onReel={() => answer(REEL, true)}
        onPost={() => answer(params.choice, false)}
        onCancel={() => setOpen(false)}
      />
    </Suspense>
  ) : null;

  return { promoted, requestPublish, choose, dialog };
}
