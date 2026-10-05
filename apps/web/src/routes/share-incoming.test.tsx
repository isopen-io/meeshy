import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { sessionStore } from '@/lib/api/session';
import type { IncomingShare } from '@/lib/share-incoming/incoming-share';
import type { ShareEntryDeps } from '@/lib/share-incoming/web-entry';
import ShareIncomingScreen from '@/routes/share-incoming';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

/**
 * `/share` — la page où atterrit un partage venu d'une autre application
 * (#8884). Elle ne montre rien : elle ouvre la feuille d'envoi et s'efface.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/share' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
    sessionStore.getState().clearSession();
  });
  container.remove();
});

const received: IncomingShare = { files: [], text: 'Bonjour', title: '', url: '' };

async function mount() {
  const opened: unknown[] = [];
  const navigations: string[] = [];
  const deps: Pick<ShareEntryDeps, 'source' | 'take' | 'open' | 'navigate'> = {
    source: 'gateway',
    take: async () => received,
    open: (request) => opened.push(request),
    navigate: (path) => navigations.push(path),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ShareIncomingScreen deps={deps} />);
  });
  return { opened, navigations };
}

const signIn = () =>
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });

describe('/share', () => {
  test('connecté : ouvre la feuille d’envoi sur le partage reçu, puis retourne à l’accueil', async () => {
    signIn();
    const { opened, navigations } = await mount();
    expect(opened).toEqual([{ intent: 'share', payload: { kind: 'text', text: 'Bonjour' } }]);
    expect(navigations).toEqual(['/']);
  });

  test('pas connecté : envoie à la connexion et garde le partage pour le retour', async () => {
    const { opened, navigations } = await mount();
    expect(opened).toEqual([]);
    expect(navigations).toEqual(['/login?next=%2Fshare']);
  });

  test('ne montre aucun texte : la feuille est l’écran', async () => {
    signIn();
    await mount();
    expect(container.textContent).toBe('');
  });
});
