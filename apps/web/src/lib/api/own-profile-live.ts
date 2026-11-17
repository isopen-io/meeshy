import type { QueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';

import type { ProfileUpdatedEventData } from '@meeshy/shared/types/own-profile-sync-order';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '@/lib/net/socket';

import { takeProfileSnapshot } from './served-profile-session';

/**
 * **MON PROFIL SE SYNCHRONISE ENTRE MES APPAREILS** (#18924) — la passerelle
 * émet `profile:updated` sur `user:<moi>` seulement, appareil émetteur compris,
 * après chaque écriture de mes langues, de mon nom, de mon pseudo, de ma photo
 * ou de ma bannière : l'INSTANTANÉ de ces neuf champs et la date de l'écriture.
 *
 * La charge est décodée par un schéma `zod/mini` — la convention du web : le
 * schéma `zod` CLASSIQUE du contrat (`@meeshy/shared/types/own-profile-sync`)
 * gonflait le morceau partagé « zod » de 9,5 Ko gzip, à chaque démarrage (garde
 * `lib/no-classic-zod.test.ts`). Il en reprend les règles une à une, et son
 * type de sortie est vérifié contre celui du contrat (`ProfileUpdatedEventData`,
 * module sans `zod`) : les clés qu'un serveur plus récent ajouterait sont
 * ignorées, une charge qui ne respecte pas le contrat aussi. Seule différence
 * voulue : la date de l'écriture n'a qu'à être LISIBLE (`Date.parse`), ce qui
 * suffit à l'arbitrage — `z.iso.datetime` tirait sa machinerie dans le morceau
 * partagé. Ce qui s'applique, et sous quelles gardes, est l'affaire de la
 * projection du profil servi (`takeProfileSnapshot`, `served-profile-session.ts`).
 */
const instant = z.string().check(z.refine((value) => !Number.isNaN(Date.parse(value))));

const ProfileUpdatedWire = z.object({
  userId: z.string().check(z.minLength(1)),
  updatedAt: instant,
  profile: z.object({
    systemLanguage: z.string().check(z.minLength(1)),
    regionalLanguage: z.nullable(z.string()),
    customDestinationLanguage: z.nullable(z.string()),
    displayName: z.nullable(z.string()),
    firstName: z.string(),
    lastName: z.string(),
    username: z.string(),
    avatar: z.nullable(z.string()),
    banner: z.nullable(z.string()),
  }),
}) satisfies z.ZodMiniType<ProfileUpdatedEventData>;

export function bindOwnProfileLive(params: { readonly socket: SocketClient; readonly queryClient: QueryClient }): () => void {
  const handler = (raw: unknown): void => {
    const decoded = ProfileUpdatedWire.safeParse(raw);
    if (decoded.success) takeProfileSnapshot(params.queryClient, decoded.data);
  };
  params.socket.on<unknown>(SERVER_EVENTS.PROFILE_UPDATED, handler);
  return () => params.socket.off<unknown>(SERVER_EVENTS.PROFILE_UPDATED, handler);
}
