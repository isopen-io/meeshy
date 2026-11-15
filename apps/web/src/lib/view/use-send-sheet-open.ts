import { useStore } from 'zustand/react';

import { sendSheetStore } from '@/lib/send/send-sheet-store';

/**
 * **LA FEUILLE D'ENVOI EST-ELLE OUVERTE ?** (#8884) — la question que posent les
 * plein écrans qui lui cèdent la place : la visionneuse de médias lève
 * l'inertie de `#root` (la feuille y est montée par la coquille), le lecteur de
 * stories met la lecture en attente. Une lecture du magasin, pas un second
 * état : il n'existe qu'un « ouvert ».
 */
export function useSendSheetOpen(): boolean {
  return useStore(sendSheetStore, (state) => state.request !== null);
}
