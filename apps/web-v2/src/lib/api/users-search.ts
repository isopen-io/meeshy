import { decodePerson, type PersonSummary } from './friend-requests';
import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * LE PORT DE LA RECHERCHE DE PERSONNES (#5652, bloc D ; #6363) — `GET
 * /api/v1/directory/people?q=<≥2>&limit=20`
 * (`services/gateway/src/routes/directory/people.ts:88-105`,
 * `fastify.authenticate`), § 3.4 de la spécification. Deux écrans le lisent :
 * « Nouvelle conversation » et l'onglet « Découvrir ».
 *
 * **POURQUOI `/directory/people` ET PAS `/users/search`** (revue #5652). La
 * seconde EXISTE, mais son propre doc-comment la déclare ALIAS en sursis :
 * « elle reste montée le temps que les douze sites iOS et les trois sites web
 * migrent, et jusqu'à extinction des versions installées »
 * (`routes/users/preferences.ts:454-468`). Écrire un client NEUF dessus, c'est
 * inscrire la v3.1 sur la liste des appelants qui retardent son retrait —
 * pour une route dont la réponse est strictement PLUS PAUVRE : son schéma ne
 * déclare PAS `avatar`. La route cible le sert, et pagine par CURSEUR.
 *
 * `q` sous deux caractères rend 400 (`minLength: 2`) — les appelants ne
 * l'interrogent pas sous ce seuil ; ce port ne redouble pas la garde.
 *
 * **Un résultat décodé est une PROJECTION** (#6363). `?expand=presence` n'est
 * pas demandé, et même si une charge portait `isOnline` ou `lastActiveAt`, ils
 * ne passent pas `decodePerson` : la présence d'un inconnu n'est jamais servie
 * au lecteur (loi `resolvePresenceVisibility`), et le client ne peint rien
 * qu'on ne lui a pas servi. Une ligne sans identifiant est écartée.
 */

export type UserSearchResult = PersonSummary;

export async function searchUsers(deps: ConversationsDeps, query: string): Promise<ApiResult<readonly UserSearchResult[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureSearchPeople } = await import('./fixtures-friends');
    return { ok: true, data: fixtureSearchPeople(query) };
  }
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/directory/people?q=${encodeURIComponent(query)}&limit=20`,
  });
  if (!result.ok) return result;
  const people = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const person = decodePerson(raw);
    return person === null ? [] : [person];
  });
  return { ...result, data: people };
}
