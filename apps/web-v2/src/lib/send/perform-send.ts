import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { uploadAttachments } from '@/lib/api/attachments';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { patchConversation, type ConversationsDeps } from '@/lib/api/conversations';
import type { ApiFailure } from '@/lib/api/http';
import { messagesQueryKey, sendMessage, type MessagesPage, type SendMessageBody } from '@/lib/api/messages';
import type { Message, Participant } from '@/lib/api/types';

import { messageTypeOfPending, type PendingAttachment } from './attachments';
import type { ComposeProtection } from './compose-protection';
import { confirmedMessageOf, localMessageOf, type LocalMessage } from './local-message';
import { entriesOf, type OutboxState } from './outbox-store';

/**
 * LE SITE UNIQUE DE LA RÈGLE (#5813, étape 5) — comment une écriture PART,
 * se CONFIRME et se RELANCE. `queryClient`/`outbox`/`online` sont REÇUS,
 * jamais lus depuis un singleton : ce module ne sait rien de `apiConfig`
 * ni de `useOnline()`, `use-send.ts` (le hook, sans règle) les lui fournit.
 */
export type SendDeps = ConversationsDeps & {
  readonly queryClient: QueryClient;
  readonly outbox: StoreApi<OutboxState>;
  readonly online: boolean;
  /** Horloge injectable — jamais `Date.now()` lu directement (témoins). */
  readonly now?: () => number;
};

export type Draft = {
  readonly content: string;
  readonly originalLanguage: string;
  readonly replyToId?: string;
  /** Le message cité, ENTIER — voir `localMessageOf` (`local-message.ts`,
   * défaut majeur 6, revue-correction #5813) : porté à côté de `replyToId`
   * pour que la bulle optimiste affiche sa citation avant tout accusé. */
  readonly replyTo?: Message;
  /**
   * LA SÉLECTION DU COMPOSEUR (#5668) — `undefined`/liste vide pour un envoi
   * texte pur (comportement INCHANGÉ, tous les témoins historiques de ce
   * module continuent de passer sans cette clé). Non vide ⇒ `performSend`
   * pose `entry.upload` et `attempt()` téléverse AVANT d'appeler
   * `POST …/messages`.
   */
  readonly attachments?: readonly PendingAttachment[];
  /**
   * LA PROTECTION CHOISIE (#6175) — éphémère / flou / vue unique / effets
   * décoratifs, composée en champs `Message` par `localMessageOf`
   * (`protectionFieldsOf`, `compose-protection.ts`) UNE seule fois, à la
   * création : `retrySend` relit le MÊME `LocalMessage`, jamais recalculée
   * (`expiresAt` ne doit JAMAIS reculer d'un renvoi à l'autre). `undefined`
   * ⇒ aucune protection (comportement INCHANGÉ, tous les témoins historiques
   * de ce module continuent de passer sans cette clé).
   */
  readonly protection?: ComposeProtection;
};

/**
 * LE DÉDOUBLONNAGE DU DOUBLE-TAP — miroir
 * `ConversationViewModel.swift:81` (`duplicateSendDebounce`, 0,6 s) : deux
 * envois du MÊME `(conversationId, content, replyToId)` sous 600 ms sont UN
 * seul envoi, jamais deux messages identiques partis en double. Une carte de
 * MODULE (comme `consumedViewOnceIds`, `api/fixtures.ts`) — la clé compose
 * la conversation pour qu'un même texte tapé dans DEUX fils distincts ne se
 * dédoublonne jamais entre eux.
 *
 * ELLE NE RETIENT RIEN AU-DELÀ DE SA FENÊTRE (revue-correction) : sa clé
 * porte le TEXTE ENTIER du message et sa valeur ne vaut que 600 ms — la
 * laisser croître garderait en mémoire, pour toute la session, chaque
 * message jamais écrit (dimension 3, « aucun cache non borné »). La purge se
 * fait à l'entrée de `performSend`, sur une carte qui reste par construction
 * minuscule : jamais un minuteur, jamais un second cycle de vie à tenir.
 */
const DEBOUNCE_MS = 600;
const lastAccepted = new Map<string, number>();

/**
 * Le séparateur est U+0000, ÉCRIT EN ÉCHAPPEMENT et jamais en octet brut : un
 * seul NUL dans le fichier suffit à faire classer la source BINAIRE par git
 * (`git diff` rend « Bin 0 -> 9232 bytes », plus aucune revue possible) —
 * mesuré sur ce fichier même. La valeur produite est identique.
 *
 * LA SIGNATURE DES PIÈCES JOINTES (#5668) — `content` seul dédoublonnait déjà
 * deux ENVOIS DE TEXTE identiques ; un envoi de pièces PURES (`content`
 * toujours `''`) aurait sinon confondu deux photos DISTINCTES tapées à moins
 * de 600 ms d'écart. `name:size` suffit (jamais le `File` lui-même, non
 * sérialisable en clé) — deux fichiers homonymes de même poids restent une
 * collision acceptée, exactement la même tolérance que le texte (`content`
 * identique = même clé).
 */
