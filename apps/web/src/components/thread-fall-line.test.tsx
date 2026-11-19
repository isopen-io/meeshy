import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { clearFallState, receiveFallState } from '@/lib/fall/fall-live';
import { loadFallCatalog } from '@/lib/i18n-fall-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadFallLine } from './thread-fall-line';

/**
 * LA CHUTE DÉTECTÉE DANS L'EN-TÊTE D'UN DIRECT (#18748) — « Chute détectée à 16:42 » sous le nom du Sang, tant que
 * l'épisode est servi ; elle s'efface à `fall:cleared`. Jamais un message de la conversation.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadFallCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const AWA = 'b'.repeat(24);

describe('la ligne de chute de l’en-tête', () => {
  test('une chute servie se dit sous le nom, puis s’efface à la levée', async () => {
    const client = new QueryClient();
    receiveFallState(client, { userId: AWA, detectedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, Date.now());
    const host = await mount(<ThreadFallLine userId={AWA} language="fr" client={client} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(host.querySelector('[data-thread-fall]')?.textContent?.startsWith('Chute détectée à ')).toBe(true);
    await act(async () => clearFallState(client, AWA));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(host.querySelector('[data-thread-fall]')).toBeNull();
  });

  test('un épisode expiré ne se dit plus', async () => {
    const client = new QueryClient();
    receiveFallState(client, { userId: AWA, detectedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 20).toISOString() }, Date.now());
    await new Promise((resolve) => setTimeout(resolve, 40));
    const host = await mount(<ThreadFallLine userId={AWA} language="fr" client={client} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(host.querySelector('[data-thread-fall]')).toBeNull();
  });

  test('sans chute, ou dans un groupe : rien', async () => {
    const host = await mount(<ThreadFallLine userId={undefined} language="fr" client={new QueryClient()} />);
    expect(host.innerHTML).toBe('');
  });
});
