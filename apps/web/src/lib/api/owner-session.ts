import { apiConfig } from './config';
import { VIEWER_ID } from './fixtures-base';
import type { Credential } from './http';
import { sessionStore, type SessionState } from './session';

/**
 * **CE QUI ATTEND UN LECTEUR NE PART QUE SOUS SA SESSION** (#9743, revue de
 * sécurité) — un commentaire en file, un téléversement repris, un rejeu : ils
 * ont un PROPRIÉTAIRE (`u_<id>`, la portée des brouillons), et le navigateur
 * peut avoir changé de compte entre le geste et la requête.
 *
 * L'identité et le jeton sont lus dans le MÊME instantané de session : le
 * jeton rendu est celui du propriétaire ou rien. L'appelant le lit dans le
 * tour même où il compose sa requête et le lui IMPOSE (`HttpRequest.credential`)
 * — jamais « vérifier, attendre, puis laisser le transport relire la session ».
 * Autre compte, invité, déconnecté, propriétaire vide : `null`, on n'envoie pas.
 */
export const ownerScopeOf = (userId: string): string => `u_${userId}`;

export function ownerCredentialOf(scope: string, session: SessionState = sessionStore.getState().session): Credential | null {
  if (session.status !== 'authenticated') return null;
  const { id } = session.user;
  if (typeof id !== 'string' || id === '' || ownerScopeOf(id) !== scope) return null;
  if (typeof session.token !== 'string' || session.token === '') return null;
  return { kind: 'registered', token: session.token };
}

export type OwnerCredential = (scope: string) => Credential | null;

/**
 * LE PROPRIÉTAIRE, TEL QUE L'APPLICATION LE CONNAÎT — la session, ou, sur
 * fixtures (aucune session, aucun réseau : le jeton rendu ne voyage jamais),
 * le lecteur de fixture et lui seul.
 */
export const currentOwnerCredential: OwnerCredential = (scope) => {
  if (__FIXTURES__ && apiConfig.source === 'fixtures') return scope === ownerScopeOf(VIEWER_ID) ? { kind: 'registered', token: 'fixtures' } : null;
  return ownerCredentialOf(scope);
};
