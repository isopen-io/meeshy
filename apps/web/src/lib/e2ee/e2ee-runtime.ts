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
import { appQueryClient } from '@/lib/api/query-client';
import type { Message, Participant } from '@/lib/api/types';
import type { LiveSocketWatcher } from '@/lib/api/live-socket-watchers';
import { sessionStore } from '@/lib/api/session';
import { outboxStore } from '@/lib/send/outbox-store';

import { openE2EEClient, type E2EEClient } from './client';
import { decodeServedEnvelope, httpE2EEDirectory } from './directory';
import { loadLibsignalEngine } from './libsignal-engine';
import type { OpenedSink } from './opened-messages';
import type { OpenOutcome, PlaintextEntry } from './opener';
import { createRecordVault, defaultRecordLock, e2eeDatabaseName, indexedDbSealedBackend } from './record-vault';
import { performEndToEndSend, type LocalBubbles } from './send';

type Running = { readonly userId: string; readonly sink: OpenedSink; readonly client: Promise<E2EEClient>; readonly stop: () => void };

let running: Running | null = null;

const publishEntry = (sink: OpenedSink, messageId: string, entry: PlaintextEntry | null): void => {
  if (entry === null) return;
  if (entry.state === 'readable') {
    sink.publishOpened(messageId, { text: entry.content.text ?? '', language: entry.content.language ?? null, senderUserId: entry.senderUserId });
  } else if (entry.state === 'undecryptable') {
    sink.publishUndecryptable(messageId);
  }
};

const publishOutcome = (sink: OpenedSink) => (outcome: OpenOutcome): void => {
  if (outcome.kind === 'opened') publishEntry(sink, outcome.messageId, outcome.entry);
  if (outcome.kind === 'undecryptable') sink.publishUndecryptable(outcome.messageId);
};

/** Un journal SANS contenu : identifiants et types seulement. */
const warn = (message: string): void => console.warn(message);

const deviceLabel = (): string => 'Web';

/** La connexion temps réel reste chargée à la demande (`budgets.json › realtime.dynamic_only`) : on s'y accroche par `import()`. */
const watchLiveSocket = async (watcher: LiveSocketWatcher): Promise<() => void> => (await import('@/lib/api/realtime')).watchLiveSocket(watcher);

function start(userId: string, sink: OpenedSink): Running {
  let unwatch: (() => void) | null = null;
  let stopped = false;
  const client = (async () => {
    const engine = await loadLibsignalEngine();
    const vault = createRecordVault({ backend: indexedDbSealedBackend({ name: e2eeDatabaseName(userId) }), lock: defaultRecordLock(`meeshy-e2ee-${userId}`) });
    const opened = await openE2EEClient({ engine, vault, directory: httpE2EEDirectory(apiDeps.transport), userId, label: deviceLabel(), warn });
    if (stopped) return opened;
    const detach = await watchLiveSocket((socket) => {
      const onEnvelope = (raw: unknown) => {
        const envelope = decodeServedEnvelope(raw);
        if (envelope === null) return;
        void opened.opener.receive(envelope).then(publishOutcome(sink), () => undefined);
      };
      socket.on(SERVER_EVENTS.E2EE_ENVELOPE, onEnvelope);
      void opened.opener.catchUp().then((outcomes) => outcomes.forEach(publishOutcome(sink)), () => undefined);
      return () => socket.off(SERVER_EVENTS.E2EE_ENVELOPE, onEnvelope);
    });
    if (stopped) detach();
    else unwatch = detach;
    return opened;
  })();
  client.catch(() => {
    if (running?.client === client) running = null;
  });
  return {
    userId,
    sink,
    client,
    stop: () => {
      stopped = true;
      unwatch?.();
    },
  };
}

/** La pile du compte : construite une fois, défaite quand la session change. */
export function e2eeClientFor(userId: string, sink: OpenedSink): Promise<E2EEClient> {
  if (running?.userId === userId) return running.client;
  running?.stop();
  sink.forgetOpened();
  running = start(userId, sink);
  return running.client;
}

/** Rend lisibles, depuis la base scellée, les messages du fil déjà ouverts sur ce navigateur. */
export async function hydrateOpened(userId: string, messageIds: readonly string[], sink: OpenedSink): Promise<void> {
  const client = await e2eeClientFor(userId, sink);
  for (const messageId of messageIds) publishEntry(sink, messageId, await client.opener.entry(messageId));
}

/** L'envoi scellé d'un texte de tête-à-tête, branché sur les singletons de l'application (`useSend`). */
export function sendEndToEnd(params: {
  readonly conversationId: string;
  readonly peerUserId: string;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly text: string;
  readonly language: string;
  readonly replyTo: Message | null;
  readonly regimeEpoch?: number;
  readonly opened: OpenedSink;
  readonly bubbles: LocalBubbles;
}): Promise<void> {
  return performEndToEndSend({
    conversationId: params.conversationId,
    peerUserId: params.peerUserId,
    viewerId: params.viewerId,
    ...(params.sender === undefined ? {} : { sender: params.sender }),
    draft: { text: params.text, language: params.language, replyTo: params.replyTo },
    ...(params.regimeEpoch === undefined ? {} : { regimeEpoch: params.regimeEpoch }),
    client: () => e2eeClientFor(params.viewerId, params.opened),
    transport: apiDeps.transport,
    queryClient: appQueryClient,
    outbox: outboxStore,
    opened: params.opened,
    bubbles: params.bubbles,
  });
}

sessionStore.subscribe((state) => {
  const userId = state.session.status === 'authenticated' ? state.session.user.id : null;
  if (running !== null && running.userId !== userId) {
    running.stop();
    running.sink.forgetOpened();
    running = null;
  }
});
