import { createStore } from 'zustand/vanilla';

import type { StartCallRequest } from './engine';

/**
 * « APPELER » QUAND LE NAVIGATEUR ATTEND UN GESTE (#8199) — le rappel qu'un
 * onglet ouvert à froid n'a pas pu composer sans toucher. La couche d'appel
 * le montre ; « Appeler » compose dans le geste, « Annuler » l'oublie.
 */
export type CallBackPromptState = { readonly request: StartCallRequest | null };

export const callBackPromptStore = createStore<CallBackPromptState>(() => ({ request: null }));
