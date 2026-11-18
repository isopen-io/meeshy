import { apiDeps } from '@/lib/api/deps';
import { ownedApiDeps, ownedPostMediaUploadDeps } from '@/lib/api/owned-deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { idbDeviceRecords } from './device-records';
import { createOutboxDurability, type OutboxDurability } from './outbox-durability';
import { outboxStore } from './outbox-store';
import { sendTransfer } from './send-transfer-instance';

/**
 * LA FILE DURABLE DU FIL DE L'APPLICATION (#14698) — branchée sur l'outbox
 * partagée et sur IndexedDB. Au lancement elle relit les envois du compte
 * actif ; au retour du réseau (`online`) ou d'un compte, elle les rejoue dans
 * l'ordre.
 */
const activeViewer = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id;

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine);

/** Les dépendances d'une reprise, liées au compte qui la lance (audit #19352, X1) : téléverser puis envoyer restent à lui. */
export const durableSendDeps = () => ({ ...ownedApiDeps(), queryClient: appQueryClient, outbox: outboxStore, online: isOnline(), transfer: { ...sendTransfer, media: ownedPostMediaUploadDeps() } });

export const outboxDurability: OutboxDurability = createOutboxDurability({
  outbox: outboxStore,
  records: idbDeviceRecords(),
  activeViewer,
  deps: durableSendDeps,
});

let started = false;

export function startOutboxDurability(target: Pick<Window, 'addEventListener'> | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (started) return;
  started = true;
  void outboxDurability.start();
  target?.addEventListener('online', () => void outboxDurability.flush());
  let last = activeViewer();
  sessionStore.subscribe(() => {
    const next = activeViewer();
    if (next === last) return;
    last = next;
    void outboxDurability.start();
  });
}
