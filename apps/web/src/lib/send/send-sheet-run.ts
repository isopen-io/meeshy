import { forwardBodyOf, type ForwardResult, type ForwardSource } from '@/lib/api/forward';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import type { SendMessageBody, SentMessageAck } from '@/lib/api/messages';
import type { PublishedPost } from '@/lib/api/share-publish';

import type { PublishFormat, SendPayload, SendPlanEntry, SendStep } from './send-sheet-plan';

/**
 * LE MOTEUR D'EXÉCUTION D'UN ENVOI (#8884) — joue le plan de `send-sheet-plan`
 * cible par cible, à PORTS INJECTÉS : ce fichier n'importe aucun réseau, il ne
 * connaît que la forme des appels (`SendSheetPorts`). `send-sheet-ports.ts`
 * branche les vrais ; les témoins branchent des factices.
 *
 * **SÉQUENTIEL, dans l'ordre choisi.** Les cibles partent l'une après l'autre :
 * c'est ce qui rend le partage d'un téléversement DÉTERMINISTE (la première
 * cible qui réussit téléverse, les suivantes copient) et qui ménage le seau
 * d'écriture de la passerelle.
 *
 * **Le rejeu ne renvoie JAMAIS ce qui est parti.** Chaque cible mémorise
 * combien de ses étapes sont accomplies : un transfert réussi dont la légende a
 * échoué se rejoue par la légende seule. Les identifiants de message
 * (`clientMessageId`) sont figés par étape — un envoi dont l'accusé s'est perdu
 * se rejoue sous le MÊME identifiant, que la passerelle dédoublonne.
 *
 * **Hors ligne : échec rejouable, pas de file.** L'outbox (`outbox-store.ts`)
 * ne porte qu'une bulle LOCALE d'un fil (`LocalMessage`, un seul
 * `attachmentIds`), pas un transfert, une copie serveur ni une publication, et
 * elle est en mémoire seule : y router ces envois promettrait une durabilité
 * qu'elle n'a pas. Hors ligne, chaque cible est donc `failed(offline)` — sans
 * aucun appel — et `retry` / `retryFailed` la relancent au retour du réseau.
 */

export type SendFailure =
  | { readonly kind: 'offline' }
  | { readonly kind: 'network' }
  | { readonly kind: 'download' }
  | { readonly kind: 'refused'; readonly status: number; readonly message: string; readonly code?: string };

export type TargetStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'sending' }
  | { readonly state: 'sent' }
  | { readonly state: 'failed'; readonly failure: SendFailure };

export type SendRunState = {
  readonly phase: 'idle' | 'running' | 'done';
  readonly order: readonly string[];
  readonly statuses: Readonly<Record<string, TargetStatus>>;
};

/** Un média téléversé comme `PostMedia` (TUS) — l'identité serveur d'un fichier publié. */
export type ReadyMedia = {
  readonly postMediaId: string;
  readonly fileUrl: string;
  readonly mimeType: string;
  readonly thumbHash?: string;
};

export type SendSheetPorts = {
  readonly online: () => boolean;
  readonly openDirect: (userId: string) => Promise<ApiResult<{ readonly id: string }>>;
  readonly forward: (params: {
    readonly messages: readonly ForwardSource[];
    readonly sourceConversationId?: string;
    readonly targetConversationId: string;
    readonly nextClientMessageId: () => string;
  }) => Promise<ForwardResult>;
  readonly sendMessage: (params: { readonly conversationId: string; readonly body: SendMessageBody }) => Promise<ApiResult<SentMessageAck>>;
  readonly uploadFiles: (files: readonly File[]) => Promise<ApiResult<{ readonly attachmentIds: readonly string[] }>>;
  readonly fetchFile: (media: { readonly url: string; readonly mime: string; readonly name: string }) => Promise<File | null>;
  readonly uploadMedia: (file: File) => Promise<ApiResult<ReadyMedia>>;
  readonly publishMedia: (params: { readonly format: PublishFormat; readonly media: ReadyMedia; readonly caption?: string }) => Promise<ApiResult<PublishedPost>>;
  readonly publishFromAttachment: (params: { readonly attachmentId: string; readonly target: PublishFormat; readonly content?: string }) => Promise<ApiResult<PublishedPost>>;
  readonly repost: (params: { readonly postId: string; readonly targetType: PublishFormat; readonly content?: string; readonly isQuote: boolean }) => Promise<ApiResult<PublishedPost>>;
  readonly createTextPost: (params: { readonly type: PublishFormat; readonly content: string }) => Promise<ApiResult<PublishedPost>>;
  readonly newClientMessageId: () => string;
};

