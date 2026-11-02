/**
 * L'ENVOI CHIFFRÉ DE BOUT EN BOUT d'un texte dans un tête-à-tête (#14592,
 * spec § 4.3), le corps REST exact de l'iOS (`SendMessageRequest.libsignal`) :
 * aucun `content`, aucune langue sur le fil — le texte, la langue et la
 * citation ne voyagent QUE dans les enveloppes.
 *
 * Le clair ne naît qu'en MÉMOIRE (l'outbox, `opened-messages.ts`) et dans la
 * base scellée : ni la ligne de liste optimiste ni le cache de requêtes
 * (rangés sur le disque) ne le reçoivent. Le message confirmé y entre sous sa
 * forme scellée, comme la passerelle le sert.
 */
import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import type { E2EEEnvelope } from '@meeshy/shared/types/e2ee-directory';
import { E2EE_ERROR_CODES, LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-protocol';
import type { StoreApi } from 'zustand/vanilla';
import type { QueryClient } from '@tanstack/react-query';

import type { ApiFailure, ApiResult, HttpTransport } from '@/lib/api/http';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { messagesQueryKey, projectAck, upsertThreadMessage, type SentMessageAck } from '@/lib/api/messages';
import type { Message, Participant } from '@/lib/api/types';
import type { confirmedMessageOf, localMessageOf } from '@/lib/send/local-message';
import type { OutboxState } from '@/lib/send/outbox-store';

import { e2eeContent } from './content';
import type { E2EE_PEER_NOT_ENROLLED, E2EE_WEB_UNAVAILABLE } from './send-codes';
import type { OpenedSink } from './opened-messages';
import { E2EEDevicesMismatchError, E2EERecipientHasNoDevice, type SealedMessage } from './sealer';
import type { E2EEClient } from './client';

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

export async function postEndToEndMessage(params: {
  readonly transport: HttpTransport;
  readonly conversationId: string;
  readonly body: EndToEndSendBody;
}): Promise<SentMessageAck> {
  const result: ApiResult<unknown> = await params.transport.request<unknown>({
    method: 'POST',
    path: conversationsEndpoints.byIdMessages(params.conversationId),
    body: params.body,
  });
  if (!result.ok) {
    if (result.code === E2EE_ERROR_CODES.DEVICES_MISMATCH) throw new E2EEDevicesMismatchError(null);
    throw new EndToEndSendRefused(result);
  }
  const ack = projectAck(result.data);
  if (ack === null) throw new EndToEndSendRefused({ ok: false, status: 0, error: 'Accusé illisible' });
  return ack;
}

export type EndToEndDraft = {
  readonly text: string;
  readonly language: string;
  readonly replyTo: Message | null;
};

/* Les codes LUS par le fil (`send-codes.ts`) : le compilateur vérifie que ces littéraux sont les siens, sans import
   à l'exécution — un import en ferait un chunk partagé entre le fil et cette pile chargée à la demande. */
const PEER_NOT_ENROLLED: typeof E2EE_PEER_NOT_ENROLLED = 'E2EE_PEER_NOT_ENROLLED';
const WEB_UNAVAILABLE: typeof E2EE_WEB_UNAVAILABLE = 'E2EE_WEB_UNAVAILABLE';

const failureOf = (error: unknown): ApiFailure => {
  if (error instanceof EndToEndSendRefused) return error.failure;
  if (error instanceof E2EERecipientHasNoDevice) {
    return { ok: false, status: 0, error: 'Votre contact n’a pas encore d’appareil qui chiffre', code: PEER_NOT_ENROLLED };
  }
  return { ok: false, status: 0, error: 'Le chiffrement de bout en bout n’a pas abouti', code: WEB_UNAVAILABLE };
};

/**
 * La bulle optimiste et sa confirmation, celles de l'envoi en clair
 * (`lib/send/local-message.ts`). REMISES par le fil, jamais importées : ce
 * module vit dans le chunk `query`, et l'importer depuis ce chunk différé le
 * fendait en un chunk partagé de plus, nommé dans la carte de préchargement de
 * l'entrée (`budgets.json › first_paint`).
 */
export type LocalBubbles = {
  readonly localMessageOf: typeof localMessageOf;
  readonly confirmedMessageOf: typeof confirmedMessageOf;
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
  readonly opened: OpenedSink;
  readonly bubbles: LocalBubbles;
  readonly now?: () => number;
}): Promise<void> {
  const { conversationId, draft, outbox } = params;
  const nowMs = (params.now ?? Date.now)();
  const clientMessageId = newClientMessageId();
  const local = params.bubbles.localMessageOf({
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
    params.opened.publishOpened(ack.id, { text: draft.text, language: draft.language, senderUserId: params.viewerId });
    const confirmed = params.bubbles.confirmedMessageOf(local, ack);
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
