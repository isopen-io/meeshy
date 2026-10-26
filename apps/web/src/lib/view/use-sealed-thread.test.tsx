import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation, Message } from '@/lib/api/types';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { endToEndSealed } from './end-to-end-sealed';
import { useSealedThread } from './use-sealed-thread';

/**
 * Revue de sécurité #12992 (constat a) — LE FIL LIT TOUT CE QUE L'APPAREIL SAIT
 * du bout en bout : la retenue de #13099 et la photographie des clairs d'avant
 * l'apprentissage, pas seulement le mode et l'ère. Le hook du fil ouvert est le
 * seul chemin qui les relaie : un témoin au niveau de `endToEndRegimeOf` ne
 * rougirait pas s'il les oubliait.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  endToEndRegimeLedger.getState().reset();
});

const plain = (id: string, createdAt: string): Message =>
  ({
    id,
    conversationId: 'c-hook',
    senderId: 'p-bruno',
    content: `texte-${id}`,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEncrypted: false,
    translations: [],
    createdAt: new Date(createdAt),
  }) as unknown as Message;

const conversation = { id: 'c-hook', type: 'direct', encryptionMode: null } as unknown as Conversation;

function shown(messages: readonly Message[]): readonly Message[] {
  const seen: { current: readonly Message[] } = { current: [] };
  function Probe() {
    seen.current = useSealedThread({ conversationId: 'c-hook', conversation, messages }).messages;
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Probe />));
  return seen.current;
}

describe('le fil ouvert lit la retenue et la photographie du registre (#12992 × #13099)', () => {
  test('une conversation RETENUE par le registre scelle le clair du fil, même quand la page montrée ne porte pas le chiffré ambigu', () => {
    endToEndRegimeLedger.getState().holdSend('c-hook', true);
    const [message] = shown([plain('m-1', '2026-10-21T10:00:00.000Z')]);
    expect(endToEndSealed(message!)).toBe(true);
    expect(JSON.stringify(message)).not.toContain('texte-m-1');
  });

  test('apprise, un clair photographié avant l’apprentissage reste lisible ; un clair antidaté jamais vu, scellé', () => {
    /* La photographie d'abord : la surveillance du cache de l'application, abonnée au registre, en prendrait une vide à l'apprentissage. */
    endToEndRegimeLedger.getState().rememberClearBefore('c-hook', ['m-avant']);
    endToEndRegimeLedger.getState().learnEndToEnd('c-hook', Date.parse('2026-10-20T00:00:00.000Z'));
    const [kept, forged] = shown([plain('m-avant', '2026-10-01T00:00:00.000Z'), plain('m-antidate', '2026-10-02T00:00:00.000Z')]);
    expect(kept!.content).toBe('texte-m-avant');
    expect(endToEndSealed(forged!)).toBe(true);
  });
});