export type SendRun = {
  readonly getState: () => SendRunState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Joue toutes les cibles, dans l'ordre. Ne rejette JAMAIS. */
  readonly start: () => Promise<void>;
  /** Rejoue UNE cible échouée, à partir de sa première étape non accomplie. */
  readonly retry: (key: string) => Promise<void>;
  readonly retryFailed: () => Promise<void>;
};

export const sentCountOf = (state: SendRunState): number =>
  Object.values(state.statuses).filter((status) => status.state === 'sent').length;

export const failedKeysOf = (state: SendRunState): readonly string[] =>
  state.order.filter((key) => state.statuses[key]?.state === 'failed');

/** Une étape qui s'arrête : la cible s'immobilise dessus, rejouable. */
class StepFailed extends Error {
  constructor(readonly failure: SendFailure) {
    super(failure.kind);
  }
}

const isTransportFailure = (failure: ApiFailure): boolean => failure.status === 0 || failure.code === 'TIMEOUT' || failure.code === 'ABORTED';

function failureOf(failure: ApiFailure): SendFailure {
  if (isTransportFailure(failure)) return { kind: 'network' };
  return {
    kind: 'refused',
    status: failure.status,
    message: failure.error,
    ...(failure.code === undefined ? {} : { code: failure.code }),
  };
}

const contentProp = (content: string | undefined): { readonly content?: string } => (content === undefined ? {} : { content });

type Shared = {
  files: Promise<readonly File[] | null> | null;
  attachmentIds: readonly string[] | null;
  firstMessageId: string | null;
  readonly media: Map<number, ReadyMedia>;
  readonly conversations: Map<string, string>;
  readonly completed: Map<string, number>;
  readonly clientIds: Map<string, string>;
};

