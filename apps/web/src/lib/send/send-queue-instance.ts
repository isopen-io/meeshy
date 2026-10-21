import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { createSendQueue, idbSendQueueStorage, type SendQueue } from './send-queue';

/**
 * LA FILE D'ENVOI DE L'APPLICATION (#10948) — une seule, branchée sur
 * IndexedDB. Au lancement, `startSendQueue` relit ce qui n'était pas parti et
 * le rejoue ; au retour du réseau (`online`) ou d'un compte, elle vide la file
 * dans l'ordre — et ne joue jamais que les envois du compte ACTIF.
 *
 * Les VRAIS ports ne sont chargés que s'il y a un envoi à reprendre : une file
 * vide ne coûte qu'une lecture IndexedDB au démarrage.
 */
const activeViewer = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id;

export const sendQueue: SendQueue = createSendQueue({
  storage: idbSendQueueStorage(),
  portsFor: async (language) => (await import('./send-sheet-ports')).createSendSheetPorts({ language }),
  activeViewer,
});

type AccountWatch = (listener: () => void) => void;

const watchActiveAccount: AccountWatch = (listener) => {
  let last = activeViewer();
  sessionStore.subscribe(() => {
    const next = activeViewer();
    if (next === last) return;
    last = next;
    listener();
  });
};

let started = false;

export function startSendQueue(
  queue: SendQueue = sendQueue,
  target: Pick<Window, 'addEventListener'> | undefined = typeof window === 'undefined' ? undefined : window,
  onAccountChange: AccountWatch = watchActiveAccount,
): void {
  if (started && queue === sendQueue) return;
  if (queue === sendQueue) started = true;
  void queue.resume();
  target?.addEventListener('online', () => void queue.flush());
  onAccountChange(() => void queue.flush());
}
