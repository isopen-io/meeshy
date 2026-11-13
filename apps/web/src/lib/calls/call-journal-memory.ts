/**
 * **LE JOURNAL D'UN APPEL RESTE DÉPLIÉ QUAND SA BULLE QUITTE L'ÉCRAN** (#17878, A1.17) — le fil virtualisé
 * (`routes/thread.tsx`) démonte la rangée hors fenêtre : un `useState` local la voyait revenir repliée. La
 * mémoire vit ici, pour la session, et ne retient que des identifiants d'appel (jamais le texte), bornée comme
 * iOS (`BubbleCallJournalMemory`, 32). Android la garde par `rememberSaveable`.
 */
const LIMIT = 32;

type Remembered = { readonly open: boolean; readonly original: boolean };

const remembered = new Map<string, Remembered>();

const write = (callId: string, next: Remembered): void => {
  remembered.delete(callId);
  if (!next.open && !next.original) return;
  remembered.set(callId, next);
  const oldest = remembered.keys().next();
  if (remembered.size > LIMIT && oldest.done !== true) remembered.delete(oldest.value);
};

const read = (callId: string): Remembered => remembered.get(callId) ?? { open: false, original: false };

export const callJournalMemory = {
  isOpen: (callId: string): boolean => read(callId).open,
  isOriginal: (callId: string): boolean => read(callId).original,
  setOpen: (callId: string, open: boolean): void => write(callId, { ...read(callId), open }),
  setOriginal: (callId: string, original: boolean): void => write(callId, { ...read(callId), original }),
  reset: (): void => remembered.clear(),
};
