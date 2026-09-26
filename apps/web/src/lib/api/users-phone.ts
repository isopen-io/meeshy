import type { ConversationsDeps } from './conversations';
import { decodePerson, type PersonSummary } from './friend-requests';
import type { ApiResult } from './http';

/**
 * **TROUVER UN COMPTE PAR SON NUMÉRO** (#6454) — `GET /api/v1/users/phone/:phone`
 * (`services/gateway/src/routes/users/profile-lookups.ts`, authentifiée,
 * limitée en débit, bloqués écartés), la porte de `KeypadViewModel.lookupByPhone`.
 *
 * **404 et 400 sont des RÉPONSES** : « aucun compte ne porte ce numéro » et
 * « ce n'est pas un numéro » sont les issues normales d'une composition, pas
 * des pannes — iOS les avale de même (`try?`). Un 429 ou un 5xx restent des
 * pannes, que l'écran dit.
 *
 * **Une personne décodée est une PROJECTION** : `decodePerson` ne garde que
 * l'identifiant, le pseudo, le nom et l'avatar. La présence servie
 * (`gateProfilePresence`) et le numéro n'entrent ni dans le cache persisté ni
 * dans l'écran.
 */
export async function lookupUserByPhone(deps: Pick<ConversationsDeps, 'source' | 'transport'>, phone: string): Promise<ApiResult<PersonSummary | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePhoneLookup } = await import('./fixtures-calls');
    return { ok: true, data: fixturePhoneLookup(phone) };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `/api/v1/users/phone/${encodeURIComponent(phone)}` });
  if (!result.ok) return result.status === 404 || result.status === 400 ? { ok: true, data: null } : result;
  return { ok: true, data: decodePerson(result.data) };
}
