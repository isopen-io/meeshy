/**
 * Le push de CONTRÔLE `notification_revoked` reçu par les DEUX Service Workers.
 *
 * Quand le serveur retire une notification (réaction défaite, message / post
 * supprimé), il pousse un message data-only dont le seul effet attendu est
 * de FERMER la bannière déjà affichée — et de n'en afficher aucune à sa place.
 * Les deux workers portent la même règle, recopiée depuis
 * `utils/notification-revocation.ts` parce qu'un worker ne peut pas l'importer :
 * ce témoin exécute leur CODE SOURCE tel quel, comme
 * `sw.stale-response.test.ts` (même harnais : `new Function` sur le fichier lu,
 * globals injectés en doubles).
 */

import fs from 'fs';
import path from 'path';

// `new Function` exécute le CODE SOURCE inchangé de chaque worker, ses globals
// (`self`, `firebase`, …) injectés en paramètres. La source n'est PAS une
// entrée utilisateur : c'est le contenu, lu à un chemin fixe du dépôt, d'un
// fichier de PREMIÈRE PARTIE déjà committé — même justification, mot pour
// mot, que `sw.stale-response.test.ts`.

const N1 = '64d000000000000000000001';
const N2 = '64d000000000000000000002';
const CONV = '507f1f77bcf86cd799439021';

type Banner = { data: Record<string, string>; close: jest.Mock };
const banner = (data: Record<string, string>): Banner => ({ data, close: jest.fn() });

function fakeRegistration(shown: Banner[]) {
  return {
    scope: 'config=' + encodeURIComponent(JSON.stringify({ apiKey: 'k', projectId: 'p' })),
    showNotification: jest.fn(async () => {}),
    getNotifications: jest.fn(async () => shown),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// public/sw.js — listener `push` (Web Push brut)
// ─────────────────────────────────────────────────────────────────────────

function loadRootWorker(shown: Banner[]) {
  const source = fs.readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8');
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const registration = fakeRegistration(shown);
  const fakeSelf = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration,
    location: { origin: 'https://app.meeshy.me' },
  };
  const fakeCaches = { open: async () => ({}), keys: async () => [], delete: async () => true };
  const run = new Function('self', 'caches', 'fetch', 'Response', `${source}\n//# sourceURL=sw-under-test.js`);
  run(fakeSelf, fakeCaches, async () => ({}), class {});

  return {
    registration,
    dispatchPush: async (payload: unknown) => {
      const pending: Promise<unknown>[] = [];
      const event = { data: { json: () => payload }, waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
      for (const handler of listeners['push'] ?? []) handler(event);
      await Promise.all(pending);
    },
  };
}

describe('public/sw.js — push notification_revoked', () => {
  it('ferme la bannière révoquée, laisse les autres, et n’affiche RIEN', async () => {
    const revoked = banner({ notificationId: N1, conversationId: CONV });
    const kept = banner({ notificationId: N2, conversationId: CONV });
    const worker = loadRootWorker([revoked, kept]);

    await worker.dispatchPush({ data: { type: 'notification_revoked', notificationIds: N1, conversationIds: CONV } });

    expect(revoked.close).toHaveBeenCalledTimes(1);
    expect(kept.close).not.toHaveBeenCalled();
    expect(worker.registration.showNotification).not.toHaveBeenCalled();
  });

  it('un push ordinaire affiche toujours sa bannière', async () => {
    const worker = loadRootWorker([]);

    await worker.dispatchPush({ title: 'Alice', body: 'Salut', data: { notificationId: N1, conversationId: CONV } });

    expect(worker.registration.showNotification).toHaveBeenCalledWith('Alice', expect.objectContaining({ body: 'Salut' }));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// public/firebase-messaging-sw.js — `onBackgroundMessage` (FCM)
// ─────────────────────────────────────────────────────────────────────────

function loadFirebaseWorker(shown: Banner[]) {
  const source = fs.readFileSync(path.join(__dirname, '../../public/firebase-messaging-sw.js'), 'utf8');
  const registration = fakeRegistration(shown);
  const fakeSelf = {
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration,
    location: { origin: 'https://app.meeshy.me' },
  };
  let backgroundHandler: ((payload: unknown) => Promise<unknown> | void) | null = null;
  const fakeFirebase = {
    initializeApp: () => {},
    messaging: Object.assign(
      () => ({ onBackgroundMessage: (handler: (payload: unknown) => Promise<unknown> | void) => { backgroundHandler = handler; } }),
      { isSupported: () => true }
    ),
  };
  const run = new Function(
    'self',
    'importScripts',
    'firebase',
    'navigator',
    'clients',
    `${source}\n//# sourceURL=firebase-messaging-sw-under-test.js`
  );
  run(fakeSelf, () => {}, fakeFirebase, {}, fakeSelf.clients);
  if (!backgroundHandler) throw new Error('firebase-messaging-sw.js n’a pas enregistré onBackgroundMessage');

  return {
    registration,
    receive: async (payload: unknown) => backgroundHandler!(payload),
  };
}

describe('public/firebase-messaging-sw.js — push notification_revoked', () => {
  it('ferme la bannière révoquée, laisse les autres, et n’affiche RIEN', async () => {
    const revoked = banner({ notificationId: N1, conversationId: CONV });
    const kept = banner({ notificationId: N2, conversationId: CONV });
    const worker = loadFirebaseWorker([revoked, kept]);

    await worker.receive({ data: { type: 'notification_revoked', notificationIds: N1, conversationIds: CONV } });

    expect(revoked.close).toHaveBeenCalledTimes(1);
    expect(kept.close).not.toHaveBeenCalled();
    expect(worker.registration.showNotification).not.toHaveBeenCalled();
  });

  /**
   * Une bannière SANS `notificationId` (agrégée par conversation) ne peut être
   * désignée que par sa conversation ; celle qui en a une ne l'est jamais pour
   * sa seule conversation.
   */
  it('ferme par conversation la seule bannière sans identité de notification', async () => {
    const aggregated = banner({ conversationId: CONV });
    const identified = banner({ notificationId: N2, conversationId: CONV });
    const worker = loadFirebaseWorker([aggregated, identified]);

    await worker.receive({ data: { type: 'notification_revoked', notificationIds: N1, conversationIds: CONV } });

    expect(aggregated.close).toHaveBeenCalledTimes(1);
    expect(identified.close).not.toHaveBeenCalled();
  });

  it('un push ordinaire affiche toujours sa bannière, indexée par conversation', async () => {
    const worker = loadFirebaseWorker([]);

    await worker.receive({ notification: { title: 'Alice', body: 'Salut' }, data: { notificationId: N1, conversationId: CONV } });

    expect(worker.registration.showNotification).toHaveBeenCalledWith(
      'Alice',
      expect.objectContaining({ body: 'Salut', tag: CONV, data: { notificationId: N1, conversationId: CONV } })
    );
  });
});
