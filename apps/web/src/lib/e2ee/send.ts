/**
 * L'ENVOI CHIFFRÉ DE BOUT EN BOUT d'un texte dans un tête-à-tête (#14592,
 * spec § 4.3), le corps REST exact de l'iOS (`SendMessageRequest.libsignal`) :
 * aucun `content`, aucune langue sur le fil — le texte, la langue et la
 * citation ne voyagent QUE dans les enveloppes.
 *
 * Le clair ne naît qu'en MÉMOIRE (l'outbox, `openedMessagesStore`) et dans la
 * base scellée : ni la ligne de liste optimiste ni le cache de requêtes
 * (rangés sur le disque) ne le reçoivent. Le message confirmé y entre sous sa
 * forme scellée, comme la passerelle le sert.
 */
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import type { E2EEEnvelope } from '@meeshy/shared/types/e2ee-directory';
import type { StoreApi } from 'zustand/vanilla';
import type { QueryClient } from '@tanstack/react-query';

import type { ApiFailure, ApiResult, HttpTransport } from '@/lib/api/http';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { messagesQueryKey, upsertThreadMessage } from '@/lib/api/messages';
import type { Message, Participant } from '@/lib/api/types';
import { confirmedMessageOf, localMessageOf } from '@/lib/send/local-message';
import type { OutboxState } from '@/lib/send/outbox-store';

import { e2eeContent } from './content';
import { publishOpened } from './opened-messages';
import { E2EEDevicesMismatchError, E2EERecipientHasNoDevice, type SealedMessage } from './sealer';
import type { E2EEClient } from './client';
import { E2EE_CODES, LIBSIGNAL_PROTOCOL } from './wire';

/** Le corps d'un envoi libsignal : par construction, il n'a pas de champ pour un clair. */
export type EndToEndSendBody = {
  readonly clientMessageId: string;
  readonly replyToId?: string;
  readonly isEncrypted: true;
  readonly encryptionMode: 'e2ee';
  readonly encryptionProtocol: typeof LIBSIGNAL_PROTOCOL;
  readonly encryptedContent: typeof LIBSIGNAL_PROTOCOL;
  readonly encryptionMetadata: { readonly protocol: typeof LIBSIGNAL_PROTOCOL; readonly senderDeviceId: number; readonly regimeEpoch?: number };
  readonly envelopes: readonly E2EEEnvelope[];
  readonly unapprovedOwnDevices?: readonly number[];
};

export function endToEndSendBody(params: {
  readonly clientMessageId: string;
  readonly replyToId: string | undefined;
  readonly sealed: SealedMessage;
  readonly regimeEpoch: number | undefined;
}): EndToEndSendBody {
  const { sealed } = params;
  return {
    clientMessageId: params.clientMessageId,
    ...(params.replyToId === undefined ? {} : { replyToId: params.replyToId }),
    isEncrypted: true,
    encryptionMode: 'e2ee',
    encryptionProtocol: LIBSIGNAL_PROTOCOL,
    encryptedContent: LIBSIGNAL_PROTOCOL,
    encryptionMetadata: {
      protocol: LIBSIGNAL_PROTOCOL,
      senderDeviceId: sealed.senderDeviceId,
      ...(params.regimeEpoch === undefined ? {} : { regimeEpoch: params.regimeEpoch }),
    },
    envelopes: sealed.envelopes,
    ...(sealed.unapprovedOwnDevices.length === 0 ? {} : { unapprovedOwnDevices: sealed.unapprovedOwnDevices }),
  };
}

/** Un refus de la passerelle, porté jusqu'à l'outbox (`lastError`). */
export class EndToEndSendRefused extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.error);
    this.name = 'EndToEndSendRefused';
  }
}

type EndToEndAck = { readonly id: string; readonly createdAt: string };

/** L'accusé, fail-closed : sans identifiant ni date, ce n'en est pas un. */
const ackOf = (data: unknown): EndToEndAck | null => {
  if (typeof data !== 'object' || data === null) return null;
  const id: unknown = Reflect.get(data, 'id');
  const createdAt: unknown = Reflect.get(data, 'createdAt');
  return typeof id === 'string' && typeof createdAt === 'string' ? { id, createdAt } : null;
};

export async function postEndToEndMessage(params: {
  readonly transport: HttpTransport;
  readonly conversationId: string;
  readonly body: EndToEndSendBody;
}): Promise<EndToEndAck> {
  const result: ApiResult<unknown> = await params.transport.request<unknown>({
    method: 'POST',
    path: conversationsEndpoints.byIdMessages(params.conversationId),
    body: params.body,
  });
  if (!result.ok) {
    /* L'écart Sesame n'a pas besoin d'être lu : la passe suivante relit les
       appareils et rouvre toute session qui vise une autre génération. */
    if (result.code === E2EE_CODES.DEVICES_MISMATCH) throw new E2EEDevicesMismatchError({ missing: [], extra: [], stale: [] });
    throw new EndToEndSendRefused(result);
  }
  const ack = ackOf(result.data);
  if (ack === null) throw new EndToEndSendRefused({ ok: false, status: 0, error: 'Accusé illisible' });
  return ack;
}

