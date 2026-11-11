import { useEffect } from 'react';
import { createStore } from 'zustand/vanilla';

/**
 * **LES COMMANDES SONT-ELLES RANGÉES ?** (G1.1, #17536 ; `CallChromeElement.recordingStatus`
 * d'iOS) — l'écran d'appel le publie, ce qui vit HORS de lui le lit. L'indicateur
 * « Enregistrement en cours » et son bouton Arrêter sont dans la couche d'enregistrement,
 * au-dessus de l'écran : un toucher qui range tout les range aussi (seule la carte
 * d'accord, G1.6, ne se cache jamais).
 */
export const callChromeStore = createStore<{ readonly stowed: boolean }>(() => ({ stowed: false }));

/** Publie l'état du chrome tant que l'écran d'appel vit ; il le rend quand il part. */
export function usePublishChrome(stowed: boolean): void {
  useEffect(() => callChromeStore.setState({ stowed }), [stowed]);
  useEffect(() => () => callChromeStore.setState({ stowed: false }), []);
}
