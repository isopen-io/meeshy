import { describe, expect, test } from 'bun:test';

import type { QueuedSend } from './send-queue';
import type { SendRun, SendRunState, TargetStatus } from './send-sheet-run';
import { sendToastOf } from './send-toast';

/** D5 — après l'envoi : un toast, « Ouvrir » vers la seule conversation, jamais de navigation imposée. */
const queuedOf = (statuses: Record<string, TargetStatus>, phase: SendRunState['phase'] = 'done'): QueuedSend => {
  const state: SendRunState = { phase, order: Object.keys(statuses), statuses };
  const run = { getState: () => state } as unknown as SendRun;
  return { id: 'j', run, labels: { 'conversation:c1': 'Ana', 'contact:u2': 'Léa', 'publish:STORY': 'Ma story' } };
};

describe('sendToastOf', () => {
  test('une seule conversation : « Envoyé à Ana », et Ouvrir y mène', () => {
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'sent', conversationId: 'c1' } }))).toEqual({ kind: 'one', name: 'Ana', conversationId: 'c1' });
  });

  test('une conversation et une story : « Ouvrir » la conversation', () => {
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'sent', conversationId: 'c1' }, 'publish:STORY': { state: 'sent' } }))).toEqual({ kind: 'one', name: 'Ana', conversationId: 'c1' });
  });

  test('plusieurs conversations : un compte, sans « Ouvrir »', () => {
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'sent', conversationId: 'c1' }, 'contact:u2': { state: 'sent', conversationId: 'dm' } }))).toEqual({ kind: 'many', count: 2 });
  });

  test('rien tant qu’un envoi attend, ou qu’une cible a échoué', () => {
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'queued' } }))).toBeNull();
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'failed', failure: { kind: 'network' } } }))).toBeNull();
    expect(sendToastOf(queuedOf({ 'conversation:c1': { state: 'sending' } }, 'running'))).toBeNull();
  });
});