export const E2EE_ATTACHMENTS_NOT_YET = 'E2EE_ATTACHMENTS_NOT_YET';
export const E2EE_PEER_NOT_ENROLLED = 'E2EE_PEER_NOT_ENROLLED';
export const E2EE_WEB_UNAVAILABLE = 'E2EE_WEB_UNAVAILABLE';

export type EndToEndDraft = {
  readonly text: string;
  readonly language: string;
  readonly replyTo: Message | null;
};

const failureOf = (error: unknown): ApiFailure => {
  if (error instanceof EndToEndSendRefused) return error.failure;
  if (error instanceof E2EERecipientHasNoDevice) {
    return { ok: false, status: 0, error: 'Votre contact n’a pas encore d’appareil qui chiffre', code: E2EE_PEER_NOT_ENROLLED };
  }
  return { ok: false, status: 0, error: 'Le chiffrement de bout en bout n’a pas abouti', code: E2EE_WEB_UNAVAILABLE };
};

/**
 * Scelle et envoie : bulle optimiste en mémoire, puis une enveloppe par
 * appareil, résolution Sesame, et le clair rangé scellé sous l'identifiant
 * servi. Rien ne part en clair, à aucune étape.
 */
export async function performEndToEndSend(params: {
  readonly conversationId: string;
  readonly peerUserId: string;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly draft: EndToEndDraft;
  readonly regimeEpoch?: number;
  readonly client: () => Promise<E2EEClient>;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
  readonly outbox: StoreApi<OutboxState>;
  readonly now?: () => number;
}): Promise<void> {
  const { conversationId, draft, outbox } = params;
  const nowMs = (params.now ?? Date.now)();
  const clientMessageId = newClientMessageId();
  const local = localMessageOf({
    clientMessageId,
    conversationId,
    viewerId: params.viewerId,
    ...(params.sender === undefined ? {} : { sender: params.sender }),
    content: draft.text,
    originalLanguage: draft.language,
    messageType: 'text',
    ...(draft.replyTo === null ? {} : { replyToId: draft.replyTo.id, replyTo: draft.replyTo }),
    now: new Date(nowMs),
  });
  outbox.getState().enqueue(conversationId, { message: local, delivery: 'pending', attempts: 1, startedAt: nowMs });
  try {
    const client = await params.client();
    const content = e2eeContent({
      text: draft.text,
      language: draft.language,
      replyTo: draft.replyTo?.id ?? null,
      conversationId,
      clientMessageId,
      sentAt: nowMs,
    });
    const ack = await client.sealer.sealAndDeliver(content, params.peerUserId, (sealed) =>
      postEndToEndMessage({
        transport: params.transport,
        conversationId,
        body: endToEndSendBody({ clientMessageId, replyToId: draft.replyTo?.id, sealed, regimeEpoch: params.regimeEpoch }),
      }),
    );
    await client.rememberSent(ack.id, content);
    publishOpened(ack.id, { text: draft.text, language: draft.language });
    const confirmed = confirmedMessageOf(local, { ...ack, conversationId });
    /* La rangée qui entre au cache (rangé sur le disque) : LISTE BLANCHE, sans
       texte, sans langue, sans la citation (qui porte le clair ouvert du message
       cité) — la forme que la passerelle sert. Le fil rend le texte depuis la
       mémoire (`withOpenedTexts`). Les champs requis de `Message` sont tous ici. */
    const sealedRow = {
      id: confirmed.id,
      clientMessageId,
      conversationId,
      senderId: confirmed.senderId,
      ...(confirmed.sender === undefined ? {} : { sender: confirmed.sender }),
      messageType: 'text',
      messageSource: confirmed.messageSource,
      ...(confirmed.replyToId === undefined ? {} : { replyToId: confirmed.replyToId }),
      createdAt: confirmed.createdAt,
      timestamp: confirmed.timestamp,
      deliveredCount: confirmed.deliveredCount,
      readCount: confirmed.readCount,
      content: '[Encrypted]',
      originalLanguage: '',
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptionMetadata: { protocol: LIBSIGNAL_PROTOCOL },
      translations: [],
    } as unknown as Message;
    await params.queryClient.cancelQueries({ queryKey: messagesQueryKey(conversationId) });
    upsertThreadMessage(params.queryClient, conversationId, sealedRow);
    outbox.getState().remove(conversationId, clientMessageId);
  } catch (error) {
    outbox.getState().markFailed(conversationId, clientMessageId, failureOf(error));
  }
}
