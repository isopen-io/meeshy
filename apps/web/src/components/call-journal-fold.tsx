import { lazy } from 'react';

import { LEAVING } from '@/lib/calls/call-pill-motion';
import { useJournalFold } from '@/lib/calls/use-journal-fold';
import { suspendForCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE JOURNAL DÉPLIÉ DANS LA CARTE D'APPEL (#17878, A1.4) — son fondu glissé (`useJournalFold`) a son chunk,
 * que la carte du fil n'atteint que par `import()` au toucher : la première peinture et la table de
 * préchargement du fil n'en paient rien, et le journal garde le sien (`call_transcript_panel`). La carte
 * demande les deux ensemble ; le journal attend son chunk et le catalogue des contrôles d'appel AVANT de se
 * monter, pour arriver en fondu avec ses mots plutôt que de les faire surgir après. Il reste monté le temps
 * de son départ.
 */
const CallTranscriptPanel = lazy(() => import('./call-transcript-panel').then((module) => ({ default: module.CallTranscriptPanel })));

type JournalFoldProps = {
  readonly id: string;
  readonly callId: string;
  readonly open: boolean;
  /** Remontée par le fil virtualisé avec son journal déjà déplié (`call-journal-memory.ts`) : rien à rejouer. */
  readonly restored: boolean;
  readonly language: InterfaceLanguage;
  readonly original: boolean;
  readonly onOriginalChange: (original: boolean) => void;
};

export function CallJournalFold({ id, callId, open, restored, language, original, onOriginalChange }: JournalFoldProps) {
  suspendForCallControlsCatalog(language);
  const fold = useJournalFold<HTMLDivElement>(open, restored);
  if (!fold.mounted) return null;
  return (
    <div ref={fold.ref} id={id} className="flex w-full" data-call-journal-fold="" {...(open ? {} : LEAVING)}>
      <CallTranscriptPanel callId={callId} language={language} original={original} onOriginalChange={onOriginalChange} />
    </div>
  );
}
