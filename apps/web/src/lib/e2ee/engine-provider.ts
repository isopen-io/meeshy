/**
 * LA PORTE DU MOTEUR (#14592) : le web n'embarque AUCUN moteur cryptographique
 * tant que le choix de la bibliothèque n'est pas tranché (licence : libsignal est
 * AGPL-3.0, revue des alternatives en cours). Sans moteur enregistré, rien ne
 * s'enrôle, rien ne se chiffre, et toutes les portes d'écriture restent fermées.
 */
import type { E2EECryptoEngine } from './engine';

export class E2EEEngineUnavailable extends Error {
  constructor() {
    super('e2ee: aucun moteur cryptographique dans ce navigateur');
    this.name = 'E2EEEngineUnavailable';
  }
}

let loader: (() => Promise<E2EECryptoEngine>) | null = null;

/** Enregistre le chargeur (à la demande) du moteur retenu. */
export function registerE2EEEngine(load: () => Promise<E2EECryptoEngine>): void {
  loader = load;
}

/** Un moteur est-il disponible ? Lu par les portes : faux tant qu'aucun n'est enregistré. */
export const e2eeEngineAvailable = (): boolean => loader !== null;

export function loadE2EEEngine(): Promise<E2EECryptoEngine> {
  return loader === null ? Promise.reject(new E2EEEngineUnavailable()) : loader();
}
