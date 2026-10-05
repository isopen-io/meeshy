import { useSyncExternalStore } from 'react';

/**
 * LE MESSAGE LONG DÉPLIÉ DU FIL (#8147) — un seul à la fois.
 *
 * Directive porteur 2026-09-26 : un message long se DÉPLIE sur place (plus
 * de feuille), et le message déplié reçoit l'effet Focal — bloc de verre,
 * loupe, voisins atténués — tant qu'il l'est. Deux lecteurs partagent donc
 * cet état : le texte du message (`LongMessageText`, qui montre l'extrait ou
 * le tout) et l'hôte du fil (`ThreadModes`, qui pose le verre et atténue les
 * voisins). Un `useState` local à la rangée ne pouvait servir ni l'hôte ni la
 * règle « un seul déplié » ; un magasin HORS de React le sert sans qu'aucune
 * rangée voisine ne se rende à nouveau pour rien.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
const state: { unfolded: string | null } = { unfolded: null };

const publish = (next: string | null): void => {
  if (state.unfolded === next) return;
  state.unfolded = next;
  listeners.forEach((listener) => listener());
};

export const readUnfolded = (): string | null => state.unfolded;

export const subscribeUnfolded = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const toggleUnfolded = (messageId: string): void =>
  publish(state.unfolded === messageId ? null : messageId);

export const collapseUnfolded = (): void => publish(null);

/** Ne réveille QUE les rangées dont le verdict bascule — jamais tout le fil. */
export const useIsUnfolded = (messageId: string): boolean =>
  useSyncExternalStore(
    subscribeUnfolded,
    () => state.unfolded === messageId,
    () => false,
  );
