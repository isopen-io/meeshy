import { forwardBodyOf, type ForwardResult, type ForwardSource } from '@/lib/api/forward';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { canSendPlaintext, E2EE_PLAINTEXT_WITHHELD } from '@/lib/end-to-end-regime-ledger';
import type { SendMessageBody, SentMessageAck } from '@/lib/api/messages';
import type { PublishedPost } from '@/lib/api/share-publish';

import type { PublishFormat, SendPayload, SendPlanEntry, SendStep } from './send-sheet-plan';

/**
 * LE MOTEUR D'EXÉCUTION D'UN ENVOI (#8884, #10948) — joue le plan de
 * `send-sheet-plan` cible par cible, à PORTS INJECTÉS : ce fichier n'importe
 * aucun réseau. `send-sheet-ports.ts` branche les vrais ; les témoins des
 * factices.
 *
 * **SÉQUENTIEL, dans l'ordre choisi** : la première cible qui réussit
 * téléverse, les suivantes copient côté serveur ; le seau d'écriture de la
 * passerelle est ménagé.
 *
 * **Le rejeu ne renvoie JAMAIS ce qui est parti.** Chaque cible mémorise
 * combien de ses étapes sont accomplies, et chaque étape fige son
 * `clientMessageId` : un envoi dont l'accusé s'est perdu se rejoue sous le MÊME
 * identifiant, que la passerelle dédoublonne.
 *
 * **Hors ligne, rien n'est refusé : la cible passe « En file »** (`queued`),
 * sans aucun appel. Tout ce que le rejeu exige vit dans un INSTANTANÉ
 * (`snapshot()`, `resume`) que la file durable (`send-queue.ts`) écrit dans
 * IndexedDB à chaque progrès : fermer la feuille, puis l'application, ne perd
 * rien, et le retour du réseau reprend où l'on s'était arrêté.
 */

export type SendFailure =
  | { readonly kind: 'network' }
  | { readonly kind: 'download' }
  /** Passagère (session à rafraîchir, délai, limite, panne serveur) : rejouable, jamais effacée. */
  | { readonly kind: 'unavailable'; readonly status: number }
  | { readonly kind: 'refused'; readonly status: number; readonly message: string; readonly code?: string };

export type TargetStatus =
  | { readonly state: 'idle' }
  | { readonly state: 'queued' }
  | { readonly state: 'sending' }
  | { readonly state: 'sent'; readonly conversationId?: string }
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

/** Ce qu'un message de fichiers a déjà coûté : ses pièces, et le premier message qui les porte (copié ensuite). */
type Upload = { readonly attachmentIds: readonly string[] | null; readonly firstMessageId: string | null };

/** TOUT ce qu'un rejeu exige, sérialisable (IndexedDB) — jamais une promesse, jamais une fonction. */
export type SendRunSnapshot = {
  readonly statuses: Readonly<Record<string, TargetStatus>>;
  readonly completed: Readonly<Record<string, number>>;
  readonly clientIds: Readonly<Record<string, string>>;
  readonly conversations: Readonly<Record<string, string>>;
  readonly uploads: Readonly<Record<string, Upload>>;
  readonly media: Readonly<Record<string, ReadyMedia>>;
};