function attachmentsSignatureOf(attachments: readonly PendingAttachment[] | undefined): string {
  return (attachments ?? []).map((a) => `${a.name}:${a.size}`).join('\u0000');
}

function debounceKeyOf(
  conversationId: string,
  content: string,
  replyToId: string | undefined,
  attachments: readonly PendingAttachment[] | undefined,
): string {
  return `${conversationId}\u0000${content}\u0000${replyToId ?? ''}\u0000${attachmentsSignatureOf(attachments)}`;
}

function pruneDebounce(nowMs: number): void {
  for (const [key, at] of lastAccepted) {
    if (nowMs - at >= DEBOUNCE_MS) lastAccepted.delete(key);
  }
}

/** TÉMOIN SEUL — combien de clés la carte du débounce RETIENT (même
 * discipline que `resetSentMessagesForTests`, `api/fixtures.ts`). */
export function debounceEntryCountForTests(): number {
  return lastAccepted.size;
}

/**
 * `attachmentIds` REÇUS séparément du `message` (#5668) : ils viennent de la
 * PHASE D'UPLOAD de `attempt()` (ou d'une reprise qui les a déjà obtenus),
 * jamais de `message.attachments` — qui porte des `Attachment` LOCAUX
 * (`fileUrl` en `blob:`, pour la bulle optimiste), pas des ids serveur.
 * `content` est OMIS quand le texte est vide (§ 0 de la spécification #5668,
 * un vocal PUR part sans la clé) ; `messageType` OMIS à `'text'` (le défaut
 * serveur, `messages-send.ts:59`).
 */
/**
 * LA PROTECTION, RELUE depuis le message local plutôt que RECOMPOSÉE
 * (#6175) — `localMessageOf` a déjà posé `isBlurred`/`isViewOnce`/
 * `effectFlags`/`expiresAt` par `protectionFieldsOf` : ce corps relit ces
 * MÊMES champs, jamais une seconde composition depuis `ComposeProtection` (un
 * seul site de vérité entre ce qui s'affiche et ce qui part). Chaque clé est
 * OMISE à sa valeur par défaut (`false`/`0`/absente) — même discipline que
 * `content`/`replyToId` ci-dessous, miroir `ConversationViewModel+Send.swift:428-437`
 * (« aucune clé à sa valeur par défaut »).
 */
function protectionBodyOf(message: LocalMessage): Pick<SendMessageBody, 'isBlurred' | 'expiresAt' | 'effectFlags' | 'isViewOnce'> {
  return {
    ...(message.isBlurred ? { isBlurred: true } : {}),
    ...(message.expiresAt === undefined ? {} : { expiresAt: message.expiresAt.toISOString() }),
    ...(message.effectFlags ? { effectFlags: message.effectFlags } : {}),
    ...(message.isViewOnce ? { isViewOnce: true } : {}),
  };
}

function bodyOf(message: LocalMessage, attachmentIds: readonly string[]): SendMessageBody {
  const declared = declaredAttachmentType(message.messageType);
  return {
    ...(message.content.trim().length > 0 ? { content: message.content } : {}),
    originalLanguage: message.originalLanguage,
    clientMessageId: message.clientMessageId,
    ...(declared === undefined ? {} : { messageType: declared }),
    ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
    ...(message.replyToId === undefined ? {} : { replyToId: message.replyToId }),
    ...protectionBodyOf(message),
  };
}

/**
 * LE TYPE QU'ON A LE DROIT DE DÉCLARER, sans assertion (revue-correction
 * #5668) — `LocalMessage['messageType']` porte AUSSI `'system'` et
 * `'location'`, que ce lot ne produit jamais : un `as` les aurait laissés
 * passer en silence si un futur appelant en posait un. Rendre `undefined`
 * laisse alors le défaut serveur (`'text'`, `messages-send.ts:220`)
 * s'appliquer, plutôt que d'écrire une déclaration que le serveur, lui, ne
 * corrigera PAS (`attachment-message-type.ts:112-113`).
 */
function declaredAttachmentType(
  messageType: LocalMessage['messageType'],
): 'image' | 'file' | 'audio' | 'video' | undefined {
  return messageType === 'image' || messageType === 'file' || messageType === 'audio' || messageType === 'video'
    ? messageType
    : undefined;
}

/**
 * REMPLACE par `id` OU `clientMessageId` s'il existe déjà dans la page (un
 * écho socket arrivé avant l'accusé REST, cas #5494), sinon APPEND en queue
 * — l'ordre ASCENDANT que `messages.ts` établit (§3.1/4.5 point 2 de la
 * spécification #5813).
 */
