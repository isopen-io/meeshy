import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import { parseServedProfileDecor, type ProfileDecorRef, type ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * **LE DÉCOR DE PROFIL** (#10632, § 5.5 et § 10.2) — le contour d'avatar et la
 * bannière de design équipés, visibles des autres.
 *
 *   - lecture : `profileDecor` sur `GET /me` et sur le profil public. Un
 *     ANCIEN serveur ne le sert pas : `undefined`, jamais un décor vide —
 *     « le serveur ne sait pas » et « rien d'équipé » sont deux réponses, et
 *     seule la seconde ouvre les sélecteurs ;
 *   - écriture : `PUT /me/profile-decor`, `{ avatarRing?, banner? }`, champ
 *     absent = inchangé, `null` = retiré.
 */

export type ProfileDecorWrite = { readonly avatarRing?: ProfileDecorRef | null; readonly banner?: ProfileDecorRef | null };

/** Le décor servi par une charge `/me` ou profil public ; `undefined` quand la clé manque (ancien serveur). */
export function readProfileDecor(raw: unknown): ServedProfileDecor | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const served = (raw as Readonly<Record<string, unknown>>)['profileDecor'];
  return served === undefined || served === null ? undefined : parseServedProfileDecor(served);
}

export async function putProfileDecor(deps: ConversationsDeps, body: ProfileDecorWrite): Promise<ApiResult<ServedProfileDecor>> {
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: meEndpoints.profileDecor, body });
  return result.ok ? { ...result, data: parseServedProfileDecor(result.data) } : result;
}
