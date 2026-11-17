import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { act } from 'react';

import { sessionStore, type AuthenticatedSession } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadLinkFamiliesCatalog } from '@/lib/i18n-link-families-catalog';
import { LINK_ANNOUNCE_MS } from '@/lib/links/link-copy';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import LinksScreen from './links';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();
const copied: string[] = [];

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadLinkFamiliesCatalog('fr')]);
  ensureHappyDomRegistered({ url: 'http://localhost/links' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
  sessionStore.setState({
    session: { status: 'authenticated', token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER, user: { id: 'u1', username: 'aissa', displayName: 'Aïssa' } } as unknown as AuthenticatedSession,
  });
});
afterAll(async () => {
  sessionStore.setState({ session: { status: 'anonymous' } });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  jest.useRealTimers();
  unmountAll();
});

const announcement = (host: ParentNode) => host.querySelector('[data-links-announcement]')?.textContent ?? null;

describe('copier mon lien de profil depuis la face Liens', () => {
  test('la copie se dit avec les mots des autres liens, puis l’annonce s’efface', async () => {
    const host = await mount(<LinksScreen />);
    const button = host.querySelector<HTMLButtonElement>('[data-links-profile-action="copy"] button');
    expect(button).not.toBeNull();
    jest.useFakeTimers();
    await act(async () => {
      button?.click();
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    });
    expect(copied.at(-1)).toBe('https://meeshy.me/u/aissa');
    expect(announcement(host)).toBe('Lien copié');
    act(() => jest.advanceTimersByTime(LINK_ANNOUNCE_MS + 50));
    expect(announcement(host)).toBe('');
  });
});