function upsertConfirmed(messages: readonly Message[], confirmed: LocalMessage): readonly Message[] {
  const index = messages.findIndex(
    (m) =>
      m.id === confirmed.id ||
      (m as { readonly clientMessageId?: string }).clientMessageId === confirmed.clientMessageId,
  );
  if (index === -1) return [...messages, confirmed];
  return messages.map((m, i) => (i === index ? confirmed : m));
}

/**
 * L'ENVOL, ET SA GARDE — `dispatch` ne rend JAMAIS un rejet, quoi qu'il
 * arrive à `attempt` (revue-correction).
 */
async function dispatch(params: {
  readonly conversationId: string;
  readonly message: LocalMessage;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, message, deps } = params;
  try {
    await attempt(params);
  } catch {
    /* AUCUNE EXCEPTION NE LAISSE UN MESSAGE SUR L'HORLOGE. `performSend` est
       appelé en `void` par le hook : un rejet y resterait non traité et
       l'entrée d'outbox garderait `pending` POUR TOUJOURS — une horloge qui
       tourne sans reprise possible. `ApiResult` ne rejette jamais (doctrine
       `http.ts`), mais ce module REÇOIT son transport : la garde tient sur ce
       qu'on lui donne. Direction de l'erreur choisie par le COÛT DE
       RÉPARATION — un « Réessayer » de trop se rejoue (l'appel est idempotent
       par `clientMessageId`), une horloge figée ne se répare pas. */
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId);
  }
}

/**
 * LA TENTATIVE — appelle le port, puis arbitre l'issue. **Un seul geste pour
 * les deux issues d'échec** (permanent/transient) : la différence vit dans
 * `lastError.status` de l'entrée d'outbox, pour l'affichage et pour la
 * future file de reprise (issue compagnon Q2). `ApiResult` ne rejette jamais
 * (doctrine `http.ts`), `unwrap` n'est PAS appelé — ce n'est pas un
 * `queryFn` ; ce qui pourrait tout de même lever est rattrapé par `dispatch`.
 */
/**
 * LA PHASE D'UPLOAD (#5668) — appelée par `attempt()` AVANT `POST …/messages`
 * quand l'entrée porte `upload`. Rend les `attachmentIds` à poser sur le
 * corps, ou `null` si l'upload a échoué (`markFailed` déjà posé par cette
 * fonction — l'appelant s'arrête alors sans rien tenter d'autre).
 *
 * REPRISE SANS RE-UPLOAD (§ 0 « Reprise » de la spécification) :
 * `upload.attachmentIds` déjà posé (un `POST …/messages` précédent a échoué
 * APRÈS un upload réussi) ⇒ cette phase ne rappelle PAS
 * `POST /attachments/upload`, elle rend directement les ids mémorisés.
 *
 * RÉCONCILIATION PAR COMPTE (§ 0 « UPLOAD_PARTIAL ») : `uploadMultiple` avale
 * les échecs PAR FICHIER sous `success: true` — moins d'attachements que de
 * fichiers envoyés est un ÉCHEC d'envoi, jamais un envoi partiel silencieux.
 */
async function uploadPhase(params: {
  readonly conversationId: string;
  readonly message: LocalMessage;
  readonly deps: SendDeps;
}): Promise<readonly string[] | null> {
  const { conversationId, message, deps } = params;
  const entry = entriesOf(deps.outbox.getState(), conversationId).find(
    (e) => e.message.clientMessageId === message.clientMessageId,
  );
  const upload = entry?.upload;
  if (upload === undefined) {
    /**
     * L'ENTRÉE NE PORTE PLUS SA PHASE D'UPLOAD, MAIS LE MESSAGE DÉCLARE DES
     * PIÈCES (revue-correction #5668) — rendre `[]` enverrait le message
     * AMPUTÉ : la bulle montrerait la photo en local, le serveur
     * enregistrerait un message vide, et personne ne verrait jamais l'écart.
     * La direction de l'erreur se choisit par le COÛT DE RÉPARATION
     * (`tasks/lessons.md`) : un « Réessayer » de trop se rejoue, une pièce
     * perdue en silence ne se répare pas.
     */
    if ((message.attachments?.length ?? 0) > 0) {
      deps.outbox
        .getState()
        .markFailed(conversationId, message.clientMessageId, {
          ok: false,
          status: 0,
          error: 'Pièces jointes introuvables pour cet envoi',
          code: 'UPLOAD_PARTIAL',
        });
      return null;
    }
    return [];
  }
  if (upload.attachmentIds !== undefined) return upload.attachmentIds;
  if (upload.files.length === 0) return [];

  const result = await uploadAttachments({
    source: deps.source,
    transport: deps.transport,
    pending: upload.files,
  });

  if (!result.ok) {
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId, result);
    return null;
  }
  if (result.data.attachments.length < upload.files.length) {
    const failure: ApiFailure = { ok: false, status: 200, error: 'Lot de pièces jointes incomplet', code: 'UPLOAD_PARTIAL' };
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId, failure);
    return null;
  }

  const attachmentIds = result.data.attachments.map((a) => a.id);
  deps.outbox.getState().markUploaded(conversationId, message.clientMessageId, attachmentIds);
  return attachmentIds;
}

