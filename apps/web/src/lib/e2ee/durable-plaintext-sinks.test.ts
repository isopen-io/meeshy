import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { StoreApi } from 'zustand/vanilla';

import { createAppQueryClient, type StorageLike } from '@/lib/api/query-client';
import { createDeviceTranslationCache, type KeyValueStore } from '@/lib/device-translation/cache';
import { createDeviceTranslationScheduler, type OfferedMessage } from '@/lib/device-translation/scheduler';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { memoryDeviceRecords } from '@/lib/send/device-records';
import { createDraftStore } from '@/lib/send/draft-store';
import { localMessageOf } from '@/lib/send/local-message';
import { createOutboxDurability, outboxRecordKey } from '@/lib/send/outbox-durability';
import { createOutboxStore, type OutboxState } from '@/lib/send/outbox-store';
import { E2EE_PLAINTEXT_SENTINEL, sentinelLeaks } from '@/test-support/e2ee-plaintext-sentinel';

import { DURABLE_PLAINTEXT_SINKS } from './durable-plaintext-sinks';

/**
 * **AUCUN CLAIR DÉCHIFFRÉ N'ATTEINT UN STOCKAGE DURABLE DU NAVIGATEUR** (#18991).
 *
 * Le web aura bientôt du clair déchiffré sur l'appareil. Quatre stockages
 * DURABLES le recevraient en clair, au-delà de la session et dans l'étagère des
 * comptes — le cache de requêtes déshydraté, la traduction sur l'appareil, les
 * brouillons et la file d'envoi — et la coque écrit des aperçus de widgets que
 * le système sauvegarde (audit WEB-09, contre-analyse WEBX-05, WEBX-04).
 *
 * Il n'y a pas encore de clair : chaque témoin y fait entrer une SENTINELLE par
 * le chemin d'écriture normal du puits, pour une conversation fermée au clair
 * (`endToEndSealed`), et la cherche dans ce qui est rangé. Le jour où un
 * consommateur (le coffre, l'ouvreur, l'affichage) y laisse fuir un clair, le
 * témoin de son puits rougit — c'est la liste noire.
 */
const SEALED = 'c-chiffree';
const CLEAR = 'c-claire';
const seal = (conversationId: string): void => endToEndRegimeLedger.getState().learnEndToEnd(conversationId, 1);

const memoryStorage = (): StorageLike & { readonly raw: Map<string, string> } => {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => void raw.set(key, value),
    removeItem: (key) => void raw.delete(key),
  };
};

describe('la liste noire — chaque stockage durable qui peut porter le contenu d’une conversation est nommé', () => {
  test('les cinq puits connus, chacun avec le site qui le garde', () => {
    expect(DURABLE_PLAINTEXT_SINKS.map(({ id }) => id).sort()).toEqual(['device-translation', 'drafts', 'outbox', 'query-cache', 'shell-widgets']);
  });

  test('chaque site de garde existe et consulte la garde que la liste lui prête', () => {
    for (const { guardFile, guardCall } of DURABLE_PLAINTEXT_SINKS) {
      expect(readFileSync(new URL(`../../${guardFile}`, import.meta.url), 'utf8')).toContain(guardCall);
    }
  });
});

describe('le cache de requêtes déshydraté (`meeshy.query-cache`)', () => {
  test('le fil d’une conversation fermée au clair ne se range pas ; celui d’une conversation claire, si', () => {
    seal(SEALED);
    const storage = memoryStorage();
    const client = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });

    client.setQueryData(['conversations', SEALED, 'messages'], { pages: [[{ id: 'm1', content: E2EE_PLAINTEXT_SENTINEL }]] });
    client.setQueryData(['conversations', CLEAR, 'messages'], { pages: [[{ id: 'm2', content: 'bonjour en clair' }]] });
    client.persist();

    const written = [...storage.raw.values()].join('');
    expect(sentinelLeaks({ 'meeshy.query-cache': written })).toEqual([]);
    expect(written).toContain('bonjour en clair');
  });
});

