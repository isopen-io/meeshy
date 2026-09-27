import { describe, expect, test } from 'bun:test';

import { FEEDBACK_COOLDOWN_MS, feedbackCooldown } from './call-feedback-cooldown';

const memoryStorage = () => {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
  };
};

describe('feedbackCooldown — au plus une demande de note par jour glissant', () => {
  test('la première demande passe et ouvre la fenêtre', () => {
    const cooldown = feedbackCooldown(memoryStorage());
    expect(cooldown.claim(1_000)).toBe(true);
  });

  test('une seconde demande dans les 24 h est retenue, et passe au-delà', () => {
    const cooldown = feedbackCooldown(memoryStorage());
    expect(cooldown.claim(1_000)).toBe(true);
    expect(cooldown.claim(1_000 + FEEDBACK_COOLDOWN_MS - 1)).toBe(false);
    expect(cooldown.claim(1_000 + FEEDBACK_COOLDOWN_MS)).toBe(true);
  });

  test('une valeur illisible ne bloque jamais la demande', () => {
    const storage = memoryStorage();
    storage.setItem('meeshy.call-feedback.last-prompt-at', 'pas-une-date');
    expect(feedbackCooldown(storage).claim(5_000)).toBe(true);
  });

  test('une horloge revenue en arrière ne condamne pas la demande pour toujours', () => {
    const storage = memoryStorage();
    storage.setItem('meeshy.call-feedback.last-prompt-at', String(10 * FEEDBACK_COOLDOWN_MS));
    expect(feedbackCooldown(storage).claim(1_000)).toBe(true);
  });
});
