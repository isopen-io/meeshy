import type { ApiFailure } from './http';

/**
 * LES MOTIFS QU'UN LIEN REÇU PARTAGE AVEC TOUT APPEL (#6714, #6715).
 *
 * Chaque page ouverte depuis un lien — lien suivi, suppression de compte,
 * changement d'adresse, désabonnement — a ses refus PROPRES (expiré, déjà
 * servi, adresse prise…) et trois refus COMMUNS : pas de réseau, trop de
 * tentatives, passerelle muette ou en panne. Les trois communs se lisent ici,
 * une fois, pour qu'aucune page ne confonde un réseau coupé avec un lien mort.
 *
 * **Hors ligne = aucune réponse ET aucun code.** Le transport rend `status: 0`
 * aussi pour un délai dépassé (`TIMEOUT`) ou une annulation (`ABORTED`) : une
 * passerelle qui accepte la connexion puis se tait n'est pas un réseau coupé,
 * et « vérifiez votre connexion » y serait un conseil faux.
 */

export type ReachFailure = 'offline' | 'rate-limited' | 'unavailable';

export const isUnreachable = (failure: ApiFailure): boolean => failure.status === 0 && failure.code === undefined;

export function reachFailureOf(failure: ApiFailure): ReachFailure {
  if (isUnreachable(failure)) return 'offline';
  if (failure.status === 429) return 'rate-limited';
  return 'unavailable';
}

/**
 * Une réponse 200 que le décodeur ne sait pas lire est un ÉCHEC nommé, jamais
 * une valeur devinée. `status: 0` avec un code : ni hors ligne (il y a eu une
 * réponse) ni un statut HTTP inventé.
 */
export const unreadableFailure = (what: string): ApiFailure => ({ ok: false, status: 0, error: `${what} illisible`, code: 'UNREADABLE' });
