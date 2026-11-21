import type { StoreApi } from 'zustand/vanilla';

import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { sendAction } from '@/lib/api/query';
import type { Conversation } from '@/lib/api/types';
import { peerDeviceReachFor, type PeerDeviceReachState } from '@/lib/e2ee/peer-device-reach';
import { translate } from '@/lib/i18n-catalog';
import { isConversationEncryptionCatalogLoaded, loadConversationEncryptionCatalog, translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { composerRefills } from '@/lib/send/composer-refill';
import { sendFailureReason } from '@/lib/send/failure-reason';
import { E2EE_PLAINTEXT_WITHHELD } from '@/lib/end-to-end-regime-ledger';
import type { Draft } from '@/lib/send/perform-send';
import { href, navigate } from '@/routes/route-table';

import { PLAINTEXT_DIRECT_KEY } from './conversation-encryption-explanation';
import { stickerNotSentNotice } from './end-to-end-peer-without-device';
import { directPeerOf } from './plaintext-direct-gesture';
import { readableRedirectNotices, sendWithheld, type ReadableRedirectPorts } from './readable-redirect';
import { countEncryptedDevices } from './use-peer-device-reach';

/**
 * L'ENVOI RETENU D'UN TÊTE-À-TÊTE CHIFFRÉ, CHARGÉ À LA DEMANDE (#20075) —
 * `useSend` ne le tire que pour un envoi retenu : le fil ordinaire n'en paie
 * aucun octet. Un pair su sans appareil chiffré et jamais connu avec un
 * appareil (#20181) : le message part dans le tête-à-tête lisible ; sinon le
 * refus d'avant, et le brouillon revient au composeur de la conversation d'où
 * il partait (`composerRefills`) : texte, pièces et lieu ; un sticker, qui ne
 * se reprend pas, est dit perdu. Injectable pour les témoins ; par défaut, la
 * passerelle, le routeur et l'outbox réels.
 */
export type ReadableRedirect = { readonly reach: StoreApi<PeerDeviceReachState>; readonly ports: ReadableRedirectPorts };

const defaultReadableRedirect = (viewerId: string, online: boolean): ReadableRedirect => ({
  reach: peerDeviceReachFor(viewerId),
  ports: {
    online: () => online,
    open: (peerId) => createDirectConversation(apiDeps, peerId, { plaintext: true }),
    go: (conversationId) => navigate(href('thread', { conversation: conversationId })),
    send: (conversationId, draft) => void sendAction({ conversationId, draft, viewerId, online }),
    count: countEncryptedDevices,
    notices: readableRedirectNotices,
  },
});

/** Rien n'est parti : l'annonce dit pourquoi (le refus d'une vue chiffrée, #13171, ou l'échec de l'ouverture). */
async function failureReason(outcome: 'failed' | 'offline' | 'withheld', stickerLost: boolean): Promise<string> {
  const language = currentInterfaceLanguage();
  await loadConversationEncryptionCatalog(language).catch(() => undefined);
  const said =
    outcome === 'withheld'
      ? sendFailureReason({ ok: false, status: 0, error: '', code: E2EE_PLAINTEXT_WITHHELD }, language)
      : isConversationEncryptionCatalogLoaded(language)
        ? translateConversationEncryption(language, PLAINTEXT_DIRECT_KEY[outcome])
        : undefined;
  const lost = stickerLost && isConversationEncryptionCatalogLoaded(language) ? stickerNotSentNotice((key) => translateConversationEncryption(language, key)) : undefined;
  const reason = [said, lost].filter((part): part is string => part !== undefined).join(' ');
  return reason === '' ? translate(language, 'announce.messageNotSent') : translate(language, 'announce.messageNotSent.reason', { reason });
}

export async function runWithheldSend(params: {
  readonly fromConversationId: string;
  readonly conversation: Conversation | undefined;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly online: boolean;
  readonly announce: (message: string) => void;
  readonly readableRedirect?: ReadableRedirect | undefined;
}): Promise<void> {
  const redirect = params.readableRedirect ?? defaultReadableRedirect(params.viewerId, params.online);
  const peer = params.conversation === undefined ? undefined : directPeerOf(params.conversation, params.viewerId);
  const outcome = await sendWithheld({
    fromConversationId: params.fromConversationId,
    peer,
    draft: params.draft,
    reach: redirect.reach,
    ports: redirect.ports,
  }).catch((): 'failed' => 'failed');
  if (outcome === 'redirected') return;
  const { content, attachments = [], place = null, sticker } = params.draft;
  if (content !== '' || attachments.length > 0 || place !== null) {
    composerRefills.setState({ refill: { conversationId: params.fromConversationId, text: content, attachments, place } });
  }
  params.announce(await failureReason(outcome, sticker !== undefined));
}
