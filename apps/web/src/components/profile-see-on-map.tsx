import { useQuery } from '@tanstack/react-query';
import { memo, useEffect } from 'react';
import { useStore } from 'zustand/react';
import type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { MeeshyAvatarMorph, useMeeshyAvatarMorph } from '@/components/kit/meeshy-avatar-morph';
import { Avatar } from '@/components/avatar';
import { ProfileWhereHero } from '@/components/profile-where-hero';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sharedLocationsQueryOptions, type SharedLocationDeps } from '@/lib/api/shared-locations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { preload } from '@/routes/route-table';
import { positionCardOf, remainingWords } from '@/lib/shared-locations/position-card';
import { sharedLocationsStore, type SharedLocationsStoreApi } from '@/lib/shared-locations/shared-locations-live';
import { SHARED_LOCATIONS_WORLD, useSharedLocationsUpkeep } from '@/lib/shared-locations/use-shared-locations-upkeep';
import { whereCaption, whereStampOf } from '@/lib/shared-locations/where-stamp';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { initialsOf } from '@/lib/view/conversation';
import { useMinute } from '@/lib/view/use-minute';

/**
 * **« VOIR SUR LA CARTE », UNE ACTION DE LA FICHE** (#18881) — elle n'existe que si la personne me partage
 * SA position en ce moment (le magasin des positions servies, jamais une supposition), et dit en une ligne
 * ce que la carte montrera : la précision que son cercle ouvre et le temps qui reste.
 *
 * L'avatar de la rangée est le premier emplacement du voyage (K29) : le geste ouvre la carte posée sur elle
 * et l'avatar y devient son épingle. Sans portée de voyage (un témoin, un navigateur sans transition de
 * vue), la carte s'ouvre sans le voyage : le geste ne dépend jamais de lui.
 *
 * LA FICHE TIENT LE MAGASIN À JOUR ELLE-MÊME (revue #18881) : rien ne le nourrit hors de la carte. Sans cela,
 * une fiche ouverte à froid ne montrait jamais la rangée, et un partage arrêté pendant que la carte était
 * fermée y restait offert. Elle rattrape donc le MONDE (la même requête que la première de la carte, qui la
 * retrouve en cache), écoute le direct, retire ce qui arrive à terme et relit le temps restant à la minute.
 * Quand la rangée paraît, l'écran de la carte se charge : le voyage de l'avatar trouve son épingle à l'arrivée.
 *
 * UN BLOC HÉROS DE CARTE (#20242, iso `ProfileWhereHero` / `ProfileLiveSource`) : la rangée de texte ne montrait
 * aucune carte et ne disait pas DE QUAND datait la position. Elle devient la carte pleine largeur centrée sur la
 * dernière position SERVIE, l'avatar en épingle, « Dernière position · il y a 7 min » sur le voile. La lecture était
 * déjà vivante sur le web (abonnement au magasin + rattrapage du monde à l'ouverture) : la cause iOS — une lecture
 * figée au premier rendu — n'y existait pas.
 */
export const MAP_PERSON_PARAM = 'person';

export const mapHrefOf = (personId: string): string => `/positions?${MAP_PERSON_PARAM}=${encodeURIComponent(personId)}`;

const warmMap = (): void => void preload('sharedLocations').catch(() => undefined);

export const ProfileSeeOnMapRow = memo(function ProfileSeeOnMapRow({
  language,
  personId,
  name,
  avatar,
  accent,
  presence,
  store = sharedLocationsStore,
  deps = apiDeps,
  watch = watchRealtime,
  warm = warmMap,
  now = Date.now,
}: {
  readonly language: InterfaceLanguage;
  readonly personId: string;
  readonly name: string;
  readonly avatar: string | null | undefined;
  readonly accent: string;
  /** Servie par la fiche ou absente : jamais déduite d'ici. */
  readonly presence?: UserPresenceStatus | undefined;
  readonly store?: SharedLocationsStoreApi;
  readonly deps?: SharedLocationDeps;
  readonly watch?: WatchRealtime;
  /** Charge l'écran de la carte sans l'ouvrir. */
  readonly warm?: () => void;
  readonly now?: () => number;
}) {
  const ready = useCirclesCatalog(language);
  useSharedLocationsUpkeep({ store, watch });
  const caught = useQuery({ ...sharedLocationsQueryOptions(deps, SHARED_LOCATIONS_WORLD), staleTime: 15_000 }, appQueryClient);
  useEffect(() => {
    if (caught.data === undefined) return;
    store.getState().merge(caught.data.items, { bbox: caught.data.bbox, requestedAt: caught.data.requestedAt });
  }, [caught.data, store]);
  useMinute();
  const location = useStore(store, (state) => state.byUser[personId]);
  const morph = useMeeshyAvatarMorph();
  const card = location === undefined ? null : positionCardOf({ location, now: now() });
  const shown = ready && card !== null;
  useEffect(() => {
    if (shown) warm();
  }, [shown, warm]);
  if (!ready || card === null || location === undefined) return null;
  const at = now();
  const precision = translateCircles(language, `positions.card.${card.precision}`);
  const remaining = translateCircles(language, 'positions.card.remaining', { time: remainingWords(language, card.remainingMinutes) });
  const caption = whereCaption(language, whereStampOf(location.updatedAt, at), at);
  return (
    <div data-see-on-map={personId}>
      <ProfileWhereHero
        point={location}
        precision={location.precision}
        radiusMeters={location.radiusMeters}
        title={name}
        caption={caption}
        detail={`${precision} · ${remaining}`}
        label={`${translateCircles(language, 'positions.seeOnMap.a11y', { name })}, ${caption}`}
        attribution={translateCircles(language, 'positions.attribution')}
        pin={
          <MeeshyAvatarMorph id={personId} size={40}>
            <Avatar initials={initialsOf(name)} color={accent} size={40} name={name} redundant {...(presence === undefined ? {} : { presence })} {...(avatar == null ? {} : { src: avatar })} />
          </MeeshyAvatarMorph>
        }
        onOpen={() => void morph.travel(personId, () => navigate(mapHrefOf(personId)))}
      />
    </div>
  );
});