describe('les brouillons (`meeshy.draft.*`)', () => {
  test('le brouillon d’une conversation fermée au clair reste en mémoire, jamais sur le disque', () => {
    seal(SEALED);
    const backend = memoryStorage();
    const drafts = createDraftStore(backend);

    drafts.setDraft('u_1', SEALED, { text: E2EE_PLAINTEXT_SENTINEL, language: 'fr', protection: {} });

    expect(drafts.getDraft('u_1', SEALED)?.text).toBe(E2EE_PLAINTEXT_SENTINEL);
    expect(sentinelLeaks(Object.fromEntries(backend.raw))).toEqual([]);
  });

  test('un brouillon rangé avant que la conversation se ferme quitte le disque à la première écriture', () => {
    const backend = memoryStorage();
    const drafts = createDraftStore(backend);
    drafts.setDraft('u_1', SEALED, { text: 'écrit en clair avant', language: 'fr', protection: {} });
    seal(SEALED);

    drafts.setDraft('u_1', SEALED, { text: E2EE_PLAINTEXT_SENTINEL, language: 'fr', protection: {} });

    expect([...backend.raw.keys()]).toEqual([]);
  });

  test('CONTRASTE — une conversation claire garde son brouillon au rechargement', () => {
    const backend = memoryStorage();
    createDraftStore(backend).setDraft('u_1', CLEAR, { text: 'à finir', language: 'fr', protection: {} });

    expect(createDraftStore(backend).getDraft('u_1', CLEAR)?.text).toBe('à finir');
  });
});

describe('la file d’envoi durable (`thread-outbox:*`)', () => {
  const entryFor = (conversationId: string, content: string) => ({
    message: localMessageOf({ clientMessageId: `cid-${conversationId}`, conversationId, viewerId: 'u-viewer', content, originalLanguage: 'fr', now: new Date(0) }),
    delivery: 'failed' as const,
    attempts: 1,
    startedAt: 1,
  });

  test('un envoi en file d’une conversation fermée au clair reste en mémoire ; celui d’une conversation claire survit au redémarrage', async () => {
    seal(SEALED);
    const records = memoryDeviceRecords();
    const outbox: StoreApi<OutboxState> = createOutboxStore();
    const durability = createOutboxDurability({ outbox, records, activeViewer: () => 'u-viewer', deps: () => { throw new Error('aucun rejeu ici'); } });
    await durability.start();

    outbox.getState().enqueue(SEALED, entryFor(SEALED, E2EE_PLAINTEXT_SENTINEL));
    outbox.getState().enqueue(CLEAR, entryFor(CLEAR, 'en clair, rejoué au retour du réseau'));
    await durability.settled();

    const stored = JSON.stringify(await records.load(outboxRecordKey('u-viewer')));
    expect(sentinelLeaks({ 'thread-outbox': stored })).toEqual([]);
    expect(stored).toContain('en clair, rejoué au retour du réseau');
    expect(outbox.getState().entries[SEALED]).toHaveLength(1);
  });
});

describe('la traduction sur l’appareil (`meeshy-device-translation`)', () => {
  const recordingStore = (): KeyValueStore & { readonly rows: Map<string, string> } => {
    const rows = new Map<string, string>();
    return { rows, get: async (key) => rows.get(key), set: async (key, value) => void rows.set(key, value) };
  };
  const offered = (over: Partial<OfferedMessage>): OfferedMessage => ({
    id: 'm1',
    conversationId: SEALED,
    content: E2EE_PLAINTEXT_SENTINEL,
    originalLanguage: 'sw',
    translatedLanguages: [],
    encrypted: false,
    shareable: false,
    sourceVersion: 'original',
    ...over,
  });

  test('la traduction d’un clair que le serveur ne lit pas est livrée et gardée en MÉMOIRE, jamais dans IndexedDB — ni elle, ni l’empreinte de son texte', async () => {
    const store = recordingStore();
    const delivered: string[] = [];
    const scheduler = createDeviceTranslationScheduler({
      translator: { supports: () => true, translate: async (text) => ({ text: `fr:${text}`, engine: 'test' }) },
      cache: createDeviceTranslationCache({ store }),
      deliver: (translation) => void delivered.push(translation.text),
    });

    scheduler.offer({ messages: [offered({})], preferredLanguages: ['fr'] });
    await scheduler.idle();
    scheduler.offer({ messages: [offered({})], preferredLanguages: ['fr'] });
    await scheduler.idle();

    expect(delivered).toEqual([`fr:${E2EE_PLAINTEXT_SENTINEL}`, `fr:${E2EE_PLAINTEXT_SENTINEL}`]);
    expect(store.rows.size).toBe(0);
  });

  test('CONTRASTE — la traduction d’un message que le serveur lit déjà se range, et ne se recalcule pas', async () => {
    const store = recordingStore();
    const scheduler = createDeviceTranslationScheduler({
      translator: { supports: () => true, translate: async (text) => ({ text: `fr:${text}`, engine: 'test' }) },
      cache: createDeviceTranslationCache({ store }),
      deliver: () => undefined,
    });

    scheduler.offer({ messages: [offered({ conversationId: CLEAR, content: 'habari', shareable: true })], preferredLanguages: ['fr'] });
    await scheduler.idle();

    expect(store.rows.size).toBe(1);
  });
});
