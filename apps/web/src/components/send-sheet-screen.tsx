import { useMemo } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';
import { createSendSheetPorts } from '@/lib/send/send-sheet-ports';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useViewer } from '@/lib/view/use-viewer';

import { SendSheet } from './send-sheet';

/**
 * LA FEUILLE D'ENVOI BRANCHÉE (#8884) — ce que `SendSheetHost` charge à la
 * demande : le lecteur (`useViewer`), la langue d'origine de ce que l'envoi
 * compose (rang 1 du Prisme du lecteur, comme le composeur quand rien n'est
 * encore tapé) et les VRAIS ports (`createSendSheetPorts`).
 */
export function SendSheetScreen({ request, onClose }: { readonly request: SendSheetRequest; readonly onClose: () => void }) {
  const viewer = useViewer();
  const { locale } = useReaderLanguages();
  const ports = useMemo(() => createSendSheetPorts({ language: locale }), [locale]);
  return (
    <SendSheet
      request={request}
      viewerId={viewer.id ?? ''}
      language={currentInterfaceLanguage()}
      contentLanguage={locale}
      ports={ports}
      onClose={onClose}
    />
  );
}
