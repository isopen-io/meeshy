import type { UnifiedAuthContext } from '../../middleware/auth';

/**
 * QUI demande le rattrapage — et la seule forme qui rende l'erreur du correctif
 * naïf inexprimable. Extrait de `routes/sync.ts` (issue #4171, critère 5g) ;
 * partagé par les QUATRE collections, qui en dérivent toutes leur RLS.
 *
 * `authContext.userId` porte un `User.id` pour un compte et un `Participant.id`
 * pour une session anonyme : la MÊME variable, deux colonnes différentes. La
 * RLS de `/sync` filtre `Participant.userId`, qui est NULL pour tout anonyme —
 * ouvrir la route sans toucher à la clause aurait rendu des streams vides, sans
 * erreur ni log, c'est-à-dire un rattrapage qui ne rattrape rien. Une union
 * discriminée oblige chaque lecteur à dire laquelle des deux colonnes il
 * interroge.
 */
export type SyncIdentity =
  | { readonly kind: 'user'; readonly userId: string }
  | { readonly kind: 'anonymous'; readonly participantId: string };

/**
 * Résout l'identité depuis l'authContext du middleware unifié, ou `null` quand
 * une session anonyme n'a PAS de `participantId` interrogeable.
 *
 * Une session anonyme SANS `participantId` n'a pas d'identité interrogeable
 * ici. Retomber sur la branche `userId` lui servirait des streams vides —
 * une réponse 200 qui affirme « rien n'a changé » à qui n'a rien pu être
 * demandé. Le middleware pose toujours ce champ ; c'est précisément
 * pourquoi son absence est un refus (401, posé par l'appelant sur `null`) et
 * non un cas nominal.
 */
export function resolveSyncIdentity(
  authContext: Pick<UnifiedAuthContext, 'type' | 'userId' | 'participantId'>,
): SyncIdentity | null {
  if (authContext.type === 'anonymous') {
    return authContext.participantId
      ? { kind: 'anonymous', participantId: authContext.participantId }
      : null;
  }
  return authContext.userId ? { kind: 'user', userId: authContext.userId } : null;
}
