import type { ApiResult } from '@/lib/api/http';

/**
 * CE QU'UN TAP SUR UNE PERSONNE PRODUIT (#6705, revue #5652) — la création rend
 * un `ApiResult`, jamais une exception. Deux issues seulement : ouvrir le fil
 * rendu (201 créé, ou 200 quand la conversation directe existait déjà — la
 * passerelle la rouvre plutôt que d'en créer une seconde), ou DIRE pourquoi il
 * ne s'ouvre pas.
 *
 * Hors ligne, le message dit la cause et le geste qui débloque. Il ne promet
 * pas que « la conversation s'ouvrira à la reconnexion » : aucune file ne rejoue
 * une création, et une promesse sans mécanisme est un contrôle qui ment.
 */

export const CREATION_FAILED = 'Impossible d’ouvrir cette conversation — réessayez dans un instant.';
export const CREATION_OFFLINE = 'Hors ligne — reconnectez-vous puis touchez de nouveau la personne.';

export type CreationOutcome =
  | { readonly kind: 'open'; readonly conversationId: string }
  | { readonly kind: 'failure'; readonly message: string };

export function creationOutcomeOf(params: {
  readonly result: ApiResult<{ readonly id: string }>;
  readonly online: boolean;
}): CreationOutcome {
  if (params.result.ok) return { kind: 'open', conversationId: params.result.data.id };
  return { kind: 'failure', message: params.online ? CREATION_FAILED : CREATION_OFFLINE };
}
