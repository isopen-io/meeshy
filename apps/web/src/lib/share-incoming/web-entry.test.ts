import { describe, expect, test } from 'bun:test';

import { landingAfterSession } from '@/lib/session-guard';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import type { IncomingShare } from './incoming-share';
import { enterSharedContent, type ShareEntryDeps } from './web-entry';

/**
 * L'ADRESSE `/share` — l'arrivée d'un partage système sur la PWA (#8884).
 * Connecté : la feuille s'ouvre sur le contenu reçu, l'adresse retourne à
 * l'accueil. Pas connecté : le partage ATTEND (le worker l'a rangé, il n'est
 * pas lu) et la connexion ramène ici.
 */
const share = (parts: Partial<IncomingShare> = {}): IncomingShare => ({ files: [], text: 'Bonjour', title: '', url: '', ...parts });

type Trace = { readonly opened: SendSheetRequest[]; readonly navigations: { readonly path: string; readonly replace: boolean }[]; taken: number };

function harness(overrides: Partial<ShareEntryDeps> & { readonly received?: IncomingShare | null } = {}) {
  const trace: Trace = { opened: [], navigations: [], taken: 0 };
  const deps: ShareEntryDeps = {
    sessionStatus: 'authenticated',
    source: 'gateway',
    take: async () => {
      trace.taken += 1;
      return overrides.received === undefined ? share() : overrides.received;
    },
    open: (request) => trace.opened.push(request),
    navigate: (path, replace) => trace.navigations.push({ path, replace }),
    ...overrides,
  };
  return { trace, run: () => enterSharedContent(deps) };
}

describe('enterSharedContent — ouvrir la feuille sur ce qu’on vient de partager', () => {
  test('connecté : la feuille s’ouvre en « partager » et l’adresse retourne à l’accueil', async () => {
    const { trace, run } = harness();
    expect(await run()).toBe('opened');
    expect(trace.opened).toEqual([{ intent: 'share', payload: { kind: 'text', text: 'Bonjour' } }]);
    expect(trace.navigations).toEqual([{ path: '/', replace: true }]);
  });

  test('des fichiers reçus ouvrent la feuille sur les fichiers', async () => {
    const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const { trace, run } = harness({ received: share({ files: [photo], text: '' }) });
    await run();
    expect(trace.opened[0]?.payload).toEqual({ kind: 'files', files: [photo] });
  });

  test('un lien reçu offre « plus d’options » avec son adresse', async () => {
    const { trace, run } = harness({ received: share({ text: 'À lire', url: 'https://exemple.org/a' }) });
    await run();
    expect(trace.opened[0]?.moreOptions).toEqual({ url: 'https://exemple.org/a' });
  });

  test('pas connecté : le partage n’est PAS lu, la connexion ramène sur /share', async () => {
    for (const sessionStatus of ['anonymous', 'pending2fa', 'guest'] as const) {
      const { trace, run } = harness({ sessionStatus });
      expect(await run()).toBe('login');
      expect(trace.taken).toBe(0);
      expect(trace.opened).toEqual([]);
      const [{ path, replace }] = trace.navigations as [{ path: string; replace: boolean }];
      expect(replace).toBe(true);
      expect(path.startsWith('/login?next=')).toBe(true);
      expect(landingAfterSession(new URL(path, 'https://meeshy.me').searchParams.get('next'), '/')).toBe('/share');
    }
  });

  test('sur les fixtures, aucune session à exiger', async () => {
    const { trace, run } = harness({ sessionStatus: 'anonymous', source: 'fixtures' });
    expect(await run()).toBe('opened');
    expect(trace.opened).toHaveLength(1);
  });

  test('rien de reçu (adresse rouverte, partage purgé) : retour à l’accueil, aucune feuille', async () => {
    for (const received of [null, share({ text: ' ' })]) {
      const { trace, run } = harness({ received });
      expect(await run()).toBe('empty');
      expect(trace.opened).toEqual([]);
      expect(trace.navigations).toEqual([{ path: '/', replace: true }]);
    }
  });
});
