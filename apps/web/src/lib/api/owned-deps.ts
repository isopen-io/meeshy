import { currentIdentity } from './client';
import type { ConversationsDeps } from './conversations';
import { apiDeps, postMediaUploadDeps } from './deps';
import { boundToIdentity } from './http';
import type { PostMediaUploadDeps } from './post-media-upload';

/**
 * LES DÉPENDANCES D'UNE OPÉRATION EN PLUSIEURS REQUÊTES (audit #19352, X1) —
 * liées à l'identité qui parle au moment où l'opération commence. Téléverser
 * puis envoyer puis publier : si un autre onglet change le compte de
 * l'appareil entre deux étapes, aucune étape suivante ne part sous le nouveau
 * compte — le transport JSON refuse d'émettre (`IDENTITY_CHANGED`,
 * `http.ts`), le client TUS ne présente aucun jeton. Hors de la première
 * peinture : seuls les envois le chargent.
 */
export function ownedApiDeps(owner: string | null = currentIdentity()): ConversationsDeps {
  return ownedDepsOf(apiDeps, owner);
}

/** Les mêmes, pour des dépendances INJECTÉES (un écran qui reçoit les siennes) : leur transport ne parle qu'au nom de `owner`. */
export function ownedDepsOf(deps: ConversationsDeps, owner: string | null = currentIdentity()): ConversationsDeps {
  return { ...deps, transport: boundToIdentity(deps.transport, owner) };
}

/** Un téléversement par reprise est lui-même une opération en plusieurs requêtes : la création, puis chaque tranche. */
export function ownedUploadDeps(deps: PostMediaUploadDeps, owner: string | null = currentIdentity()): PostMediaUploadDeps {
  const identityChanged = (): boolean => currentIdentity() !== owner;
  return { ...deps, credential: () => (identityChanged() ? null : deps.credential()), identityChanged };
}

export function ownedPostMediaUploadDeps(owner: string | null = currentIdentity()): PostMediaUploadDeps {
  return ownedUploadDeps(postMediaUploadDeps, owner);
}
