import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { emailGate, type EmailGate, type EmailGateReason } from './email-gate';

/**
 * **LE PORTILLON DE LA GARDE DE L'E-MAIL** (#8365) — même doctrine que
 * `invite-gate.ts` : la coquille l'importe en STATIQUE, il ne connaît ni
 * libellé ni réseau. Monté, il s'attache comme présentateur de la demande
 * (`email-gate.ts`) et rend la raison en cours ; c'est cette réponse qui va
 * chercher l'hôte (`lazy()`, `components/shell.tsx`).
 */
export function useEmailGatePresenter(gate: EmailGate = emailGate): EmailGateReason | null {
  useEffect(() => gate.attach(), [gate]);
  return useStore(gate.store, (state) => state.pending?.reason ?? null);
}
