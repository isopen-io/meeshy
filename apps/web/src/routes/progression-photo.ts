import { useCallback, useEffect, useRef, useState } from 'react';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
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
}): PhotoMoments {
  const { view } = params;
  const resolveEnv = params.env ?? appPhotoEnv;
  const [offers, setOffers] = useState<readonly PhotoMoment[]>([]);
  const [active, setActive] = useState<PhotoMoment | null>(null);
  const previous = useRef<EngagementWithGame | null>(null);
  const proposed = useRef(new Set<string>());

  useEffect(() => {
    if (view?.game === undefined) return;
    const before = previous.current;
    previous.current = view;
    if (before === null) return;
    const moments = photoMomentsOfTransition(before, view).filter((moment) => !proposed.current.has(moment.id));
    if (moments.length === 0) return;
    for (const moment of moments) proposed.current.add(moment.id);
    void resolveEnv()
      .notebook.list()
      .then((entries) => {
        const known = new Set(entries.map((entry) => entry.momentId));
        const fresh = moments.filter((moment) => !known.has(moment.id));
        if (fresh.length > 0) setOffers((current) => [...current, ...fresh]);
      });
  }, [view, resolveEnv]);

  const start = useCallback((moment: PhotoMoment) => {
    setOffers((current) => current.filter((offer) => offer.id !== moment.id));
    setActive(moment);
  }, []);
  const dismiss = useCallback((momentId: string) => setOffers((current) => current.filter((offer) => offer.id !== momentId)), []);
  const close = useCallback(() => setActive(null), []);

  return { offers, active, start, dismiss, close };
}
