import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { loadInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import { clearInactivityState, receiveInactivityState } from '@/lib/inactivity/inactivity-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadInactivityLine } from './thread-inactivity-line';

/**
 * L'ALERTE D'INACTIVITÉ DANS L'EN-TÊTE D'UN DIRECT (#18738) — « Aucune activité depuis 08:00 » sous le nom du Sang,
 * tant que l'alerte est servie ; elle s'efface à `inactivity:cleared`. Jamais un message de la conversation.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInactivityCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const JACQUES = 'b'.repeat(24);

describe('la ligne d’inactivité de l’en-tête', () => {
  test('une alerte servie se dit sous le nom, puis s’efface au retour', async () => {
    const client = new QueryClient();
    receiveInactivityState(client, { userId: JACQUES, inactiveSince: new Date(Date.now() - 60_000).toISOString(), alertedAt: new Date().toISOString() }, Date.now());
    const host = await mount(<ThreadInactivityLine userId={JACQUES} language="fr" client={client} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(host.querySelector('[data-thread-inactivity]')?.textContent?.startsWith('Aucune activité depuis ')).toBe(true);
    await act(async () => clearInactivityState(client, JACQUES));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(host.querySelector('[data-thread-inactivity]')).toBeNull();
  });

  test('sans alerte, ou dans un groupe : rien', async () => {
    const host = await mount(<ThreadInactivityLine userId={undefined} language="fr" client={new QueryClient()} />);
    expect(host.innerHTML).toBe('');
  });
});
