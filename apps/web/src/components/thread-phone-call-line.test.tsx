import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import { loadPhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import { PHONE_CALL_STATES_QUERY_KEY, clearPhoneCallState, receivePhoneCallState } from '@/lib/phone-call/phone-call-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadPhoneCallLine } from './thread-phone-call-line';

/**
 * « EN APPEL » DANS L'EN-TÊTE D'UN DIRECT (#18753) — « En appel depuis 10 min » sous le nom du Sang, tant que l'état
 * est servi et non expiré ; il s'efface à `phone-call:ended`. Jamais un message de la conversation, jamais
 * d'interlocuteur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadPhoneCallCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const JACQUES = 'b'.repeat(24);
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

describe('la ligne « en appel » de l’en-tête', () => {
  test('un état servi se dit sous le nom, avec son glyphe, puis s’efface à la fin', async () => {
    const client = new QueryClient();
    receivePhoneCallState(client, { userId: JACQUES, since: new Date(Date.now() - 10 * 60_000 - 5_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }, Date.now());
    const host = await mount(<ThreadPhoneCallLine userId={JACQUES} language="fr" client={client} />);
    await settle();
    const line = host.querySelector('[data-thread-phone-call]');
    expect(line?.textContent).toBe('En appel depuis 10 min');
    expect(line?.querySelector('[data-call-glyph="active"]')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => clearPhoneCallState(client, JACQUES));
    await settle();
    expect(host.querySelector('[data-thread-phone-call]')).toBeNull();
  });

  test('un état expiré, relu d’un cache restauré, ne s’affiche pas', async () => {
    const client = new QueryClient();
    client.setQueryData(PHONE_CALL_STATES_QUERY_KEY, { [JACQUES]: { userId: JACQUES, since: new Date(Date.now() - 4 * 3_600_000).toISOString(), expiresAt: new Date(Date.now() - 60_000).toISOString() } });
    const host = await mount(<ThreadPhoneCallLine userId={JACQUES} language="fr" client={client} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });

  test('sans état, ou dans un groupe : rien', async () => {
    const host = await mount(<ThreadPhoneCallLine userId={undefined} language="fr" client={new QueryClient()} />);
    expect(host.innerHTML).toBe('');
  });
});