export type SendSheetPorts = {
  readonly online: () => boolean;
  readonly openDirect: (userId: string) => Promise<ApiResult<{ readonly id: string }>>;
  readonly openGroup: (params: { readonly userIds: readonly string[]; readonly title: string }) => Promise<ApiResult<{ readonly id: string }>>;
  readonly forward: (params: {
    readonly messages: readonly ForwardSource[];
    readonly sourceConversationId?: string;
    readonly targetConversationId: string;
    readonly nextClientMessageId: () => string;
    readonly ephemeralDuration?: number;
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
  /** Joue toutes les cibles qui ne sont pas parties, dans l'ordre. Ne rejette JAMAIS. */
  readonly start: () => Promise<void>;
  /** Rejoue UNE cible échouée, à partir de sa première étape non accomplie. */
  readonly retry: (key: string) => Promise<void>;
  /** Rejoue les cibles échouées sur un motif rejouable ET celles en file. */
  readonly retryFailed: () => Promise<void>;
  readonly snapshot: () => SendRunSnapshot;
};

export const sentCountOf = (state: SendRunState): number =>
  Object.values(state.statuses).filter((status) => status.state === 'sent').length;

export const failedKeysOf = (state: SendRunState): readonly string[] =>
  state.order.filter((key) => state.statuses[key]?.state === 'failed');

export const queuedKeysOf = (state: SendRunState): readonly string[] =>
  state.order.filter((key) => state.statuses[key]?.state === 'queued');

/** La cible n'est pas finie : ni envoyée, ni refusée pour de bon. */
export const pendingKeysOf = (state: SendRunState): readonly string[] =>
  state.order.filter((key) => {
    const status = state.statuses[key];
    return status === undefined || status.state === 'idle' || status.state === 'queued' || status.state === 'sending' || (status.state === 'failed' && status.failure.kind !== 'refused');
  });

class StepFailed extends Error {
  constructor(readonly failure: SendFailure) {
    super(failure.kind);
  }
}

/** Le réseau est tombé pendant l'étape : la cible retourne en file, sans motif. */
class WentOffline extends Error {}

const isTransportFailure = (failure: ApiFailure): boolean => failure.status === 0 || failure.code === 'TIMEOUT' || failure.code === 'ABORTED';

/** 401 : le jeton se rafraîchit ou la session revient ; 408, 429, 5xx : le serveur dira oui plus tard. */
const isPassing = (status: number): boolean => status === 401 || status === 408 || status === 429 || status >= 500;

function refusalOf(status: number, message: string, code: string | undefined): SendFailure {
  if (isPassing(status)) return { kind: 'unavailable', status };
  return { kind: 'refused', status, message, ...(code === undefined ? {} : { code }) };
}

function failureOf(failure: ApiFailure): SendFailure {
  if (isTransportFailure(failure)) return { kind: 'network' };
  return refusalOf(failure.status, failure.error, failure.code);
}

const contentProp = (content: string | undefined): { readonly content?: string } => (content === undefined ? {} : { content });

const uploadKeyOf = (indexes: readonly number[]): string => indexes.join(',');

/** Ce qui était en vol au moment de l'instantané n'a pas fini : il redevient en file. */
const settledStatus = (status: TargetStatus): TargetStatus => (status.state === 'sending' || status.state === 'idle' ? { state: 'queued' } : status);

export function createSendRun(params: {
  readonly entries: readonly SendPlanEntry[];
  readonly payload: SendPayload;
  /** La langue d'ORIGINE des messages que le moteur compose (légende, lien). */
  readonly language: string;
  readonly ports: SendSheetPorts;
  /** L'instantané d'un envoi interrompu (file durable). */
  readonly resume?: SendRunSnapshot;
  /** Prévenu à chaque progrès — la file durable y écrit son instantané. */
  readonly onProgress?: (snapshot: SendRunSnapshot) => void;
}): SendRun {
  const { entries, payload, language, ports } = params;
  const order = entries.map((entry) => entry.key);
  const resumed = params.resume;
  let state: SendRunState = {
    phase: 'idle',
    order,
    statuses: Object.fromEntries(
      order.map((key): [string, TargetStatus] => [key, resumed?.statuses[key] === undefined ? { state: 'idle' } : settledStatus(resumed.statuses[key])]),
    ),
  };
  const listeners = new Set<() => void>();
  const completed = new Map(Object.entries(resumed?.completed ?? {}));
  const clientIds = new Map(Object.entries(resumed?.clientIds ?? {}));
  const conversations = new Map<string, string>([
    ...entries.flatMap((entry) => (entry.target.kind === 'conversation' ? [[entry.key, entry.target.conversationId] as const] : [])),
    ...Object.entries(resumed?.conversations ?? {}),
  ]);
  const uploads = new Map(Object.entries(resumed?.uploads ?? {}));
  const media = new Map(Object.entries(resumed?.media ?? {}));
  let downloaded: Promise<readonly File[] | null> | null = null;

  const snapshot = (): SendRunSnapshot => ({
    statuses: state.statuses,
    completed: Object.fromEntries(completed),
    clientIds: Object.fromEntries(clientIds),
    conversations: Object.fromEntries(conversations),
    uploads: Object.fromEntries(uploads),
    media: Object.fromEntries(media),
  });

  const publishState = (next: SendRunState): void => {
    state = next;
    listeners.forEach((listener) => listener());
    params.onProgress?.(snapshot());
  };
  const setStatus = (key: string, status: TargetStatus): void => publishState({ ...state, statuses: { ...state.statuses, [key]: status } });

  const clientIdFor = (slot: string): string => {
    const known = clientIds.get(slot);
    if (known !== undefined) return known;
    const fresh = ports.newClientMessageId();
    clientIds.set(slot, fresh);
    return fresh;
  };

  const ensureFiles = (): Promise<readonly File[] | null> => {
    if (payload.kind === 'files') return Promise.resolve(payload.files);
    if (payload.kind !== 'media') return Promise.resolve(null);
    if (downloaded === null) {
      downloaded = ports
        .fetchFile({ url: payload.url, mime: payload.mime, name: payload.name })
        .then((file) => {
          if (file === null) downloaded = null;
          return file === null ? null : [file];
        })
        .catch(() => {
          downloaded = null;
          return null;
        });
    }
    return downloaded;
  };

  const need = async <T,>(result: Promise<ApiResult<T>>): Promise<T> => {
    const settled = await result;
    if (!settled.ok) {
      const failure = failureOf(settled);
      if (failure.kind === 'network' && !ports.online()) throw new WentOffline();
      throw new StepFailed(failure);
    }
    return settled.data;
  };

  /* #12949 — toute étape vers une conversation (texte, fichiers, transfert)
     la résout ici, AVANT de téléverser ou d'envoyer : une conversation vue
     chiffrée de bout en bout ne reçoit rien en clair. */
  const conversationOf = (key: string): string => {
    const id = conversations.get(key);
    if (id === undefined) throw new StepFailed({ kind: 'refused', status: 0, message: 'Conversation introuvable' });
    if (!canSendPlaintext({ conversationId: id })) {
      throw new StepFailed({ kind: 'refused', status: 0, message: 'Conversation chiffrée de bout en bout', code: E2EE_PLAINTEXT_WITHHELD });
    }
    return id;
  };

  const send = async (key: string, slot: string, body: Omit<SendMessageBody, 'originalLanguage' | 'clientMessageId'>): Promise<SentMessageAck> =>
    need(ports.sendMessage({ conversationId: conversationOf(key), body: { ...body, originalLanguage: language, clientMessageId: clientIdFor(slot) } }));

  async function sendFiles(key: string, slot: string, step: Extract<SendStep, { kind: 'send-files' }>): Promise<void> {
    conversationOf(key);
    const all = await ensureFiles();
    const picked = all === null ? null : step.indexes.map((index) => all[index]).filter((file): file is File => file !== undefined);
    if (picked === null || picked.length !== step.indexes.length) throw new StepFailed({ kind: 'download' });
    const uploadKey = uploadKeyOf(step.indexes);
    const known = uploads.get(uploadKey);
    if (known?.firstMessageId !== undefined && known.firstMessageId !== null) {
      await send(key, slot, { copyAttachmentsFromMessageId: known.firstMessageId, ...contentProp(step.content) });
      return;
    }
    const attachmentIds = known?.attachmentIds ?? (await need(ports.uploadFiles(picked))).attachmentIds;
    uploads.set(uploadKey, { attachmentIds, firstMessageId: null });
    const sent = await send(key, slot, { attachmentIds, ...contentProp(step.content) });
    uploads.set(uploadKey, { attachmentIds, firstMessageId: sent.id });
  }

  async function publishFile(step: Extract<SendStep, { kind: 'publish-file' }>): Promise<void> {
    const files = await ensureFiles();
    const file = files?.[step.fileIndex];
    if (file === undefined) throw new StepFailed({ kind: 'download' });
    const mediaKey = String(step.fileIndex);
    const ready = media.get(mediaKey) ?? (await need(ports.uploadMedia(file)));
    media.set(mediaKey, ready);
    await need(ports.publishMedia({ format: step.format, media: ready, ...(step.caption === undefined ? {} : { caption: step.caption }) }));
  }

  async function playStep(key: string, index: number, step: SendStep): Promise<void> {
    const slot = `${key}#${index}`;
    switch (step.kind) {
      case 'open-direct': {
        const opened = await need(ports.openDirect(step.userId));
        conversations.set(key, opened.id);
        return;
      }
      case 'open-group': {
        const opened = await need(ports.openGroup({ userIds: step.userIds, title: step.title }));
        conversations.set(key, opened.id);
        return;
      }
      case 'forward': {
        let n = 0;
        const result = await ports.forward({
          messages: step.messages,
          sourceConversationId: step.sourceConversationId,
          targetConversationId: conversationOf(key),
          nextClientMessageId: () => clientIdFor(`${slot}/${(n += 1)}`),
          ...(step.ephemeralDuration === undefined ? {} : { ephemeralDuration: step.ephemeralDuration }),
        });
        if (result.ok) return;
        const transport = result.status === 0;
        if (transport && !ports.online()) throw new WentOffline();
        throw new StepFailed(transport ? { kind: 'network' } : refusalOf(result.status ?? 0, result.error, result.code));
      }
      case 'forward-attachment': {
        const body = forwardBodyOf({
          message: { id: step.messageId, content: '', originalLanguage: language },
          sourceConversationId: step.sourceConversationId,
          clientMessageId: clientIdFor(slot),
          forwardedAttachmentIds: [step.attachmentId],
        });
        await need(ports.sendMessage({ conversationId: conversationOf(key), body }));
        return;
      }
      case 'text':
        await send(key, slot, { content: step.text });
        return;
      case 'send-files':
        return sendFiles(key, slot, step);
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
    if (!ports.online()) {
      setStatus(key, { state: 'queued' });
      return;
    }
    setStatus(key, { state: 'sending' });
    try {
      for (let index = completed.get(key) ?? 0; index < steps.length; index += 1) {
        if (!ports.online()) throw new WentOffline();
        const step = steps[index];
        if (step === undefined) continue;
        await playStep(key, index, step);
        completed.set(key, index + 1);
      }
      const conversationId = conversations.get(key);
      setStatus(key, { state: 'sent', ...(conversationId === undefined ? {} : { conversationId }) });
    } catch (error) {
      if (error instanceof WentOffline) {
        setStatus(key, { state: 'queued' });
        return;
      }
      setStatus(key, { state: 'failed', failure: error instanceof StepFailed ? error.failure : { kind: 'network' } });
    }
  }

  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const next = queue.then(work, work);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const playAll = async (picked: readonly SendPlanEntry[]): Promise<void> => {
    if (picked.length === 0) return;
    publishState({ ...state, phase: 'running' });
    for (const entry of picked) await playTarget(entry);
    publishState({ ...state, phase: 'done' });
  };

  const isReplayable = (key: string): boolean => {
    const status = state.statuses[key];
    return status?.state === 'queued' || (status?.state === 'failed' && status.failure.kind !== 'refused');
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    start: () => enqueue(() => playAll(entries.filter((entry) => state.statuses[entry.key]?.state !== 'sent' && state.statuses[entry.key]?.state !== 'failed'))),
    retry: (key) =>
      enqueue(async () => {
        const entry = entries.find((candidate) => candidate.key === key);
        const status = state.statuses[key];
        if (entry === undefined || (status?.state !== 'failed' && status?.state !== 'queued')) return;
        await playAll([entry]);
      }),
    retryFailed: () => enqueue(() => playAll(entries.filter((entry) => isReplayable(entry.key)))),
    snapshot,
  };
}
