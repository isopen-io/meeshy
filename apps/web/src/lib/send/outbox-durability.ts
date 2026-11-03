import type { StoreApi } from 'zustand/vanilla';

import { attachmentPreviewOf } from './attachments';
import type { DeviceRecords } from './device-records';
import type { OutboxEntry, OutboxState } from './outbox-store';
import { retrySend, type SendDeps } from './perform-send';

/**
 * LA FILE DES ENVOIS DU FIL, DURABLE (#14698, jumelle web de #14696) — l'outbox
 * reste le magasin en mémoire que lisent les bulles (`outbox-store.ts`) ; ce
 * module lui ajoute ce que l'appareil hors ligne exige :
 *
 * - **Elle survit au redémarrage.** Chaque changement écrit les envois du
 *   compte ACTIF dans la base des envois (`device-records.ts`, IndexedDB garde
 *   les `File`). Au lancement, ils reviennent sous leur MÊME `clientMessageId`,
 *   leur aperçu reconstruit depuis le fichier (une URL `blob:` ne survit pas à
 *   l'onglet). Un envoi qui était en vol à la fermeture revient en file.
 * - **Elle part dans l'ordre au retour du réseau.** `flush` rejoue, en FIFO
 *   toutes conversations confondues, ce qui n'a jamais atteint la passerelle
 *   (posé hors ligne, ou coupé en route) ; il s'arrête à la première coupure
 *   et garde le reste à sa place. Un refus tranché (4xx) ou une erreur serveur
 *   ne se rejoue pas seul : la bulle garde son « Réessayer ».
 * - **Elle n'appartient qu'à son compte.** Rien ne s'écrit sous un compte dont
 *   la file n'a pas encore été relue, donc changer de compte n'efface jamais
 *   celle du précédent.
 */
export const outboxRecordKey = (viewerId: string): string => `thread-outbox:${viewerId}`;

type StoredOutbox = Readonly<Record<string, readonly OutboxEntry[]>>;

export type OutboxDurability = {
  /** Relit la file du compte actif et la rejoue si le réseau répond. */
  readonly start: () => Promise<void>;
  /** Le réseau est revenu : rejoue, dans l'ordre, ce qui attendait. */
  readonly flush: () => Promise<void>;
  /** Le compte quitte l'appareil : sa file aussi. */
  readonly forget: (viewerId: string) => Promise<void>;
  /** TÉMOIN — les écritures en cours sont faites. */
  readonly settled: () => Promise<void>;
};

const neverReachedServer = (entry: OutboxEntry): boolean =>
  entry.delivery === 'failed' && (entry.lastError === undefined || entry.lastError.status === 0);

export const queuedSendsInOrder = (state: OutboxState): readonly { readonly conversationId: string; readonly entry: OutboxEntry }[] =>
  Object.entries(state.entries)
    .flatMap(([conversationId, entries]) => entries.filter(neverReachedServer).map((entry) => ({ conversationId, entry })))
    .sort((a, b) => a.entry.startedAt - b.entry.startedAt);

const withoutLocalPreviews = (entry: OutboxEntry): OutboxEntry => {
  const { attachments: _previews, ...message } = entry.message;
  return { ...entry, message };
};

const revived = (entry: OutboxEntry): OutboxEntry => ({
  ...entry,
  delivery: 'failed',
  message: entry.upload === undefined ? entry.message : { ...entry.message, attachments: entry.upload.files.map(attachmentPreviewOf) },
});

const storedOf = (state: OutboxState): StoredOutbox | undefined => {
  const rows = Object.fromEntries(
    Object.entries(state.entries)
      .filter(([, entries]) => entries.length > 0)
      .map(([conversationId, entries]) => [conversationId, entries.map(withoutLocalPreviews)]),
  );
  return Object.keys(rows).length === 0 ? undefined : rows;
};

const isStoredOutbox = (value: unknown): value is StoredOutbox =>
  typeof value === 'object' && value !== null && Object.values(value).every(Array.isArray);

const merged = (state: OutboxState, stored: StoredOutbox): OutboxState['entries'] =>
  Object.entries(stored).reduce<OutboxState['entries']>((entries, [conversationId, rows]) => {
    const present = new Set((entries[conversationId] ?? []).map((entry) => entry.message.clientMessageId));
    const missing = rows.filter((entry) => !present.has(entry.message.clientMessageId)).map(revived);
    if (missing.length === 0) return entries;
    const next = [...missing, ...(entries[conversationId] ?? [])].sort((a, b) => a.startedAt - b.startedAt);
    return { ...entries, [conversationId]: next };
  }, state.entries);

const stillCutOff = (outbox: StoreApi<OutboxState>, conversationId: string, clientMessageId: string): boolean => {
  const entry = outbox.getState().entries[conversationId]?.find((e) => e.message.clientMessageId === clientMessageId);
  return entry !== undefined && neverReachedServer(entry);
};

export function createOutboxDurability(params: {
  readonly outbox: StoreApi<OutboxState>;
  readonly records: DeviceRecords;
  readonly activeViewer: () => string | null;
  /** Lu à chaque rejeu : `online` est celui de l'instant. */
  readonly deps: () => SendDeps;
}): OutboxDurability {
  const { outbox, records, activeViewer } = params;
  let restoredFor: string | null = null;
  let writing: Promise<void> = Promise.resolve();
  let replaying: Promise<void> | null = null;

  const write = (work: () => Promise<void>): void => {
    writing = writing.then(work).catch(() => undefined);
  };

  outbox.subscribe((state) => {
    const viewer = activeViewer();
    if (viewer === null || viewer !== restoredFor) return;
    const rows = storedOf(state);
    write(() => records.save(outboxRecordKey(viewer), rows));
  });

  const replay = async (): Promise<void> => {
    const queued = queuedSendsInOrder(outbox.getState());
    for (const { conversationId, entry } of queued) {
      const deps = params.deps();
      if (!deps.online) return;
      await retrySend({ conversationId, clientMessageId: entry.message.clientMessageId, deps });
      if (stillCutOff(outbox, conversationId, entry.message.clientMessageId)) return;
    }
  };

  const flush = (): Promise<void> => {
    replaying ??= replay().finally(() => {
      replaying = null;
    });
    return replaying;
  };

  const start = async (): Promise<void> => {
    const viewer = activeViewer();
    if (viewer === null || viewer === restoredFor) return flush();
    restoredFor = null;
    const stored = await records.load(outboxRecordKey(viewer)).catch(() => undefined);
    if (activeViewer() !== viewer) return;
    restoredFor = viewer;
    if (isStoredOutbox(stored)) outbox.setState((state) => ({ entries: merged(state, stored) }));
    return flush();
  };

  const forget = async (viewerId: string): Promise<void> => {
    if (restoredFor === viewerId) restoredFor = null;
    write(() => records.save(outboxRecordKey(viewerId), undefined));
    await writing;
  };

  return { start, flush, forget, settled: () => writing };
}
