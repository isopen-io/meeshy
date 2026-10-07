import { useEffect } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { coqueCourante } from '@/lib/native-shell';

import { captureShield } from './capture-shield';

/**
 * LE FIL ÉCOUTE LES CAPTURES QUE LA COQUE DÉTECTE (#9617) — dans la coque
 * Android qui déclare `MeeshyScreenGuard` seulement ; le module d'écoute se
 * charge alors à la demande (`screen-capture-reports.ts`). Un navigateur ne
 * détecte aucune capture : rien n'est chargé ni appelé hors coque.
 */
export function useScreenCaptureReports(conversationId: string): void {
  useEffect(() => {
    const coque = coqueCourante();
    if (conversationId === '' || coque === undefined || captureShield.mode() !== 'guarded') return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    void import('./screen-capture-reports').then((reports) => {
      if (!live) return;
      stop = reports.startCaptureReports({
        coque,
        conversationId,
        collect: () => reports.visibleCaptureSubjects(document, captureShield),
        send: (declaration) => reports.sendCaptureDeclaration(apiDeps.transport, declaration),
        newCaptureId: reports.newCaptureId,
        every: (run, ms) => {
          const timer = setInterval(run, ms);
          return () => clearInterval(timer);
        },
      });
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [conversationId]);
}
