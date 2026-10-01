import { describe, expect, test } from 'bun:test';

import type { SessionState } from '@/lib/api/session';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

import type { IncomingShare } from './incoming-share';
import { startNativeShareInbox, type NativeInboxDeps } from './native-runtime';

/**
 * LE PARTAGE REÇU PAR LA COQUE OUVRE LA FEUILLE D'ENVOI (#8884).
 *
 * Trois cas font un partage : l'application est ouverte et connectée (la
 * feuille s'ouvre), elle démarre à froid sur l'intent (le partage attend
 * l'écoute), ou l'utilisateur n'est pas connecté (le partage ATTEND la
 * connexion — le garder plutôt que l'écarter : la photo vient d'être choisie).
 */
const text = (value: string): IncomingShare => ({ files: [], text: value, title: '', url: '' });

type Status = SessionState['status'];

function harness(initial: Status, queue: (IncomingShare | null)[]) {
  let status = initial;
  const listeners = new Set<() => void>();
  let wake: () => void = () => undefined;
  const opened: SendSheetRequest[] = [];
  const deps: NativeInboxDeps = {
    coque: {},
    source: 'gateway',
    sessionStore: {
      getState: () => ({ session: { status } as SessionState }),
      subscribe: (listener) => {
        const wrapped = () => listener({ session: { status } as SessionState });
        listeners.add(wrapped);
        return () => listeners.delete(wrapped);
      },
    },
    read: async () => queue.shift() ?? null,
    listen: (_coque, onShare) => {
      wake = onShare;
      return true;
    },
    open: (request) => opened.push(request),
  };
  return {
    opened,
    deps,
    wake: () => wake(),
    signIn: () => {
      status = 'authenticated';
      listeners.forEach((listener) => listener());
    },
  };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('startNativeShareInbox', () => {
  test('connecté : le partage en attente au démarrage ouvre la feuille', async () => {
    const { deps, opened } = harness('authenticated', [text('Bonjour')]);
    expect(startNativeShareInbox(deps)).not.toBeNull();
    await settle();
    expect(opened).toEqual([{ intent: 'share', payload: { kind: 'text', text: 'Bonjour' } }]);
  });

  test('app ouverte : chaque réveil du pont ouvre la feuille sur le nouveau partage', async () => {
    const { deps, opened, wake } = harness('authenticated', [null, text('Un'), text('Deux')]);
    startNativeShareInbox(deps);
    await settle();
    wake();
    await settle();
    wake();
    await settle();
    expect(opened.map((request) => request.payload)).toEqual([
      { kind: 'text', text: 'Un' },
      { kind: 'text', text: 'Deux' },
    ]);
  });

  test('pas connecté : le partage attend la connexion, puis s’ouvre UNE fois', async () => {
    const { deps, opened, signIn } = harness('anonymous', [text('Bonjour')]);
    startNativeShareInbox(deps);
    await settle();
    expect(opened).toEqual([]);
    signIn();
    signIn();
    await settle();
    expect(opened).toHaveLength(1);
  });

  test('un second partage avant la connexion remplace le premier', async () => {
    const { deps, opened, wake, signIn } = harness('anonymous', [text('Un'), text('Deux')]);
    startNativeShareInbox(deps);
    await settle();
    wake();
    await settle();
    signIn();
    await settle();
    expect(opened.map((request) => request.payload)).toEqual([{ kind: 'text', text: 'Deux' }]);
  });

  test('sur les fixtures, aucune connexion à attendre', async () => {
    const { deps, opened } = harness('anonymous', [text('Bonjour')]);
    startNativeShareInbox({ ...deps, source: 'fixtures' });
    await settle();
    expect(opened).toHaveLength(1);
  });

  test('un partage vide n’ouvre rien', async () => {
    const { deps, opened } = harness('authenticated', [{ files: [], text: ' ', title: '', url: '' }]);
    startNativeShareInbox(deps);
    await settle();
    expect(opened).toEqual([]);
  });

  test('hors coque (aucun pont) : null, rien n’est lu', async () => {
    const { deps } = harness('authenticated', [text('x')]);
    let read = 0;
    expect(startNativeShareInbox({ ...deps, listen: () => false, read: async () => ((read += 1), null) })).toBeNull();
    await settle();
    expect(read).toBe(0);
  });

  test('l’arrêt retire l’abonnement à la session', async () => {
    const { deps, opened, signIn } = harness('anonymous', [text('Bonjour')]);
    const stop = startNativeShareInbox(deps);
    await settle();
    stop?.();
    signIn();
    await settle();
    expect(opened).toEqual([]);
  });
});