async function attempt(params: {
  readonly conversationId: string;
  readonly message: LocalMessage;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, message, deps } = params;

  const attachmentIds = await uploadPhase(params);
  if (attachmentIds === null) return; // markFailed déjà posé par uploadPhase.

  const result = await sendMessage({
    source: deps.source,
    transport: deps.transport,
    conversationId,
    body: bodyOf(message, attachmentIds),
  });

  if (!result.ok) {
    deps.outbox.getState().markFailed(conversationId, message.clientMessageId, result);
    return;
  }

  const confirmed = confirmedMessageOf(message, result.data);

  // ANNULE le refetch en vol AVANT d'écrire — sinon la résolution d'une
  // page déjà en cours écraserait le confirmé qu'on vient de poser
  // (témoin 4.5, point 11).
  await deps.queryClient.cancelQueries({ queryKey: messagesQueryKey(conversationId) });
  deps.queryClient.setQueryData<MessagesPage>(messagesQueryKey(conversationId), (page) =>
    page === undefined ? page : { ...page, messages: upsertConfirmed(page.messages, confirmed) },
  );
  patchConversation(deps.queryClient, conversationId, (c) => {
    // La clé RETIRÉE, jamais posée à `undefined` (`exactOptionalPropertyTypes`) —
    // un message texte confirmé n'a pas encore de traductions connues.
    const { lastMessageTranslations: _lastMessageTranslations, ...rest } = c;
    return {
      ...rest,
      lastMessage: confirmed,
      // `createdAt` de l'accusé reste une CHAÎNE dans le cache (D-26) — même
      // écart de forme que `confirmedMessageOf`, même cast justifié.
      lastMessageAt: confirmed.createdAt as unknown as Date,
      lastMessageOriginalLanguage: confirmed.originalLanguage,
    };
  });
  deps.outbox.getState().remove(conversationId, message.clientMessageId);
}

export async function performSend(params: {
  readonly conversationId: string;
  readonly draft: Draft;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, draft, viewerId, sender, deps } = params;
  const now = deps.now ?? Date.now;
  const nowMs = now();

  const key = debounceKeyOf(conversationId, draft.content, draft.replyToId, draft.attachments);
  const previous = lastAccepted.get(key);
  pruneDebounce(nowMs);
  if (previous !== undefined && nowMs - previous < DEBOUNCE_MS) return;
  lastAccepted.set(key, nowMs);

  const clientMessageId = newClientMessageId();
  const messageType = messageTypeOfPending(draft.attachments ?? []);
  const message = localMessageOf({
    clientMessageId,
    conversationId,
    viewerId,
    ...(sender === undefined ? {} : { sender }),
    content: draft.content,
    originalLanguage: draft.originalLanguage,
    messageType,
    ...(draft.replyToId === undefined ? {} : { replyToId: draft.replyToId }),
    ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
    ...(draft.attachments === undefined || draft.attachments.length === 0 ? {} : { attachments: draft.attachments }),
    ...(draft.protection === undefined ? {} : { protection: draft.protection }),
    now: new Date(nowMs),
  });

  deps.outbox.getState().enqueue(conversationId, {
    message,
    delivery: deps.online ? 'pending' : 'failed',
    attempts: deps.online ? 1 : 0,
    startedAt: nowMs,
    ...(draft.attachments === undefined || draft.attachments.length === 0
      ? {}
      : { upload: { files: draft.attachments } }),
  });

  if (!deps.online) return; // hors ligne (D-16) : aucun appel.

  await dispatch({ conversationId, message, deps });
}

export async function retrySend(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly deps: SendDeps;
}): Promise<void> {
  const { conversationId, clientMessageId, deps } = params;
  const entry = entriesOf(deps.outbox.getState(), conversationId).find(
    (e) => e.message.clientMessageId === clientMessageId,
  );
  if (entry === undefined || entry.delivery !== 'failed') return;
  if (!deps.online) return; // D-16 : reste en échec, aucun appel.

  const now = deps.now ?? Date.now;
  deps.outbox.getState().markPending(conversationId, clientMessageId, now());
  // Le MÊME `clientMessageId` et la MÊME `originalLanguage` — `entry.message`
  // est repris tel quel, jamais reconstruit (« aucune régénération au
  // renvoi », § 10 de la spécification #5813).
  await dispatch({ conversationId, message: entry.message, deps });
}
