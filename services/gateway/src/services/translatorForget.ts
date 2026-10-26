/**
 * #13102 — L'OUBLI AU TRANSLATOR. Quand la passerelle efface une pièce ou le
 * contenu d'un message (vue unique brûlée, éphémère échu, message ou compte
 * supprimé), le translator efface ce qu'il en avait rangé dans Redis :
 * transcription, traductions, pistes TTS (`cache_forget`, translator
 * `services/cache_forget.py`).
 *
 * La demande ne porte que des IDENTIFIANTS : le translator indexe lui-même ce
 * qu'il range par pièce et par message. Aucun texte effacé ne voyage ni ne se
 * range ici. Elle est DURABLE : inscrite dans Redis (`translator:cache-forget`)
 * avant l'envoi, rejouée tant que le translator n'a pas acquitté
 * (`cache_forget_done`, même `requestId`) — translator absent, redémarré ou
 * message perdu compris — et abandonnée après sept jours, au-delà desquels le
 * cache du translator a expiré de lui-même (30 jours au plus).
 *
 * Tout échec est journalisé, jamais levé : un effacement côté passerelle ne
 * dépend jamais de la disponibilité du translator.
 */
import { randomUUID } from 'crypto';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { CacheForgetRequest } from './zmq-translation/types';

const logger = enhancedLogger.child({ module: 'translatorForget' });

export const FORGET_QUEUE_KEY = 'translator:cache-forget';
export const FORGET_RESEND_AFTER_MS = 60_000;
export const FORGET_GIVE_UP_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const OBJECT_ID = /^[0-9a-f]{24}$/;

type Pending = CacheForgetRequest & { readonly createdAt: number; readonly sentAt: number };

/** Le magasin des demandes en attente d'acquittement (un hachage Redis). */
export type ForgetQueueStore = {
  put(requestId: string, value: string): Promise<void>;
  remove(requestId: string): Promise<void>;
  all(): Promise<Readonly<Record<string, string>>>;
};

export type ForgetDeps = {
  readonly store: ForgetQueueStore | null;
  readonly send: (request: CacheForgetRequest) => Promise<void>;
  readonly now?: () => number;
};

export type TranslatorForget = {
  forget(ids: { readonly attachmentIds?: readonly string[]; readonly messageIds?: readonly string[] }): Promise<void>;
  acknowledge(requestId: string): Promise<void>;
  replay(): Promise<number>;
};

const idsOf = (values: readonly string[] | undefined): readonly string[] =>
  [...new Set((values ?? []).filter((id) => OBJECT_ID.test(id)))];

/** Un hachage Redis de la passerelle (`CacheStore.getNativeClient`). */
export function redisForgetQueue(client: {
  hset(key: string, field: string, value: string): Promise<unknown>;
  hdel(key: string, field: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
}): ForgetQueueStore {
  return {
    put: async (requestId, value) => { await client.hset(FORGET_QUEUE_KEY, requestId, value); },
    remove: async (requestId) => { await client.hdel(FORGET_QUEUE_KEY, requestId); },
    all: async () => (await client.hgetall(FORGET_QUEUE_KEY)) ?? {},
  };
}

function parsePending(raw: string): Pending | null {
  try {
    const value = JSON.parse(raw) as Partial<Pending>;
    if (typeof value.requestId !== 'string' || typeof value.createdAt !== 'number' || typeof value.sentAt !== 'number') return null;
    return { requestId: value.requestId, attachmentIds: idsOf(value.attachmentIds), messageIds: idsOf(value.messageIds), createdAt: value.createdAt, sentAt: value.sentAt };
  } catch {
    return null;
  }
}

export function translatorForget(deps: ForgetDeps): TranslatorForget {
  const now = deps.now ?? Date.now;
  const send = async (pending: Pending): Promise<void> => {
    await deps.store?.put(pending.requestId, JSON.stringify({ ...pending, sentAt: now() }));
    await deps.send({ requestId: pending.requestId, attachmentIds: pending.attachmentIds, messageIds: pending.messageIds });
  };
  return {
    forget: async (ids) => {
      const attachmentIds = idsOf(ids.attachmentIds);
      const messageIds = idsOf(ids.messageIds);
      if (attachmentIds.length === 0 && messageIds.length === 0) return;
      const pending: Pending = { requestId: randomUUID(), attachmentIds, messageIds, createdAt: now(), sentAt: now() };
      await send(pending).catch((error: unknown) =>
        logger.warn('oubli au translator différé : il sera rejoué', { pieces: attachmentIds.length, messages: messageIds.length, reason: error instanceof Error ? error.message : 'inconnu' })
      );
    },
    acknowledge: async (requestId) => {
      await deps.store?.remove(requestId).catch(() => undefined);
    },
    replay: async () => {
      if (!deps.store) return 0;
      const entries = Object.values(await deps.store.all()).map(parsePending).filter((entry): entry is Pending => entry !== null);
      const expired = entries.filter((entry) => now() - entry.createdAt > FORGET_GIVE_UP_AFTER_MS);
      await Promise.all(expired.map((entry) => deps.store!.remove(entry.requestId)));
      const due = entries.filter((entry) => !expired.includes(entry) && now() - entry.sentAt >= FORGET_RESEND_AFTER_MS);
      await Promise.all(due.map((entry) => send(entry).catch(() => undefined)));
      return due.length;
    },
  };
}

const state: { forget: TranslatorForget | null } = { forget: null };

/** Posé au démarrage, une fois le client ZMQ et Redis prêts ; absent dans les tests et les scripts. */
export function configureTranslatorForget(forget: TranslatorForget | null): void {
  state.forget = forget;
}

/** L'oubli du processus — un appelant sans oubli configuré n'oublie rien, sans lever. */
export async function forgetAtTranslator(ids: { readonly attachmentIds?: readonly string[]; readonly messageIds?: readonly string[] }): Promise<void> {
  await state.forget?.forget(ids).catch(() => undefined);
}
