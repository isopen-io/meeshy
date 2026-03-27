import type { InterpellationType } from './interpellation-detector';

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function jitter(value: number, percent: number = 0.2): number {
  return Math.max(1_000, value + value * randomBetween(-percent, percent));
}

function apparitionDelayMs(lastUserMessageAgoMs: number): number {
  if (lastUserMessageAgoMs < 2 * 60_000) return randomBetween(0, 5_000);
  if (lastUserMessageAgoMs < 30 * 60_000) return randomBetween(10_000, 30_000);
  if (lastUserMessageAgoMs < 2 * 3_600_000) return randomBetween(30_000, 90_000);
  return randomBetween(60_000, 180_000);
}

function readingDelayMs(unreadCount: number): number {
  return Math.min(unreadCount * randomBetween(1_500, 2_500), 20_000);
}

function typingDelayMs(wordCount: number): number {
  const perWord = randomBetween(800, 1_500);
  return Math.max(2_000, Math.min(wordCount * perWord, 60_000));
}

export function calculateResponseDelay(input: {
  interpellationType: InterpellationType;
  wordCount: number;
  lastUserMessageAgoMs: number;
  unreadMessageCount: number;
}): number {
  const { interpellationType, wordCount, lastUserMessageAgoMs, unreadMessageCount } = input;

  if (interpellationType === 'greeting') {
    return Math.round(jitter(Math.max(2_000, Math.min(typingDelayMs(wordCount), 20_000))));
  }

  const apparition = apparitionDelayMs(lastUserMessageAgoMs);
  const reading = readingDelayMs(unreadMessageCount);
  const typing = typingDelayMs(wordCount);

  const total = apparition + reading + typing;

  if (interpellationType === 'reply' || interpellationType === 'mention') {
    return Math.round(jitter(Math.min(total, 90_000)));
  }

  return Math.round(jitter(total));
}
