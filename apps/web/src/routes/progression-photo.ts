import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { appPhotoAlerts, notebookIds } from '@/lib/game-photo/app-alerts';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoAlerts } from '@/lib/game-photo/alerts';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { photoMomentsOfTransition, type PhotoMoment } from '@/lib/game-photo/moments';

/**
 * LES PROPOSITIONS DE PHOTO SUR PROGRESSION (#9382 ; #10174, L18) — Mee propose APRÈS la célébration, pendant
 * que l'écran est ouvert : la Flamme qui franchit 7 jours, la dixième Meesh, le rang gagné. Depuis L18, ce
 * crochet n'est plus qu'un LECTEUR du coordinateur unique (`lib/game-photo/alerts.ts`) : il lui remet les
 * moments que la transition vient de produire (`celebrate`, nature « geste »), et montre ce qui attend dans la
 * file — qu'il vienne de ce geste ou d'une étape passive trouvée par l'hôte de la bande du haut. Sur
 * Progression, la carte d'offre EST la surface : aucune bannière, aucune feuille ne la double.
 *
 * Ce que la loi garantit, et que les témoins de ce fichier relisent : jamais à l'OUVERTURE (la première lecture
 * pose la ligne de base de l'appareil, sans alerte) ; jamais deux fois le même moment (la situation annoncée
 * avance) ; jamais un moment que le carnet connaît déjà ; UNE proposition à la fois ; l'étape OUVERTE de la
 * piste à la place de celle qui saute ; et jamais pendant qu'un geste est EN VOL (`settled` faux).
 *
 * `start` ouvre le déroulé pour un moment donné — la proposition, la photo de départ (fin de l'intégration), ou
 * le moment qu'une carte du guide vient de dire. `shown` dit que la carte est PEINTE : rythme, pastille et
 * accusé de présentation partent de là, jamais d'une carte repliée.
 */
export type PhotoMoments = {
  /** Les propositions en attente d'un geste. */
  readonly offers: readonly PhotoMoment[];
  /** Le moment dont le déroulé est ouvert. */
  readonly active: PhotoMoment | null;
  readonly start: (moment: PhotoMoment) => void;
  readonly dismiss: (momentId: string) => void;
  readonly close: () => void;
  /** La proposition est à l'écran. */
  readonly shown: () => void;
};

export function usePhotoMoments(params: {
  readonly view: EngagementWithGame | undefined;
  readonly env?: () => PhotoEnv;
  readonly settled?: boolean;
  readonly userId?: string | null;
  /** Le coordinateur : celui de l'application, un double pour les témoins. */
  readonly alerts?: PhotoAlerts;
}): PhotoMoments {
  const { view } = params;
  const settled = params.settled ?? true;
  const resolveEnv = params.env ?? appPhotoEnv;
  const alerts = params.alerts ?? appPhotoAlerts;
  const userId = params.userId ?? 'anonymous';
  const pending = useStore(alerts.store, (state) => state.pending);
  const [active, setActive] = useState<PhotoMoment | null>(null);
  const previous = useRef<EngagementWithGame | null>(null);

  useEffect(() => {
    if (view?.game === undefined || !settled) return;
    const before = previous.current;
    previous.current = view;
    const game = view.game;
    if (before === null) {
      alerts.adopt({ userId, game });
      return;
    }
    const moments = photoMomentsOfTransition(before, view);
    if (moments.length === 0) return;
    void alerts.celebrate({ userId, game, kept: () => notebookIds(resolveEnv().notebook) }, moments);
  }, [view, resolveEnv, settled, userId, alerts]);

  const offers = pending === null ? [] : [pending.propose];

  const start = useCallback(
    (moment: PhotoMoment) => {
      if (alerts.store.getState().pending?.propose.id === moment.id) alerts.consume();
      setActive(moment);
    },
    [alerts],
  );
  const dismiss = useCallback(
    (momentId: string) => {
      if (alerts.store.getState().pending?.propose.id === momentId) alerts.later();
    },
    [alerts],
  );
  const close = useCallback(() => setActive(null), []);
  const shown = useCallback(() => {
    const current = alerts.store.getState().pending;
    if (current !== null) alerts.displayed(current);
  }, [alerts]);

  return { offers, active, start, dismiss, close, shown };
}
