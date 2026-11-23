import { useEffect, useState } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { browserOwnLastPosition, type OwnLastPosition } from '@/lib/shared-locations/own-last-position';
import { EMPTY_ROSTER, rosterOps } from '@/lib/shared-locations/shared-location-roster';
import type { SharedLocationSharingState } from '@/lib/shared-locations/shared-location-sharing';
import { whereCaption, whereStampOf } from '@/lib/shared-locations/where-stamp';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { useMinute } from '@/lib/view/use-minute';

import { ProfileWhereHero } from './profile-where-hero';

export type { OwnLastPosition };

/**
 * **MA DERNIÈRE POSITION CONNUE, SUR MA FICHE** (#20242, iso `ProfileOwnPositionPreview`) — le bloc héros de carte de
 * ma position quand elle PART (au moins une personne la voit) et que le navigateur en connaît une sans rien demander,
 * quel que soit son âge, avec son heure. Sinon rien : jamais une carte vide, jamais une demande de permission depuis
 * une fiche. Le toucher ouvre la carte de mes proches. (Le web n'a pas de mode fantôme : la condition iOS
 * « pas fantôme » n'a rien à lire ici.)
 */
const PIN_SIZE = 18;

export function ProfileOwnPositionHero({
  language,
  name,
  sharing,
  locate = browserOwnLastPosition,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  /** Mon partage en cours ; `null` hors session. */
  readonly sharing: StoreApi<SharedLocationSharingState> | null;
  readonly locate?: () => Promise<OwnLastPosition | null>;
}) {
  const ready = useCirclesCatalog(language);
  const sends = useSharingSends(sharing);
  const [known, setKnown] = useState<OwnLastPosition | null>(null);
  useMinute();
  useEffect(() => {
    if (!sends) return undefined;
    let live = true;
    void locate().then(
      (position) => {
        if (live) setKnown(position);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [sends, locate]);
  if (!ready || !sends || known === null) return null;
  const now = Date.now();
  const caption = whereCaption(language, whereStampOf(new Date(known.at).toISOString(), now), now);
  return (
    <div data-own-position-hero="">
      <ProfileWhereHero
        point={known.fix}
        precision="exact"
        radiusMeters={known.fix.accuracy ?? 0}
        title={name}
        caption={caption}
        label={`${translateCircles(language, 'positions.seeOnMap')}, ${caption}`}
        attribution={translateCircles(language, 'positions.attribution')}
        pin={
          <span
            className="block rounded-full"
            style={{ width: PIN_SIZE, height: PIN_SIZE, backgroundColor: 'var(--color-brand)', border: '3px solid var(--color-ios-on-brand)' }}
          />
        }
        onOpen={() => navigate('/positions')}
      />
    </div>
  );
}

/** Hors session : aucun partage, un magasin immobile. */
const NO_SHARING = createStore<SharedLocationSharingState>(() => ({ roster: EMPTY_ROSTER, busy: false }));

function useSharingSends(sharing: StoreApi<SharedLocationSharingState> | null): boolean {
  return useStore(sharing ?? NO_SHARING, (state) => rosterOps.hasRecipients(state.roster));
}
