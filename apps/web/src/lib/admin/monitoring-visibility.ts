import { useSyncExternalStore } from 'react';

/**
 * **L'ÉCRAN EST-IL VISIBLE ?** (#8876, #6734) — lu, jamais deviné. La santé de la
 * plateforme se relit toute seule, mais seulement tant que quelqu'un la regarde :
 * un onglet en arrière-plan qui frapperait la passerelle toutes les trente secondes
 * mesurerait (et chargerait) un écran que personne ne voit.
 *
 * `useSyncExternalStore` plutôt qu'un état miroir : le drapeau vit HORS de React
 * (`document.visibilityState`), et un miroir se désynchronise le temps d'un rendu.
 */
const subscribe = (onChange: () => void): (() => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

export const useDocumentVisible = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== 'hidden',
    // Rendu serveur : on suppose visible, sans quoi la première peinture n'armerait aucune relecture.
    () => true,
  );
