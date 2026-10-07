import { useEffect } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { coqueCourante } from '@/lib/native-shell';

import { captureShield } from './capture-shield';

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * LE FIL ÉCOUTE LES CAPTURES QUE LA COQUE DÉTECTE (#9617) — dans la coque
 * Android qui déclare `MeeshyScreenGuard` seulement ; l'écoute et la file des
 * déclarations se chargent alors à la demande (`screen-capture-reports.ts`,
 * `capture-outbox.ts`). Un navigateur ne détecte aucune capture : rien n'est
 * chargé ni appelé hors coque. La file est propre au lecteur : un second
 * compte sur le même appareil ne rejoue jamais les déclarations du premier.
 */
export function useScreenCaptureReports(conversationId: string, viewerId: string): void {
  useEffect(() => {
    const coque = coqueCourante();
    if (conversationId === '' || viewerId === '' || coque === undefined || captureShield.mode() !== 'guarded') return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    void Promise.all([import('./screen-capture-reports'), import('./capture-outbox')]).then(([reports, outboxes]) => {
      if (!live) return;
      const outbox = outboxes.createCaptureOutbox({
        storage: browserStorage(),
        key: `meeshy.captureOutbox.${viewerId}`,
        now: () => Date.now(),
        send: (job) => reports.sendCaptureJob(apiDeps.transport, captureShield, job),
        schedule: (run, ms) => {
          const timer = setTimeout(run, ms);
          return () => clearTimeout(timer);
        },
      });
      const flushOnline = () => void outbox.flush();
      window.addEventListener('online', flushOnline);
      const stopReports = reports.startCaptureReports({
        coque,
        conversationId,
        collect: () => reports.visibleCaptureSubjects(document, captureShield),
        outbox,
        shield: captureShield,
        newCaptureId: reports.newCaptureId,
      });
      stop = () => {
        stopReports();
        outbox.stop();
        window.removeEventListener('online', flushOnline);
      };
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [conversationId, viewerId]);
}
