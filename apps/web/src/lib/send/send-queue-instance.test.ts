import { describe, expect, test } from 'bun:test';

import type { SendQueue } from './send-queue';
import { startSendQueue } from './send-queue-instance';

/** La file de l'application : relue au lancement, rejouée au retour du réseau ET au retour d'un compte. */
function spyQueue(calls: string[]): SendQueue {
  return {
    submit: () => {
      throw new Error('non utilisé');
    },
    resume: async () => void calls.push('resume'),
    flush: async () => void calls.push('flush'),
    forget: async () => undefined,
    jobs: () => [],
    subscribe: () => () => undefined,
  };
}

describe('startSendQueue', () => {
  test('lancement : relit ; réseau revenu ou compte changé : rejoue', () => {
    const calls: string[] = [];
    const listeners: Record<string, () => void> = {};
    let accountChanged: () => void = () => undefined;
    startSendQueue(spyQueue(calls), { addEventListener: (type: string, listener: () => void) => void (listeners[type] = listener) } as never, (listener) => {
      accountChanged = listener;
    });
    expect(calls).toEqual(['resume']);
    listeners['online']?.();
    accountChanged();
    expect(calls).toEqual(['resume', 'flush', 'flush']);
  });
});