export function createSendRun(params: {
  readonly entries: readonly SendPlanEntry[];
  readonly payload: SendPayload;
  /** La langue d'ORIGINE des messages que le moteur compose (légende, lien). */
  readonly language: string;
  readonly ports: SendSheetPorts;
}): SendRun {
  const { entries, payload, language, ports } = params;
  const order = entries.map((entry) => entry.key);
  let state: SendRunState = {
    phase: 'idle',
    order,
    statuses: Object.fromEntries(order.map((key): [string, TargetStatus] => [key, { state: 'idle' }])),
  };
  const listeners = new Set<() => void>();
  const shared: Shared = {
    files: null,
    attachmentIds: null,
    firstMessageId: null,
    media: new Map(),
    conversations: new Map(entries.flatMap((e) => (e.target.kind === 'conversation' ? [[e.key, e.target.conversationId] as const] : []))),
    completed: new Map(),
    clientIds: new Map(),
  };

  const publishState = (next: SendRunState): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const setStatus = (key: string, status: TargetStatus): void =>
    publishState({ ...state, statuses: { ...state.statuses, [key]: status } });

  const clientIdFor = (slot: string): string => {
    const known = shared.clientIds.get(slot);
    if (known !== undefined) return known;
    const fresh = ports.newClientMessageId();
    shared.clientIds.set(slot, fresh);
    return fresh;
  };

  const ensureFiles = (): Promise<readonly File[] | null> => {
    if (payload.kind === 'files') return Promise.resolve(payload.files);
    if (payload.kind !== 'media') return Promise.resolve(null);
    if (shared.files === null) {
      const download = ports
        .fetchFile({ url: payload.url, mime: payload.mime, name: payload.name })
        .then((file) => {
          if (file === null) shared.files = null;
          return file === null ? null : [file];
        })
        .catch(() => {
          shared.files = null;
          return null;
        });
      shared.files = download;
    }
    return shared.files;
  };

  const need = async <T,>(result: Promise<ApiResult<T>>): Promise<T> => {
    const settled = await result;
    if (!settled.ok) throw new StepFailed(failureOf(settled));
    return settled.data;
  };

  const conversationOf = (key: string): string => {
    const id = shared.conversations.get(key);
    if (id === undefined) throw new StepFailed({ kind: 'refused', status: 0, message: 'Conversation introuvable' });
    return id;
  };

  const send = async (key: string, slot: string, body: Omit<SendMessageBody, 'originalLanguage' | 'clientMessageId'>): Promise<SentMessageAck> =>
    need(
      ports.sendMessage({
        conversationId: conversationOf(key),
        body: { ...body, originalLanguage: language, clientMessageId: clientIdFor(slot) },
      }),
    );

  async function sendFiles(key: string, slot: string, content: string | undefined): Promise<void> {
    const files = await ensureFiles();
    if (files === null) throw new StepFailed({ kind: 'download' });
    if (shared.firstMessageId !== null) {
      await send(key, slot, { copyAttachmentsFromMessageId: shared.firstMessageId, ...contentProp(content) });
      return;
    }
    const attachmentIds = shared.attachmentIds ?? (await need(ports.uploadFiles(files))).attachmentIds;
    shared.attachmentIds = attachmentIds;
    const sent = await send(key, slot, { attachmentIds, ...contentProp(content) });
    shared.firstMessageId = sent.id;
  }

  async function publishFile(step: Extract<SendStep, { kind: 'publish-file' }>): Promise<void> {
    const files = await ensureFiles();
    const file = files?.[step.fileIndex];
    if (file === undefined) throw new StepFailed({ kind: 'download' });
    const known = shared.media.get(step.fileIndex);
    const media = known ?? (await need(ports.uploadMedia(file)));
    shared.media.set(step.fileIndex, media);
    await need(ports.publishMedia({ format: step.format, media, ...(step.caption === undefined ? {} : { caption: step.caption }) }));
  }

  async function playStep(key: string, index: number, step: SendStep): Promise<void> {
    const slot = `${key}#${index}`;
    switch (step.kind) {
      case 'open-direct': {
        const conversation = await need(ports.openDirect(step.userId));
        shared.conversations.set(key, conversation.id);
        return;
      }
      case 'forward': {
        let n = 0;
        const result = await ports.forward({
          messages: step.messages,
          sourceConversationId: step.sourceConversationId,
          targetConversationId: conversationOf(key),
          nextClientMessageId: () => clientIdFor(`${slot}/${(n += 1)}`),
        });
        if (!result.ok) throw new StepFailed({ kind: 'refused', status: 0, message: result.error });
        return;
      }
      case 'forward-attachment': {
        const body = forwardBodyOf({
          message: { id: step.messageId, content: '', originalLanguage: language },
          sourceConversationId: step.sourceConversationId,
          clientMessageId: clientIdFor(slot),
        });
        await need(ports.sendMessage({ conversationId: conversationOf(key), body }));
        return;
      }
      case 'copy-attachment':
        await send(key, slot, { copyAttachmentsFromMessageId: step.messageId, ...contentProp(step.content) });
        return;
      case 'text':
        await send(key, slot, { content: step.text });
        return;
      case 'send-files':
        return sendFiles(key, slot, step.content);
      case 'publish-attachment':
        await need(ports.publishFromAttachment({ attachmentId: step.attachmentId, target: step.format, ...contentProp(step.content) }));
        return;
      case 'repost':
        await need(ports.repost({ postId: step.postId, targetType: step.format, ...contentProp(step.content), isQuote: step.isQuote }));
        return;
      case 'publish-file':
        return publishFile(step);
      case 'publish-text':
        await need(ports.createTextPost({ type: step.format, content: step.content }));
        return;
    }
  }

  async function playTarget(entry: SendPlanEntry): Promise<void> {
    const { key, steps } = entry;
    setStatus(key, { state: 'sending' });
    try {
      for (let index = shared.completed.get(key) ?? 0; index < steps.length; index += 1) {
        if (!ports.online()) throw new StepFailed({ kind: 'offline' });
        const step = steps[index];
        if (step === undefined) continue;
        await playStep(key, index, step);
        shared.completed.set(key, index + 1);
      }
      setStatus(key, { state: 'sent' });
    } catch (error) {
      setStatus(key, { state: 'failed', failure: error instanceof StepFailed ? error.failure : { kind: 'network' } });
    }
  }

  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const next = queue.then(work, work);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  const entryOf = (key: string): SendPlanEntry | undefined => entries.find((entry) => entry.key === key);

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start: () =>
      enqueue(async () => {
        publishState({ ...state, phase: 'running' });
        for (const entry of entries) await playTarget(entry);
        publishState({ ...state, phase: 'done' });
      }),
    retry: (key) =>
      enqueue(async () => {
        const entry = entryOf(key);
        if (entry === undefined || state.statuses[key]?.state !== 'failed') return;
        publishState({ ...state, phase: 'running' });
        await playTarget(entry);
        publishState({ ...state, phase: 'done' });
      }),
    retryFailed: () =>
      enqueue(async () => {
        const failed = entries.filter((entry) => state.statuses[entry.key]?.state === 'failed');
        if (failed.length === 0) return;
        publishState({ ...state, phase: 'running' });
        for (const entry of failed) await playTarget(entry);
        publishState({ ...state, phase: 'done' });
      }),
  };
}
