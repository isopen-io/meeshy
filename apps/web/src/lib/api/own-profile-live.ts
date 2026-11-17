import type { QueryClient } from '@tanstack/react-query';

import { profileUpdatedEventDataSchema } from '@meeshy/shared/types/own-profile-sync';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { takeProfileSnapshot } from './served-profile-session';

/**
 * **MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS** (#18924) — la passerelle
 * émet `profile:updated` sur `user:<moi>` seulement, appareil émetteur compris,
 * après chaque écriture de mes langues, de mon nom, de mon pseudo, de ma photo
 * ou de ma bannière : l'INSTANTANÉ de ces neuf champs et la date de l'écriture.
 *
 * La charge est décodée par le schéma du contrat
 * (`@meeshy/shared/types/own-profile-sync`), qui ignore les clés qu'un serveur
 * plus récent ajouterait ; une charge qui ne le respecte pas est ignorée. Ce
 * qui s'applique, et sous quelles gardes, est l'affaire de la projection du
 * profil servi (`takeProfileSnapshot`, `served-profile-session.ts`).
 */
export function bindOwnProfileLive(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const handler = (raw: unknown): void => {
    const decoded = profileUpdatedEventDataSchema.safeParse(raw);
    if (decoded.success) takeProfileSnapshot(params.queryClient, decoded.data);
  };
  params.socket.on<unknown>(SERVER_EVENTS.PROFILE_UPDATED, handler);
  return () => params.socket.off<unknown>(SERVER_EVENTS.PROFILE_UPDATED, handler);
}
