import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { imposedReplyProtection } from '@meeshy/shared/utils/reply-protection-contagion';

import { message } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { EPHEMERAL_AFTER_READ_SECONDS } from './compose-protection';
import { localMessageOf } from './local-message';
import { contaminatedComposeProtection, imposedLocksOf } from './reply-contagion';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const { BLURRED, EPHEMERAL, EPHEMERAL_AFTER_READ, VIEW_ONCE } = MESSAGE_EFFECT_FLAGS;

function quotedOf(overrides: Partial<Message>): Message {
  return message({
    id: 'm-cite',
    senderId: 'u-2',
    content: 'secret',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-09-28T09:00:00.000Z'),
    ...overrides,
  });
}

const blurredAfterRead = quotedOf({ isBlurred: true, effectFlags: BLURRED | EPHEMERAL | EPHEMERAL_AFTER_READ });
const blurredOnly = quotedOf({ isBlurred: true, effectFlags: BLURRED });
const fiveMinutes = quotedOf({ effectFlags: EPHEMERAL, ephemeralDuration: 300 });
const ordinary = quotedOf({});

describe('contaminatedComposeProtection — ce que la citation impose au composeur (#8557)', () => {
  test('un message flou + flamme-œil impose le flou ET la flamme-œil', () => {
    expect(contaminatedComposeProtection({}, imposedReplyProtection(blurredAfterRead))).toEqual({
      blurred: true,
      ephemeralSeconds: EPHEMERAL_AFTER_READ_SECONDS,
    });
  });

  test('la durée citée REMPLACE celle que la réponse avait choisie', () => {
    expect(contaminatedComposeProtection({ ephemeralSeconds: 15 }, imposedReplyProtection(fiveMinutes))).toEqual({
      ephemeralSeconds: 300,
    });
  });

  test('une réponse contaminée par le flou garde la durée qu’elle AJOUTE', () => {
    expect(contaminatedComposeProtection({ ephemeralSeconds: 60 }, imposedReplyProtection(blurredOnly))).toEqual({
      ephemeralSeconds: 60,
      blurred: true,
    });
  });

  test('un message ordinaire n’impose rien : la protection passe INCHANGÉE', () => {
    const own = { viewOnce: true, effectFlags: 4 };
    expect(contaminatedComposeProtection(own, imposedReplyProtection(ordinary))).toBe(own);
  });

  test('les verrous suivent ce qui est imposé', () => {
    expect(imposedLocksOf(imposedReplyProtection(blurredAfterRead))).toEqual({ blurred: true, ephemeral: true });
    expect(imposedLocksOf(imposedReplyProtection(blurredOnly))).toEqual({ blurred: true, ephemeral: false });
    expect(imposedLocksOf(imposedReplyProtection(ordinary))).toEqual({ blurred: false, ephemeral: false });
  });
});

describe('localMessageOf — la bulle optimiste porte les bits contaminés (#8557)', () => {
  const now = new Date('2026-09-28T10:00:00.000Z');
  const base = {
    clientMessageId: 'cid_c',
    conversationId: 'c-a',
    viewerId: 'u-viewer',
    content: 'ma réponse',
    originalLanguage: 'fr',
    now,
  } as const;

  test('réponse à un message flou + flamme-œil ⇒ floue + flamme-œil, sans échéance', () => {
    const local = localMessageOf({ ...base, replyToId: blurredAfterRead.id, replyTo: blurredAfterRead });
    expect(local.isBlurred).toBe(true);
    expect((local.effectFlags ?? 0) & (BLURRED | EPHEMERAL | EPHEMERAL_AFTER_READ)).toBe(BLURRED | EPHEMERAL | EPHEMERAL_AFTER_READ);
    expect(local.expiresAt).toBeUndefined();
    expect(local.ephemeralDuration).toBeUndefined();
  });

  test('la durée citée remplace la durée choisie — une DURÉE, jamais une échéance (#8905)', () => {
    const local = localMessageOf({ ...base, replyToId: fiveMinutes.id, replyTo: fiveMinutes, protection: { ephemeralSeconds: 15 } });
    expect(local.ephemeralDuration).toBe(300);
    expect(local.expiresAt).toBeUndefined();
    expect((local.effectFlags ?? 0) & EPHEMERAL).toBe(EPHEMERAL);
  });

  test('le flou imposé survit à la vue unique AJOUTÉE (le serveur garde les deux)', () => {
    const local = localMessageOf({ ...base, replyToId: blurredOnly.id, replyTo: blurredOnly, protection: { viewOnce: true } });
    expect(local.isBlurred).toBe(true);
    expect(local.isViewOnce).toBe(true);
    expect((local.effectFlags ?? 0) & (BLURRED | VIEW_ONCE)).toBe(BLURRED | VIEW_ONCE);
  });

  test('réponse à un message ordinaire ⇒ rien d’imposé', () => {
    const local = localMessageOf({ ...base, replyToId: ordinary.id, replyTo: ordinary });
    expect(local.isBlurred).toBe(false);
    expect(local.effectFlags).toBeUndefined();
    expect(local.expiresAt).toBeUndefined();
  });
});
