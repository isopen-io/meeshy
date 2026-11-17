import { currentCredential, currentIdentity, httpTransport } from './client';
import type { ConversationsDeps } from './conversations';
import { apiDeps, postMediaUploadDeps } from './deps';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
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

/** Chaque requête porte l'identité qui a lancé l'opération, et n'est émise que si elle est encore la courante. */
export function boundToIdentity(transport: HttpTransport, identity: string | null): HttpTransport {
  const request = <T,>(req: HttpRequest): Promise<ApiResult<T>> => transport.request<T>({ ...req, expectedIdentity: identity });
  return Object.assign(({ method, path, body }: HttpRequest) => request({ method, path, body }), { request }) as HttpTransport;
}

export function ownedApiDeps(owner: string | null = currentIdentity()): ConversationsDeps {
  return { ...apiDeps, transport: boundToIdentity(httpTransport, owner) };
}

export function ownedPostMediaUploadDeps(owner: string | null = currentIdentity()): PostMediaUploadDeps {
  return { ...postMediaUploadDeps, credential: () => (currentIdentity() === owner ? currentCredential() : null) };
}
