/**
 * LA PILE E2EE VIVANTE du compte connecté (#14592) — chargée à la demande, à
 * l'ouverture d'une conversation chiffrée de bout en bout, jamais au démarrage.
 * Elle enrôle ce navigateur, rattrape les enveloppes en attente, écoute
 * `e2ee:envelope` sur la socket courante (et les suivantes), et publie ce qui
 * s'ouvre dans la mémoire du fil (`opened-messages.ts`). Une autre session (ou
 * aucune) la défait : plus aucun clair en mémoire.
 */
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { apiDeps } from '@/lib/api/deps';
import { watchLiveSocket } from '@/lib/api/realtime';
import { sessionStore } from '@/lib/api/session';

import { openE2EEClient, type E2EEClient } from './client';
import { decodeServedEnvelope, httpE2EEDirectory } from './directory';
import { loadLibsignalEngine } from './libsignal-engine';
import { forgetOpened, publishOpened, publishUndecryptable } from './opened-messages';
import type { OpenOutcome, PlaintextEntry } from './opener';
import { createRecordVault, defaultRecordLock, e2eeDatabaseName, indexedDbSealedBackend } from './record-vault';

type Running = { readonly userId: string; readonly client: Promise<E2EEClient>; readonly stop: () => void };

let running: Running | null = null;

const publishEntry = (messageId: string, entry: PlaintextEntry | null): void => {
  if (entry === null) return;
  if (entry.state === 'readable') {
    publishOpened(messageId, { text: entry.content.text ?? '', language: entry.content.language ?? null, senderUserId: entry.senderUserId });
  } else if (entry.state === 'undecryptable') {
    publishUndecryptable(messageId);
  }
};

const publishOutcome = (outcome: OpenOutcome): void => {
  if (outcome.kind === 'opened') publishEntry(outcome.messageId, outcome.entry);
  if (outcome.kind === 'undecryptable') publishUndecryptable(outcome.messageId);
};

/** Un journal SANS contenu : identifiants et types seulement. */
const warn = (message: string): void => console.warn(message);

const deviceLabel = (): string => 'Web';

function start(userId: string): Running {
  let unwatch: (() => void) | null = null;
  let stopped = false;
  const client = (async () => {
    const engine = await loadLibsignalEngine();
    const vault = createRecordVault({ backend: indexedDbSealedBackend({ name: e2eeDatabaseName(userId) }), lock: defaultRecordLock(`meeshy-e2ee-${userId}`) });
    const opened = await openE2EEClient({ engine, vault, directory: httpE2EEDirectory(apiDeps.transport), userId, label: deviceLabel(), warn });
    if (stopped) return opened;
    unwatch = watchLiveSocket((socket) => {
      const onEnvelope = (raw: unknown) => {
        const envelope = decodeServedEnvelope(raw);
        if (envelope === null) return;
        void opened.opener.receive(envelope).then(publishOutcome, () => undefined);
      };
      socket.on(SERVER_EVENTS.E2EE_ENVELOPE, onEnvelope);
      void opened.opener.catchUp().then((outcomes) => outcomes.forEach(publishOutcome), () => undefined);
      return () => socket.off(SERVER_EVENTS.E2EE_ENVELOPE, onEnvelope);
    });
    return opened;
  })();
  client.catch(() => {
    if (running?.client === client) running = null;
  });
  return {
    userId,
    client,
    stop: () => {
      stopped = true;
      unwatch?.();
    },
  };
}

/** La pile du compte : construite une fois, défaite quand la session change. */
export function e2eeClientFor(userId: string): Promise<E2EEClient> {
  if (running?.userId === userId) return running.client;
  running?.stop();
  forgetOpened();
  running = start(userId);
  return running.client;
}

/** Rend lisibles, depuis la base scellée, les messages du fil déjà ouverts sur ce navigateur. */
export async function hydrateOpened(userId: string, messageIds: readonly string[]): Promise<void> {
  const client = await e2eeClientFor(userId);
  for (const messageId of messageIds) publishEntry(messageId, await client.opener.entry(messageId));
}

sessionStore.subscribe((state) => {
  const userId = state.session.status === 'authenticated' ? state.session.user.id : null;
  if (running !== null && running.userId !== userId) {
    running.stop();
    running = null;
    forgetOpened();
  }
});
