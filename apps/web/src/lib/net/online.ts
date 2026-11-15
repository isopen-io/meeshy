import { useSyncExternalStore } from 'react';

/**
 * L'ÉTAT DU RÉSEAU — lu, jamais deviné.
 *
 * `useSyncExternalStore` plutôt qu'un `useState` + `useEffect` : le drapeau
 * vit HORS de React (`navigator.onLine`), et c'est exactement le cas que cette
 * primitive existe pour servir. Un état miroir se désynchronise le temps d'un
 * rendu — sur un réseau qui coupe toutes les minutes, ce temps-là arrive.
 *
 * CE QUE `navigator.onLine` VAUT, ET CE QU'IL NE VAUT PAS. `false` est FIABLE :
 * le système sait qu'aucune interface n'est disponible. `true` ne l'est pas —
 * il dit « une interface existe », pas « la passerelle répond » ; un portail
 * captif ou une antenne saturée le laissent à `true`. On s'en sert donc pour
 * ANNONCER une coupure certaine, jamais pour promettre que l'envoi passera.
 * La confirmation reste au transport (#5493).
 */
const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

export const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // Rendu SERVEUR (le préchauffage institutionnel) : on suppose en ligne,
    // sans quoi chaque page préchauffée porterait un bandeau de coupure figé
    // dans son HTML.
    () => true,
  );
