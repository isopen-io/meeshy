import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { parseServedProfileDecor, type ServedProfileDecor, type ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from '../api/conversations';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
import { putProfileDecor } from '../api/profile-decor';
import { publicProfileQueryKey, type PublicProfileView } from '../api/public-profile';
import type { SocketClient } from '../net/socket';

/**
 * **ÉQUIPER UN CONTOUR, UNE BANNIÈRE OU UN CADRE DE BANNIÈRE** (#10632, § 10.2 ; #10936) — optimiste : le
 * choix s'écrit dans le profil en cache au toucher, `PUT /me/profile-decor`
 * confirme (la réponse fait foi), un refus ou une panne rétablit LE CÔTÉ
 * touché — jamais l'autre : un rétablissement par instantané complet
 * écraserait un événement arrivé entre-temps.
 *
 * Le décor vit sur le profil en cache (`MY_PROFILE_QUERY_KEY`) : un profil
 * sans `profileDecor` vient d'un ANCIEN serveur, rien n'est tenté.
 */

export type DecorSide = 'avatarRing' | 'banner' | 'bannerFrame';

export type EquipOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'refused'; readonly code: string | undefined }
  | { readonly status: 'error' }
  | { readonly status: 'unsupported' };

const decorOf = (queryClient: QueryClient): ServedProfileDecor | undefined => queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.profileDecor;

/** Ma fiche publique en cache (`/u/<moi>`) montre le MÊME décor que mon profil — même loi que la photo (#8881). */
const mirrorOntoPublicProfile = (queryClient: QueryClient, mine: MyProfile | undefined): void => {
  if (mine?.profileDecor === undefined) return;
  const decor = mine.profileDecor;
  queryClient.setQueryData<PublicProfileView>(publicProfileQueryKey(mine.username), (view) =>
    view === undefined || view.profile.id !== mine.id ? view : { ...view, profile: { ...view.profile, decor } },
  );
};

const writeDecor = (queryClient: QueryClient, next: (current: ServedProfileDecor) => ServedProfileDecor): void => {
  const mine = queryClient.setQueryData<MyProfile>(MY_PROFILE_QUERY_KEY, (profile) =>
    profile === undefined || profile.profileDecor === undefined ? profile : { ...profile, profileDecor: next(profile.profileDecor) },
  );
  mirrorOntoPublicProfile(queryClient, mine);
};

/**
 * Le registre de vol, par côté : deux touchers rapprochés croisent leurs
 * réponses. Seule la réponse du DERNIER choix d'un côté s'écrit ; un refus
 * revient à ce que le serveur a ACCEPTÉ (réponse ou événement), jamais à un
 * choix optimiste qu'il n'a pas confirmé. Un côté en vol garde son choix
 * affiché quoi qu'écrive l'autre côté ou un autre appareil.
 */
type Flight = { readonly latest: number; readonly inFlight: number; readonly accepted: ServedProfileDecorItem | null };

type Ledger = Readonly<Record<DecorSide, Flight>>;

const IDLE: Flight = { latest: 0, inFlight: 0, accepted: null };

const ledgers = new WeakMap<QueryClient, Ledger>();

const ledgerOf = (queryClient: QueryClient): Ledger => ledgers.get(queryClient) ?? { avatarRing: IDLE, banner: IDLE, bannerFrame: IDLE };

const updateFlight = (queryClient: QueryClient, side: DecorSide, patch: (flight: Flight) => Partial<Flight>): Flight => {
  const ledger = ledgerOf(queryClient);
  const next = { ...ledger[side], ...patch(ledger[side]) };
  ledgers.set(queryClient, { ...ledger, [side]: next });
  return next;
};

/** Le décor servi, sauf pour un côté en vol : celui-là garde le choix affiché jusqu'à sa propre réponse. */
const settledDecor = (queryClient: QueryClient, served: ServedProfileDecor, current: ServedProfileDecor): ServedProfileDecor => {
  const ledger = ledgerOf(queryClient);
  return {
    ...served,
    avatarRing: ledger.avatarRing.inFlight > 0 ? current.avatarRing : served.avatarRing,
    banner: ledger.banner.inFlight > 0 ? current.banner : served.banner,
    bannerFrame: (ledger.bannerFrame.inFlight > 0 ? current.bannerFrame : served.bannerFrame) ?? null,
  };
};

export async function equipProfileDecor(params: {
  readonly queryClient: QueryClient;
  readonly deps: ConversationsDeps;
  readonly side: DecorSide;
  readonly choice: ServedProfileDecorItem | null;
}): Promise<EquipOutcome> {
  const { queryClient, deps, side, choice } = params;
  const before = decorOf(queryClient);
  if (before === undefined) return { status: 'unsupported' };
  const { latest: generation } = updateFlight(queryClient, side, (flight) => ({
    latest: flight.latest + 1,
    inFlight: flight.inFlight + 1,
    accepted: flight.inFlight === 0 ? (before[side] ?? null) : flight.accepted,
  }));
  writeDecor(queryClient, (current) => ({ ...current, [side]: choice }));
  const result = await putProfileDecor(deps, { [side]: choice === null ? null : { pack: choice.pack, item: choice.item } });
  const settled = updateFlight(queryClient, side, (flight) => ({ inFlight: flight.inFlight - 1, ...(result.ok ? { accepted: result.data[side] ?? null } : {}) }));
  const isLatest = generation === settled.latest;
  if (result.ok) {
    if (isLatest) writeDecor(queryClient, (current) => ({ ...settledDecor(queryClient, result.data, current), [side]: result.data[side] ?? null }));
    return { status: 'saved' };
  }
  if (isLatest) writeDecor(queryClient, (current) => ({ ...current, [side]: settled.accepted }));
  return result.status >= 400 && result.status < 500 ? { status: 'refused', code: result.code } : { status: 'error' };
}

/** `profile:decor-updated` — mes autres appareils ; l'événement d'un autre compte ou malformé est ignoré ENTIER. */
export function applyProfileDecorEvent(queryClient: QueryClient, payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) return;
  const event = payload as Readonly<Record<string, unknown>>;
  const mine = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
  if (mine === undefined || mine.profileDecor === undefined || event['userId'] !== mine.id) return;
  if (typeof event['decor'] !== 'object' || event['decor'] === null) return;
  const decor = parseServedProfileDecor(event['decor']);
  updateFlight(queryClient, 'avatarRing', () => ({ accepted: decor.avatarRing }));
  updateFlight(queryClient, 'banner', () => ({ accepted: decor.banner }));
  updateFlight(queryClient, 'bannerFrame', () => ({ accepted: decor.bannerFrame ?? null }));
  writeDecor(queryClient, (current) => settledDecor(queryClient, decor, current));
}

/** Branche l'événement sur le cache du profil ; rend le débranchement. */
export function bindProfileDecorSync(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyProfileDecorEvent(queryClient, payload);
  socket.on(SERVER_EVENTS.PROFILE_DECOR_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.PROFILE_DECOR_UPDATED, onUpdated);
}
