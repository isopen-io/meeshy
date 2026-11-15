import { useCallback, useRef } from 'react';

import type { Message } from '@/lib/api/types';

import { imageableOf, type MessageMenuContext } from './message-actions';
import type { MessageExportRequest } from './use-message-menu';

/**
 * « IMAGER » UN MESSAGE DEPUIS LA VISIONNEUSE DU FIL (#16333) — la baguette du
 * rail fait du message regardé, pièce comprise, la MÊME carte image que
 * l'entrée « Imager » de « Plus… » : même loi (`imageableOf`, lue avec les
 * verdicts du lecteur), même feuille (`setExportFor`, montée par
 * `thread-sheets.tsx`).
 *
 * `null` quand le geste n'aurait pas d'effet (loi 4) : un message protégé, ou
 * un message que le fil n'a pas chargé — la visionneuse parcourt l'index de
 * TOUTE la conversation, et la feuille ne peint que ce que le fil tient.
 *
 * Le rappel rendu est STABLE (`ThreadMediaContext` est lu par chaque grille du
 * fil) : les messages se lisent par une référence, au moment du geste.
 */
export type MessageImagerOf = (message: Message) => (() => void) | null;

export function useMessageImager(params: {
  readonly messages: readonly Message[];
  readonly menuContextOf: (message: Message) => MessageMenuContext;
  readonly setExportFor: (request: MessageExportRequest | null) => void;
}): MessageImagerOf {
  const { menuContextOf, setExportFor } = params;
  const messages = useRef(params.messages);
  messages.current = params.messages;
  return useCallback(
    (message: Message) => {
      const held = messages.current.find((candidate) => candidate.id === message.id);
      if (held === undefined || !imageableOf(menuContextOf(held))) return null;
      return () => setExportFor({ messageId: held.id, quick: false });
    },
    [menuContextOf, setExportFor],
  );
}
