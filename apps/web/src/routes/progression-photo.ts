import { useCallback, useEffect, useRef, useState } from 'react';

import { photoCatchUp, photoOfferFor } from '@meeshy/shared/utils/game/photo-catch-up';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import { catchUpMoments, catchUpStandingOf } from '@/lib/game-photo/catch-up';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { photoMomentsOfTransition, type PhotoMoment } from '@/lib/game-photo/moments';

/**
 * LES PROPOSITIONS DE PHOTO (#9382) — Mee propose APRÈS la célébration, pendant
 * que l'écran est ouvert : la Flamme qui franchit 7 jours, la dixième Meesh, le
 * rang gagné. Trois garde-fous :
 *
 *  - jamais à l'OUVERTURE : un état n'est pas une célébration, et rouvrir
 *    l'écran ne rejoue pas une proposition ;
 *  - jamais deux fois le même moment dans la séance ;
 *  - jamais un moment que le carnet connaît déjà (gardé, ou en attente
 *    d'après un « plus tard ») — le carnet n'est lu qu'à ce moment-là, donc
 *    l'écran ne paie l'ouverture d'IndexedDB que quand une proposition naît.
 *
 * LE RYTHME (#9961, #9962) : une transition ne propose qu'UN moment, le plus
 * marquant (`photoOfferFor`) ; un moment qui saute une étape de sa piste cède
 * la place à l'étape OUVERTE (la Meesh 50 sans la 40 propose la 40) ; et tant
 * qu'une proposition attend un geste, aucune autre ne s'ajoute.
 *
 * Et jamais pendant qu'un geste est EN VOL (`settled` faux) : la lecture
 * montrée est l'optimiste, un geste refusé ne se photographie pas.
 *
 * `start` ouvre le déroulé pour un moment donné — une proposition, la photo de
 * départ (fin de l'intégration), ou le moment qu'une carte du guide vient de
 * dire. L'environnement est résolu à l'usage (`env`) : l'écran passe celui de
 * l'application, les témoins un double.
 */

export type PhotoMoments = {
  /** Les propositions en attente d'un geste. */
  readonly offers: readonly PhotoMoment[];
  /** Le moment dont le déroulé est ouvert. */
  readonly active: PhotoMoment | null;
  readonly start: (moment: PhotoMoment) => void;
  readonly dismiss: (momentId: string) => void;
  readonly close: () => void;
};

export function usePhotoMoments(params: {
  readonly view: EngagementWithGame | undefined;
  readonly env?: () => PhotoEnv;
  readonly settled?: boolean;
}): PhotoMoments {
  const { view } = params;
  const settled = params.settled ?? true;
  const resolveEnv = params.env ?? appPhotoEnv;
  const [offers, setOffers] = useState<readonly PhotoMoment[]>([]);
  const [active, setActive] = useState<PhotoMoment | null>(null);
  const previous = useRef<EngagementWithGame | null>(null);
  const proposed = useRef(new Set<string>());

  useEffect(() => {
    if (view?.game === undefined || !settled) return;
    const before = previous.current;
    previous.current = view;
    if (before === null) return;
    const game = view.game;
    const moments = photoMomentsOfTransition(before, view).filter((moment) => !proposed.current.has(moment.id));
    if (moments.length === 0) return;
    const seen = new Set(proposed.current);
    for (const moment of moments) proposed.current.add(moment.id);
    void resolveEnv()
      .notebook.list()
      .then((entries) => {
        const known = new Set(entries.map((entry) => entry.momentId));
        const kept = entries.filter((entry) => entry.status === 'kept').map((entry) => entry.momentId);
        const standing = catchUpStandingOf(game);
        const offerId = photoOfferFor(moments.map((moment) => moment.id), standing, kept);
        if (offerId === null || known.has(offerId) || seen.has(offerId)) return;
        const offer =
          moments.find((moment) => moment.id === offerId) ??
          catchUpMoments(photoCatchUp(standing, kept)).find((entry) => entry.moment.id === offerId)?.moment;
        if (offer === undefined) return;
        proposed.current.add(offerId);
        setOffers((current) => (current.length > 0 ? current : [offer]));
      });
  }, [view, resolveEnv, settled]);

  const start = useCallback((moment: PhotoMoment) => {
    setOffers((current) => current.filter((offer) => offer.id !== moment.id));
    setActive(moment);
  }, []);
  const dismiss = useCallback((momentId: string) => setOffers((current) => current.filter((offer) => offer.id !== momentId)), []);
  const close = useCallback(() => setActive(null), []);

  return { offers, active, start, dismiss, close };
}
