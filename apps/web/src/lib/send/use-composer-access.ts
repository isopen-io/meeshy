import { useMemo } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import type { Conversation } from '@/lib/api/types';
import type { SessionState } from '@/lib/api/session';
import { titleOf } from '@/lib/view/conversation';

import { guestAttachmentKindsFor, type GuestAttachments } from './guest-attachment-policy';

export type ComposerAccess = {
  readonly rights?: ParticipantPermissions;
  readonly guestAttachments?: GuestAttachments;
};

/**
 * CE QUE LE COMPOSEUR DU FIL PEUT OFFRIR (#5668, #10003) — les droits du
 * lecteur, et pour l'invité d'un lien restreint par famille (World Wide :
 * `.txt` et audio) ses familles avec le titre du fil. MÉMOÏSÉ : `Composer` est
 * un `memo`, et des props reconstruites à chaque rendu du fil le
 * redessineraient à chaque frappe d'un pair.
 */
export function useComposerAccess(params: {
  readonly session: SessionState;
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly viewerId: string | null;
  readonly rights: ParticipantPermissions | undefined;
}): ComposerAccess {
  const { session, conversationId, conversation, viewerId, rights } = params;
  const kinds = guestAttachmentKindsFor(session, conversationId);
  const kindsKey = kinds === null ? null : kinds.join(',');
  const title = conversation === undefined || kinds === null ? '' : titleOf(conversation, viewerId ?? '');
  return useMemo(
    () => ({
      ...(rights === undefined ? {} : { rights }),
      ...(kinds === null ? {} : { guestAttachments: { kinds, title } }),
    }),
    // `kinds` se compare par sa VALEUR (`kindsKey`) : la session restaurée en rend un tableau neuf.
    [rights, kindsKey, title],
  );
}
