import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type GuestIdentity } from '@/lib/api/session';
import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world-identity';
import { shareLinkUrl } from '@/lib/links/web-origin';

/**
 * **LE LIEN PUBLIC D'UNE CONVERSATION, À TRANSMETTRE** (#10206, directive
 * porteur du 2026-10-11) — `/chat/<clé du lien de partage>`, l'adresse que
 * tous les liens émis visent (`shareLinkUrl`). Le fil le propose à côté de son
 * avatar, à l'invité comme au membre, puisque les détails de la conversation
 * ne s'ouvrent plus à un visiteur sans compte (#10205).
 *
 * D'où vient la clé, sans jamais l'écrire en dur :
 * 1. l'invité tient le lien par lequel il est entré (`GuestIdentity.link`) —
 *    c'est la porte même qu'il peut transmettre ;
 * 2. World Wide sert la sienne, publique, par `GET /world`
 *    (`shareLinkIdentifier`), qui peut tourner sans republier d'application.
 *
 * Aucune autre conversation n'expose aujourd'hui de clé stable à son lecteur :
 * sans clé, aucun bouton — jamais un lien qui ne mènerait nulle part.
 */
export function conversationShareLinkOf(params: {
  readonly conversation: { readonly id: string; readonly identifier?: string | null | undefined };
  readonly guest: GuestIdentity | null;
  readonly worldLink: string | null | undefined;
}): string | null {
  const { conversation, guest } = params;
  const ownsIt = guest !== null && (guest.conversationId === conversation.id || guest.conversationId === conversation.identifier);
  if (ownsIt && guest.link !== '') return guest.link;
  if (conversation.identifier !== WORLD_CONVERSATION_IDENTIFIER) return null;
  return typeof params.worldLink === 'string' && params.worldLink !== '' ? params.worldLink : null;
}

/** L'URL à partager, sur l'origine PUBLIQUE (`publicWebOrigin` — une coque n'a qu'une origine virtuelle). */
export function conversationShareUrl(link: string, publicOrigin: string): string {
  return shareLinkUrl(publicOrigin, encodeURIComponent(link));
}

export const WORLD_ENTRY_QUERY_KEY = ['world', 'entry'] as const;

const WORLD_ENTRY_STALE_MS = 30 * 60_000;

/** La clé au rendu : celle de l'invité tout de suite, celle de World Wide dès que `GET /world` l'a servie. */
export function useConversationShareLink(conversation: { readonly id: string; readonly identifier?: string | null | undefined }): string | null {
  const guest = useStore(sessionStore, (state) => (state.session.status === 'guest' ? state.session.guest : null));
  const own = conversationShareLinkOf({ conversation, guest, worldLink: null });
  const world = useQuery(
    {
      queryKey: WORLD_ENTRY_QUERY_KEY,
      queryFn: async ({ signal }) => {
        const { loadWorldEntry } = await import('@/lib/api/world');
        return unwrap(await loadWorldEntry({ ...apiDeps, signal }));
      },
      enabled: own === null && conversation.identifier === WORLD_CONVERSATION_IDENTIFIER,
      staleTime: WORLD_ENTRY_STALE_MS,
      retry: false,
    },
    appQueryClient,
  );
  return own ?? conversationShareLinkOf({ conversation, guest: null, worldLink: world.data?.shareLinkIdentifier });
}
