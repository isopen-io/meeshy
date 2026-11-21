import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import type { Conversation } from '@/lib/api/types';
import type { SessionState } from '@/lib/api/session';
import type { Viewer } from '@/lib/api/viewer';
import { titleOf } from '@/lib/view/conversation';
import { viewerParticipantOf } from '@/lib/view/viewer-participant';

import { composerRefills, type ComposerRefill } from './composer-refill';
import { guestAttachmentKindsFor, type GuestAttachments } from './guest-attachment-policy';

export type ComposerAccess = {
  readonly rights?: ParticipantPermissions;
  readonly guestAttachments?: GuestAttachments;
  readonly refill?: ComposerRefill;
};

/**
 * CE QUE LE COMPOSEUR DU FIL PEUT OFFRIR (#5668, #10003) — les droits du
 * lecteur, et pour l'invité d'un lien restreint par famille (World Wide :
 * `.txt` et audio) ses familles avec le titre du fil. MÉMOÏSÉ : `Composer` est
 * un `memo`, et des props reconstruites à chaque rendu du fil le
 * redessineraient à chaque frappe d'un pair. Le texte d'un envoi redirigé qui
 * a échoué (#20075) revient au composeur de SA conversation (`refill`).
 *
 * **LES DROITS SE RÉSOUVENT ICI, PAS CHEZ L'HÔTE** (#20264) — c'est cette unité
 * qui tient ENSEMBLE la conversation servie et l'identité du lecteur, donc la
 * seule qui puisse nommer sa ligne de participation sans que l'hôte ait à
 * réécrire la lecture. `thread.tsx` la composait lui-même sur la seule colonne
 * `userId` : un visiteur de lien, dont `viewer.id` porte un `Participant.id`,
 * n'avait donc JAMAIS de ligne, et `Composer` recevait `rights: undefined` —
 * que son contrat lit « tout est autorisé ». La lecture vit désormais dans
 * `viewerParticipantOf` (`lib/view/viewer-participant.ts`), partagée avec
 * `menuViewerOf` et `selfSenderOf`.
 *
 * Une ligne ABSENTE (au-delà de `CONVERSATION_DETAIL_PARTICIPANTS_CAP`, 100)
 * laisse `rights` absent, donc le tiroir OUVERT : c'est le même arbitrage que
 * `menuViewerOf` — ce que le client ne sait pas ne retire pas un droit que la
 * passerelle, seule autorité, refusera en 403 s'il le faut.
 */
export function useComposerAccess(params: {
  readonly session: SessionState;
  readonly conversationId: string;
  readonly conversation: Conversation | undefined;
  readonly viewer: Pick<Viewer, 'id' | 'isAnonymous'>;
}): ComposerAccess {
  const { session, conversationId, conversation, viewer } = params;
  const rights: ParticipantPermissions | undefined = viewerParticipantOf({ participants: conversation?.participants, viewer })?.permissions;
  const kinds = guestAttachmentKindsFor(session, conversationId);
  const kindsKey = kinds === null ? null : kinds.join(',');
  const title = conversation === undefined || kinds === null ? '' : titleOf(conversation, viewer.id ?? '');
  const refill = useStore(composerRefills, (state) => (state.refill?.conversationId === conversationId ? state.refill : null));
  return useMemo(
    () => ({
      ...(rights === undefined ? {} : { rights }),
      ...(kinds === null ? {} : { guestAttachments: { kinds, title } }),
      ...(refill === null ? {} : { refill: { text: refill.text, attachments: refill.attachments, place: refill.place, consume: () => composerRefills.setState({ refill: null }) } }),
    }),
    // `kinds` se compare par sa VALEUR (`kindsKey`) : la session restaurée en rend un tableau neuf.
    [rights, kindsKey, title, refill],
  );
}
