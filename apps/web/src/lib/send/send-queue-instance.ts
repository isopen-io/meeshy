import { createSendQueue, idbSendQueueStorage, type SendQueue } from './send-queue';

/**
 * LA FILE D'ENVOI DE L'APPLICATION (#10948) — une seule, branchée sur
 * IndexedDB. Au lancement, `startSendQueue` relit ce qui n'était pas parti et
 * le rejoue ; au retour du réseau (`online`), elle vide la file dans l'ordre.
 *
 * Les VRAIS ports ne sont chargés que s'il y a un envoi à reprendre : une file
 * vide ne coûte qu'une lecture IndexedDB au démarrage.
 */
export const sendQueue: SendQueue = createSendQueue({
  storage: idbSendQueueStorage(),
  portsFor: async (language) => (await import('./send-sheet-ports')).createSendSheetPorts({ language }),
});

let started = false;

export function startSendQueue(queue: SendQueue = sendQueue, target: Pick<Window, 'addEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (started && queue === sendQueue) return;
  if (queue === sendQueue) started = true;
  void queue.resume();
  target?.addEventListener('online', () => void queue.flush());
}
