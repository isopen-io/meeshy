import { describe, expect, test } from 'bun:test';

import { CLIENT_MESSAGE_ID_REGEX } from '@meeshy/shared/utils/client-message-id';

import { newClientMessageId } from './client-message-id';

describe('newClientMessageId', () => {
  test('satisfait CLIENT_MESSAGE_ID_REGEX (@meeshy/shared — parité de contrat, D-14)', () => {
    const id = newClientMessageId();
    expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
  });

  test('200 tirages ⇒ 200 valeurs distinctes', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newClientMessageId()));
    expect(ids.size).toBe(200);
  });

  test("n'appelle jamais crypto.randomUUID", () => {
    const original = globalThis.crypto;
    const getRandomValues = original.getRandomValues.bind(original);
    // Un `crypto` SANS `randomUUID` — si `newClientMessageId` en dépendait,
    // cet appel lèverait.
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues },
    });
    try {
      const id = newClientMessageId();
      expect(CLIENT_MESSAGE_ID_REGEX.test(id)).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original });
    }
  });
});
