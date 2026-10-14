import type { QueryClient } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { parseServedProfileDecor, type ServedProfileDecor, type ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from '../api/conversations';
import { MY_PROFILE_QUERY_KEY, type MyProfile } from '../api/profile';
import { putProfileDecor } from '../api/profile-decor';
import type { SocketClient } from '../net/socket';

/**
 * **ÉQUIPER UN CONTOUR OU UNE BANNIÈRE** (#10632, § 10.2) — optimiste : le
 * choix s'écrit dans le profil en cache au toucher, `PUT /me/profile-decor`
 * confirme (la réponse fait foi), un refus ou une panne rétablit LE CÔTÉ
 * touché — jamais l'autre : un rétablissement par instantané complet
 * écraserait un événement arrivé entre-temps.
 *
 * Le décor vit sur le profil en cache (`MY_PROFILE_QUERY_KEY`) : un profil
 * sans `profileDecor` vient d'un ANCIEN serveur, rien n'est tenté.
 */

export type DecorSide = 'avatarRing' | 'banner';

export type EquipOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'refused'; readonly code: string | undefined }
  | { readonly status: 'error' }
  | { readonly status: 'unsupported' };

const decorOf = (queryClient: QueryClient): ServedProfileDecor | undefined => queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY)?.profileDecor;

const writeDecor = (queryClient: QueryClient, next: (current: ServedProfileDecor) => ServedProfileDecor): void => {
  queryClient.setQueryData<MyProfile>(MY_PROFILE_QUERY_KEY, (profile) =>
    profile === undefined || profile.profileDecor === undefined ? profile : { ...profile, profileDecor: next(profile.profileDecor) },
  );
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
  const previous = before[side];
  writeDecor(queryClient, (current) => ({ ...current, [side]: choice }));
  const result = await putProfileDecor(deps, { [side]: choice === null ? null : { pack: choice.pack, item: choice.item } });
  if (result.ok) {
    writeDecor(queryClient, () => result.data);
    return { status: 'saved' };
  }
  writeDecor(queryClient, (current) => ({ ...current, [side]: previous }));
  return result.status >= 400 && result.status < 500 ? { status: 'refused', code: result.code } : { status: 'error' };
}

/** `profile:decor-updated` — mes autres appareils ; l'événement d'un autre compte ou malformé est ignoré ENTIER. */
export function applyProfileDecorEvent(queryClient: QueryClient, payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) return;
  const event = payload as Readonly<Record<string, unknown>>;
  const mine = queryClient.getQueryData<MyProfile>(MY_PROFILE_QUERY_KEY);
  if (mine === undefined || mine.profileDecor === undefined || event['userId'] !== mine.id) return;
  const decor = parseServedProfileDecor(event['decor']);
  writeDecor(queryClient, () => decor);
}

/** Branche l'événement sur le cache du profil ; rend le débranchement. */
export function bindProfileDecorSync(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const { socket, queryClient } = params;
  const onUpdated = (payload: unknown): void => applyProfileDecorEvent(queryClient, payload);
  socket.on(SERVER_EVENTS.PROFILE_DECOR_UPDATED, onUpdated);
  return () => socket.off(SERVER_EVENTS.PROFILE_DECOR_UPDATED, onUpdated);
}
