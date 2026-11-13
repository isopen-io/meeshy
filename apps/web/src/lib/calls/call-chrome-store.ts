import { type RefObject, useLayoutEffect } from 'react';
import { createStore } from 'zustand/vanilla';

/**
 * **CE QUE L'ÉCRAN D'APPEL ET LA COUCHE D'ENREGISTREMENT SE DISENT** (G1.1, #17536 ; R2.1, #17803 ;
 * `CallChromeElement.recordingStatus` et `CallTopBannerHeightReporter` d'iOS) — les deux vivent dans
 * des arbres séparés (la couche d'enregistrement flotte au-dessus de l'écran comme de sa pastille).
 *
 * - `stowed` : l'écran d'appel le publie, la couche le lit. L'indicateur « Enregistrement en cours »
 *   et son bouton Arrêter repartent avec l'en-tête quand un toucher range tout, ou qu'un mode
 *   (Effets, Montage) l'a masqué ; seule la carte d'accord (G1.6) ne se cache jamais ;
 * - `recordingCard` : la couche le publie, la pile des bandeaux le lit. La hauteur MESURÉE de la carte
 *   d'accord (0 : pas de carte) — la case qu'elle tient dans la pile en dépend, pour que la capture et
 *   le cadre en direct soient repoussés sous elle au lieu de passer dessous ;
 * - `journalReserve` : l'écran le publie, la couche et le pied des sous-titres le lisent (#17932). La place que la colonne du journal prend au bord
 *   de fin (0 : pas de colonne) — la carte d'accord, la capsule et l'avis se centrent sur la scène qu'elle
 *   laisse, pas sur la fenêtre (W1.4, W1.21).
 */
export const callChromeStore = createStore<{ readonly stowed: boolean; readonly recordingCard: number; readonly journalReserve: number }>(() => ({ stowed: false, recordingCard: 0, journalReserve: 0 }));

/**
 * Publie l'état du chrome tant que l'écran d'appel vit ; il le rend quand il part. AVANT la peinture :
 * ce que la couche d'enregistrement centre et le « Journal » actif des sous-titres (#17932) changent dans
 * l'image même où la colonne s'ouvre.
 */
export function usePublishChrome(stowed: boolean, journalReserve = 0): void {
  useLayoutEffect(() => {
    callChromeStore.setState({ stowed, journalReserve });
    return () => callChromeStore.setState({ stowed: false, journalReserve: 0 });
  }, [stowed, journalReserve]);
}

/**
 * Publie la hauteur de la carte d'accord tant qu'elle `reserves` sa case, et la rend (0) quand elle
 * la quitte. Mesurée AVANT la peinture : la pile reçoit la bonne hauteur dans la même image.
 */
export function usePublishRecordingCard(card: RefObject<HTMLElement | null>, reserves: boolean): void {
  useLayoutEffect(() => {
    const element = card.current;
    if (!reserves || element === null) return undefined;
    const publish = () => callChromeStore.setState({ recordingCard: element.offsetHeight });
    publish();
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    watch?.observe(element);
    return () => {
      watch?.disconnect();
      callChromeStore.setState({ recordingCard: 0 });
    };
  }, [reserves]);
}
