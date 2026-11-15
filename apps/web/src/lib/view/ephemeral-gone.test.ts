import { afterEach, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { DESTRUCTION_MS } from './ephemeral-destruction';
import { isEphemeralGone, livingMessages, nextEphemeralGoneAt } from './ephemeral-gone';
import {
  configureEphemeralReceptionStorage,
  noteEphemeralReception,
  receptionOf,
  resetEphemeralReception,
  resolveEphemeralDeadline,
  type ReceptionStorage,
} from './ephemeral-reception';

/**
 * **UN ÉPHÉMÈRE ÉCHU DISPARAÎT VRAIMENT** (#8900) — la réception survit au
 * rechargement, et la loi « partie » se lit sans horloge murale : chaque
 * témoin reçoit son `now`.
 */

const RECEPTION = Date.parse('2026-09-30T10:00:00.000Z');
const MINUTE = 60_000;

function memoryStorage(): ReceptionStorage & { readonly raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key) => raw.get(key) ?? null,
    setItem: (key, value) => {
      raw.set(key, value);
    },
    removeItem: (key) => {
      raw.delete(key);
    },
  };
}

function messageOf(partial: Partial<Message> = {}): Message {
  return {
    id: 'm-ephemere',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'Le code est 4817.',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date(RECEPTION),
    ...partial,
  } as unknown as Message;
}

const notMine = (): boolean => false;

afterEach(() => {
  configureEphemeralReceptionStorage(null, RECEPTION);
  resetEphemeralReception();
});

describe('la réception d’un éphémère survit au rechargement (#8900, trou 2)', () => {
  test('un éphémère reçu par socket ne revit pas une durée entière après rechargement', () => {
    const storage = memoryStorage();
    configureEphemeralReceptionStorage(storage, RECEPTION);
    const message = messageOf({ ephemeralDuration: 60 });
    resolveEphemeralDeadline({ message, isMine: false, now: RECEPTION });

    configureEphemeralReceptionStorage(storage, RECEPTION + 2 * MINUTE);

    expect(resolveEphemeralDeadline({ message, isMine: false, now: RECEPTION + 2 * MINUTE })).toEqual({
      state: 'scheduled',
      expiresAtMs: RECEPTION + MINUTE,
    });
  });

  test('le registre relu est PURGÉ des réceptions au-delà de la rétention', () => {
    const storage = memoryStorage();
    configureEphemeralReceptionStorage(storage, RECEPTION);
    noteEphemeralReception('m-ancien', RECEPTION);
    noteEphemeralReception('m-recent', RECEPTION + 8 * 24 * 60 * MINUTE);

    configureEphemeralReceptionStorage(storage, RECEPTION + 8 * 24 * 60 * MINUTE);

    expect(receptionOf('m-ancien')).toBeNull();
    expect(receptionOf('m-recent')).toBe(RECEPTION + 8 * 24 * 60 * MINUTE);
    expect(storage.raw.get('meeshy.ephemeral-receptions') ?? '').not.toContain('m-ancien');
  });

  test('un stockage qui refuse ne casse rien : le registre tient en mémoire', () => {
    const refusing: ReceptionStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    configureEphemeralReceptionStorage(refusing, RECEPTION);
    noteEphemeralReception('m-a', RECEPTION);
    expect(receptionOf('m-a')).toBe(RECEPTION);
  });

  test('une entrée corrompue est ignorée, jamais fatale', () => {
    const storage = memoryStorage();
    storage.raw.set('meeshy.ephemeral-receptions', '{"m-a":"hier","m-b":' + String(RECEPTION) + '}');
    configureEphemeralReceptionStorage(storage, RECEPTION);
    expect(receptionOf('m-a')).toBeNull();
    expect(receptionOf('m-b')).toBe(RECEPTION);
  });
});

describe('la loi « partie » (#8900, trou 3)', () => {
  test('échéance servie passée depuis plus que la combustion ⇒ partie', () => {
    const message = messageOf({ ephemeralDuration: 60, expiresAt: new Date(RECEPTION) });
    expect(isEphemeralGone({ message, isMine: false, now: RECEPTION + DESTRUCTION_MS })).toBe(true);
    expect(isEphemeralGone({ message, isMine: false, now: RECEPTION + DESTRUCTION_MS - 1 })).toBe(false);
  });

  test('la lecture de la loi ne pose AUCUNE réception : un message jamais peint ne décompte pas', () => {
    const message = messageOf({ ephemeralDuration: 60 });
    expect(isEphemeralGone({ message, isMine: false, now: RECEPTION })).toBe(false);
    expect(receptionOf(message.id)).toBeNull();
  });

  test('livingMessages retire la rangée partie, garde celle qui brûle et le reste du fil', () => {
    noteEphemeralReception('m-parti', RECEPTION - 2 * MINUTE);
    noteEphemeralReception('m-brule', RECEPTION - MINUTE);
    const parti = messageOf({ id: 'm-parti', ephemeralDuration: 60 });
    const brule = messageOf({ id: 'm-brule', ephemeralDuration: 60 });
    const ordinaire = messageOf({ id: 'm-ordinaire' });

    const living = livingMessages({
      messages: [parti, brule, ordinaire],
      isMine: notMine,
      now: RECEPTION,
      destroyingIds: new Set(),
      expiredIds: new Set(),
    });

    expect(living.map((m) => m.id)).toEqual(['m-brule', 'm-ordinaire']);
  });

  test('livingMessages rend la MÊME identité quand rien ne part — la mémoïsation du fil tient', () => {
    const messages = [messageOf({ id: 'm-ordinaire' })];
    const living = livingMessages({ messages, isMine: notMine, now: RECEPTION, destroyingIds: new Set(), expiredIds: new Set() });
    expect(living).toBe(messages);
  });

  test('une rangée retirée par l’écran (`expiredIds`) quitte le fil', () => {
    const messages = [messageOf({ id: 'm-a', ephemeralDuration: 60 })];
    const living = livingMessages({ messages, isMine: notMine, now: RECEPTION, destroyingIds: new Set(), expiredIds: new Set(['m-a']) });
    expect(living).toEqual([]);
  });

  test('nextEphemeralGoneAt : l’instant où la prochaine rangée vivante part, combustion comprise', () => {
    noteEphemeralReception('m-a', RECEPTION);
    noteEphemeralReception('m-b', RECEPTION + MINUTE);
    const messages = [messageOf({ id: 'm-b', ephemeralDuration: 60 }), messageOf({ id: 'm-a', ephemeralDuration: 60 }), messageOf({ id: 'm-o' })];
    expect(nextEphemeralGoneAt({ messages, isMine: notMine, now: RECEPTION, destroyingIds: new Set() })).toBe(RECEPTION + MINUTE + DESTRUCTION_MS);
  });

  test('nextEphemeralGoneAt : rien à attendre sans échéance, ni pour une rangée qui brûle déjà', () => {
    noteEphemeralReception('m-a', RECEPTION);
    const messages = [messageOf({ id: 'm-a', ephemeralDuration: 60 }), messageOf({ id: 'm-o' })];
    expect(nextEphemeralGoneAt({ messages, isMine: notMine, now: RECEPTION, destroyingIds: new Set(['m-a']) })).toBeNull();
    expect(nextEphemeralGoneAt({ messages: [messageOf({ id: 'm-o' })], isMine: notMine, now: RECEPTION, destroyingIds: new Set() })).toBeNull();
  });
});
